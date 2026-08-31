<#
.SYNOPSIS
  Register (or remove) the Windows Scheduled Task that keeps the news collector
  running, so the history this project needs actually accrues.

.DESCRIPTION
  Everything downstream of the collector — the story pipeline, the pin map, and
  above all the "what's on fire" scoring — measures change over time. None of it
  can be computed from a single capture. As of writing, `rank_snapshots` holds
  two captures taken five hours apart, which is not a curve, and `yt_stats` is
  empty. The gap is not the code. It is that nothing has been running.

  `pnpm news:watch` solves this only while a terminal stays open. This registers
  a task instead, so the loop survives a closed window, a reboot and a logout.

  WHY `cycle` AND NOT `watch`:
  a scheduled `cycle` is a series of short independent runs, so a crash costs
  one run rather than the loop. The scheduler becomes the clock, which means the
  cadence lives here — in the -Every parameter — rather than in
  scripts/news/sources.mjs CADENCE, which then only governs `news:watch`.

  WHY THE WORKING DIRECTORY MATTERS:
  scripts/lib/http.mjs resolves its response cache relative to the current
  directory. A task started anywhere else would scatter `.cache/scrape` around
  the disk and lose its request throttling. The task below pins the directory to
  the repository root.

.PARAMETER Every
  Minutes between runs. 15 is the default and the recommended value: it matches
  the sitemap window that Lokmat rotates articles out of, and puts the YouTube
  pass at roughly 1,500 quota units a day against an allowance of 10,000.

.PARAMETER Remove
  Unregister the task and exit.

.PARAMETER Status
  Report whether the task exists, when it last ran, and what it returned.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\news\schedule-windows.ps1
  powershell -ExecutionPolicy Bypass -File scripts\news\schedule-windows.ps1 -Status
  powershell -ExecutionPolicy Bypass -File scripts\news\schedule-windows.ps1 -Remove
#>
[CmdletBinding()]
param(
  [int]$Every = 15,
  [switch]$Remove,
  [switch]$Status
)

$ErrorActionPreference = "Stop"

$TaskName = "MaharashtraIsBuilding-NewsCollector"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$LogFile = Join-Path $RepoRoot ".data\collector.log"

if ($Status) {
  $task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  if (-not $task) {
    Write-Host "Not registered. Run this script with no arguments to create it."
    exit 0
  }
  $info = Get-ScheduledTaskInfo -TaskName $TaskName
  Write-Host "Task        $TaskName"
  Write-Host "State       $($task.State)"
  Write-Host "Last run    $($info.LastRunTime)   result $($info.LastTaskResult)"
  Write-Host "Next run    $($info.NextRunTime)"
  Write-Host "Log         $LogFile"
  exit 0
}

if ($Remove) {
  # schtasks, not Unregister-ScheduledTask, for the same reason registration
  # uses it: the CIM provider denies writes to a non-administrator account.
  & schtasks.exe /Delete /TN $TaskName /F 2>&1 | Out-Null
  Write-Host "Removed $TaskName. Collection has stopped; the history stops with it."
  exit 0
}

$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) { throw "node is not on PATH — cannot schedule a task that would fail on every run." }

New-Item -ItemType Directory -Force -Path (Split-Path $LogFile) | Out-Null

# THE RUN MUST BE INVISIBLE, AND THAT IS A CORRECTNESS REQUIREMENT.
#
# A task whose action is cmd.exe (or node, or powershell without -WindowStyle
# Hidden) pops a console window on the desktop every fifteen minutes. Anyone
# sane closes it. Closing it sends the process a console-close event and the run
# dies mid-flight with 0xC000013A (STATUS_CONTROL_C_EXIT), which is how this
# collector spent its first hour: every run reached `rank` or `youtube` and was
# killed there, leaving a torn half-capture and a `^C` in the log.
#
# It cost an hour of misdiagnosis because the symptom implicates everything
# except the real cause — the machine, task privileges, the scheduling engine —
# and a `ping` probe registered as a task "failed" exactly the same way, for
# exactly the same reason. If a future run dies at 0xC000013A, suspect a window
# before suspecting Windows.
#
# So the action is wscript.exe running a generated one-line VBScript, whose only
# job is `.Run(cmd, 0, True)`: 0 for a hidden window, True to wait so the task's
# recorded exit code is the collector's own. Windows offers no other way to
# start a console program with no console from a non-elevated task — the
# alternative, "run whether the user is logged on or not", needs a privilege
# this account does not have.
#
# `>>` with `2>&1` sends stdout and stderr to the same log: a task's output is
# otherwise discarded, and a pass that has been failing silently for a week is
# indistinguishable from a week in which nothing happened. With the window gone,
# that log is now the ONLY way to see this thing work — check it, not the
# desktop.
$LauncherFile = Join-Path $RepoRoot ".data\run-collector.vbs"

# Built with Chr(34) rather than escaped quotes because the command nests three
# levels of them — VBScript's, cmd's `/c "..."` wrapper, and one pair around
# each of the two paths, both of which need them ("Program Files", "dev-work").
$vbs = @"
' GENERATED by scripts/news/schedule-windows.ps1 - edits here are overwritten.
' Runs one collector cycle with no console window. See that script for why the
' window is not merely untidy but fatal: closing it kills the run.
q = Chr(34)
cmd = "cmd /c " & q & q & "$node" & q & " scripts\news\run.mjs cycle >> " & q & "$LogFile" & q & " 2>&1" & q
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = "$RepoRoot"
WScript.Quit sh.Run(cmd, 0, True)
"@
Set-Content -Path $LauncherFile -Value $vbs -Encoding ASCII

# ---------------------------------------------------------------------------
# REGISTERED THROUGH schtasks.exe /Create /XML, NOT Register-ScheduledTask.
#
# Register-ScheduledTask writes through the Root/Microsoft/Windows/TaskScheduler
# CIM provider, and on an ordinary non-administrator account that provider
# answers "Access is denied" (HRESULT 0x80070005) to any write, however modest
# the task. schtasks.exe drives the Task Scheduler COM API directly and
# registers the identical task, as the current user, without elevation.
# Measured both ways on this machine: the CIM call fails, the schtasks call
# succeeds. Reads are unaffected, so -Status below still uses Get-ScheduledTask.
#
# The price of the swap is writing the settings as XML by hand instead of
# assembling them with New-ScheduledTaskSettingsSet. Every element below is
# load-bearing and says why inline — none of it is boilerplate to trim.
# ---------------------------------------------------------------------------

$argument = [Security.SecurityElement]::Escape("""$LauncherFile""")
$start = (Get-Date).AddMinutes(1).ToString("yyyy-MM-ddTHH:mm:ss")
$interval = "PT${Every}M"

# Ten years, not [TimeSpan]::MaxValue. MaxValue is the obvious way to say
# "forever" and the way that fails: it serialises to P99999999DT23H59M59S, which
# Task Scheduler rejects outright as "a value which is incorrectly formatted or
# out of range" — leaving no task at all, behind an error that names the
# duration rather than the cause. Ten years is forever for a news collector.
$duration = "P3650D"

$xml = @"
<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.3" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Description>Collects Marathi news and YouTube view snapshots for maharashtra-is-building. Observations only; nothing here scores anything.</Description>
  </RegistrationInfo>
  <Triggers>
    <!-- ONE TRIGGER, AND DELIBERATELY NOT A LOGON TRIGGER.
         A <LogonTrigger> carrying no <UserId> means "when ANY user signs in",
         which the scheduler classes as privileged and refuses with "Access is
         denied" on a non-administrator account — measured here by registering
         the same task with each trigger in turn: the time trigger succeeds, the
         logon trigger alone fails. It was redundant regardless. A repeating
         time trigger resumes its schedule across a reboot on its own, and
         StartWhenAvailable below runs the capture that the downtime missed. -->
    <TimeTrigger>
      <Enabled>true</Enabled>
      <StartBoundary>$start</StartBoundary>
      <Repetition>
        <Interval>$interval</Interval>
        <Duration>$duration</Duration>
        <StopAtDurationEnd>false</StopAtDurationEnd>
      </Repetition>
    </TimeTrigger>
  </Triggers>
  <!-- No <Principals> block on purpose. Naming a UserId here — even this
       account's own name — is a request to create a task that runs AS that
       user, which the scheduler treats as a privileged operation and refuses
       with "Access is denied" for a non-administrator. Omitting the block
       makes schtasks register the task under the invoking account, which is
       the account wanted anyway. -->
  <Settings>
    <!-- Laptop reality: both of these default to true, which refuses to start
         the task on battery and kills it the moment the charger comes out.
         That would punch holes in every curve on days away from a desk. -->
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <!-- IgnoreNew: a slow run must never have a second copy started on top of
         it. Two collectors writing one SQLite file is the single way this
         arrangement can corrupt data rather than merely miss some. -->
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <!-- Catch up if the machine was asleep or off at the appointed minute. -->
    <StartWhenAvailable>true</StartWhenAvailable>
    <!-- A run hung for half an hour is not going to finish; killing it frees
         the next one, which is worth more than the stuck one's output. -->
    <ExecutionTimeLimit>PT30M</ExecutionTimeLimit>
    <RestartOnFailure>
      <Interval>PT5M</Interval>
      <Count>2</Count>
    </RestartOnFailure>
    <IdleSettings>
      <StopOnIdleEnd>false</StopOnIdleEnd>
      <RestartOnIdle>false</RestartOnIdle>
    </IdleSettings>
    <AllowHardTerminate>true</AllowHardTerminate>
    <AllowStartOnDemand>true</AllowStartOnDemand>
    <Enabled>true</Enabled>
    <Hidden>false</Hidden>
    <RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable>
    <WakeToRun>false</WakeToRun>
    <Priority>7</Priority>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>wscript.exe</Command>
      <Arguments>$argument</Arguments>
      <!-- scripts/lib/http.mjs resolves its response cache relative to the
           current directory. Started anywhere else the task would scatter
           .cache/scrape around the disk and lose its request throttling. -->
      <WorkingDirectory>$RepoRoot</WorkingDirectory>
    </Exec>
  </Actions>
</Task>
"@

# schtasks reads the file as UTF-16, matching the declaration above.
$xmlFile = Join-Path ([IO.Path]::GetTempPath()) "$TaskName.xml"
[IO.File]::WriteAllText($xmlFile, $xml, [Text.Encoding]::Unicode)
try {
  $created = & schtasks.exe /Create /TN $TaskName /XML $xmlFile /F 2>&1
  if ($LASTEXITCODE -ne 0) { throw "schtasks /Create failed: $created" }
} finally {
  Remove-Item $xmlFile -ErrorAction SilentlyContinue
}

Write-Host "Registered $TaskName — every $Every minutes, starting in about a minute."
Write-Host "  repo   $RepoRoot"
Write-Host "  log    $LogFile"
Write-Host ""
Write-Host "Check it with:   powershell -ExecutionPolicy Bypass -File scripts\news\schedule-windows.ps1 -Status"
Write-Host "Then, in a few hours:   pnpm news:stats"
