<#
.SYNOPSIS
  Register (or remove) the Windows Scheduled Tasks that keep the news collector
  and the story pipeline running, so the history this project needs actually
  accrues and the pin map stays inside its own tightest window.

.DESCRIPTION
  Everything downstream of the collector — the story pipeline, the pin map, and
  above all the "what's on fire" scoring — measures change over time. None of it
  can be computed from a single capture. As of writing, `rank_snapshots` holds
  two captures taken five hours apart, which is not a curve, and `yt_stats` is
  empty. The gap is not the code. It is that nothing has been running.

  `pnpm news:watch` solves this only while a terminal stays open. This registers
  tasks instead, so the loops survive a closed window, a reboot and a logout.

  TWO TASKS, AND WHY THE SECOND ONE EXISTS:
  the collector (`news:cycle`) and the story pipeline (`news:stories`) are
  separate clocks because they cost different things — the collector is free
  HTTP, the story pass makes one model call per candidate group. For a while
  only the collector was scheduled, and the consequence was not a visible
  failure but a silent one: `news.db` ran on to the present while `stories.db`
  stayed frozen at the last hand-run. Because `loadStories` filters threads on
  `last_at` and deliberately does NOT widen its window the way `loadNewsMap`
  does, pin mode went empty from the tightest window inward — 0 pins at 24h
  while the 48h window still showed 18 — with every article present and correct
  underneath it. A stale derived store looks exactly like a broken filter.

  So the story pass gets its own trigger here rather than being appended to
  `cycle()`. Appending it would tie a paid pass to a free one's 15-minute
  cadence, and a failure in the model call would take the collector's run with
  it.

  WHY `cycle` AND NOT `watch`:
  a scheduled `cycle` is a series of short independent runs, so a crash costs
  one run rather than the loop. The scheduler becomes the clock, which means the
  cadence lives here — in the -Every parameter — rather than in
  scripts/news/sources.mjs CADENCE, which then only governs `news:watch`.

  WHY THE WORKING DIRECTORY MATTERS:
  scripts/lib/http.mjs resolves its response cache relative to the current
  directory. A task started anywhere else would scatter `.cache/scrape` around
  the disk and lose its request throttling. The tasks below pin the directory to
  the repository root.

.PARAMETER Every
  Minutes between collector runs. 15 is the default and the recommended value:
  it matches the sitemap window that Lokmat rotates articles out of, and puts
  the YouTube pass at roughly 1,500 quota units a day against an allowance of
  10,000.

.PARAMETER StoryEvery
  Minutes between story-pipeline runs. 120 is the default, and it is chosen
  against the read side rather than plucked: the tightest window the map offers
  is 24 hours, so any cadence comfortably inside that keeps pin mode populated,
  and two hours leaves the pins at most that stale against a corpus that gains
  roughly 200 articles a day.

  It is affordable at that rate because `label_cache` in
  scripts/news/stories/db.mjs is content-addressed on model-plus-prompt and is
  NOT run-scoped. A re-run over the same fortnight re-sends nothing it has
  already asked; only genuinely new groups — and groups that gained an article,
  which changes the prompt — reach the API. The cost of a run is therefore set
  by what the newsroom filed since the last one, not by the size of the window.

.PARAMETER Remove
  Unregister both tasks and exit.

.PARAMETER Status
  Report, for each task, whether it exists, when it last ran, and what it
  returned.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\news\schedule-windows.ps1
  powershell -ExecutionPolicy Bypass -File scripts\news\schedule-windows.ps1 -Status
  powershell -ExecutionPolicy Bypass -File scripts\news\schedule-windows.ps1 -Remove
#>
[CmdletBinding()]
param(
  [int]$Every = 15,
  [int]$StoryEvery = 120,
  [switch]$Remove,
  [switch]$Status
)

$ErrorActionPreference = "Stop"

$CollectorTask = "MaharashtraIsBuilding-NewsCollector"
$StoryTask = "MaharashtraIsBuilding-NewsStories"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$LogFile = Join-Path $RepoRoot ".data\collector.log"
$StoryLogFile = Join-Path $RepoRoot ".data\stories.log"

if ($Status) {
  $found = $false
  foreach ($entry in @(, @($CollectorTask, $LogFile)) + @(, @($StoryTask, $StoryLogFile))) {
    $name = $entry[0]
    $log = $entry[1]
    $task = Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
    if (-not $task) {
      Write-Host "Task        $name"
      Write-Host "State       not registered"
      Write-Host ""
      continue
    }
    $found = $true
    $info = Get-ScheduledTaskInfo -TaskName $name
    Write-Host "Task        $name"
    Write-Host "State       $($task.State)"
    Write-Host "Last run    $($info.LastRunTime)   result $($info.LastTaskResult)"
    Write-Host "Next run    $($info.NextRunTime)"
    Write-Host "Log         $log"
    Write-Host ""
  }
  if (-not $found) { Write-Host "Run this script with no arguments to create them." }
  exit 0
}

if ($Remove) {
  # schtasks, not Unregister-ScheduledTask, for the same reason registration
  # uses it: the CIM provider denies writes to a non-administrator account.
  & schtasks.exe /Delete /TN $CollectorTask /F 2>&1 | Out-Null
  & schtasks.exe /Delete /TN $StoryTask /F 2>&1 | Out-Null
  Write-Host "Removed $CollectorTask and $StoryTask."
  Write-Host "Collection has stopped; the history stops with it, and the pins stop with the history."
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
# recorded exit code is the run's own. Windows offers no other way to start a
# console program with no console from a non-elevated task — the alternative,
# "run whether the user is logged on or not", needs a privilege this account
# does not have.
#
# `>>` with `2>&1` sends stdout and stderr to the same log: a task's output is
# otherwise discarded, and a pass that has been failing silently for a week is
# indistinguishable from a week in which nothing happened. With the window gone,
# that log is now the ONLY way to see this thing work — check it, not the
# desktop. The story pass gets its own log for the same reason it gets its own
# task: a paid pass failing on an expired key must not be something you have to
# find inside fifteen-minute collector chatter.
function Write-Launcher {
  param(
    [string]$Path,
    [string]$ScriptArgs,
    [string]$Log,
    [string]$What
  )

  # Built with Chr(34) rather than escaped quotes because the command nests
  # three levels of them — VBScript's, cmd's `/c "..."` wrapper, and one pair
  # around each of the two paths, both of which need them ("Program Files",
  # "dev-work").
  $vbs = @"
' GENERATED by scripts/news/schedule-windows.ps1 - edits here are overwritten.
' $What, with no console window. See that script for why the window is not
' merely untidy but fatal: closing it kills the run.
q = Chr(34)
cmd = "cmd /c " & q & q & "$node" & q & " $ScriptArgs >> " & q & "$Log" & q & " 2>&1" & q
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = "$RepoRoot"
WScript.Quit sh.Run(cmd, 0, True)
"@

  Set-Content -Path $Path -Value $vbs -Encoding ASCII
}

$LauncherFile = Join-Path $RepoRoot ".data\run-collector.vbs"
$StoryLauncherFile = Join-Path $RepoRoot ".data\run-stories.vbs"

Write-Launcher -Path $LauncherFile -ScriptArgs "scripts\news\run.mjs cycle" `
  -Log $LogFile -What "Runs one collector cycle"

# `--days=14` is stated rather than left to the default so the cadence and the
# window are visible in the same place. It is the window `THREAD_WINDOW_HOURS`
# in scripts/news/stories/run.mjs threads over; a run narrower than that would
# quietly shorten how long a running story can stay linked.
Write-Launcher -Path $StoryLauncherFile -ScriptArgs "scripts\news\stories\run.mjs --days=14" `
  -Log $StoryLogFile -What "Runs one story-pipeline pass"

# ---------------------------------------------------------------------------
# REGISTERED THROUGH schtasks.exe /Create /XML, NOT Register-ScheduledTask.
#
# Register-ScheduledTask writes through the Root/Microsoft/Windows/TaskScheduler
# CIM provider, and on an ordinary non-administrator account that provider
# answers "Access is denied" (HRESULT 0x80070005) to any write, however modest
# the task. schtasks.exe drives the Task Scheduler COM API directly and
# registers the identical task, as the current user, without elevation.
# Measured both ways on this machine: the CIM call fails, the schtasks call
# succeeds. Reads are unaffected, so -Status above still uses Get-ScheduledTask.
#
# The price of the swap is writing the settings as XML by hand instead of
# assembling them with New-ScheduledTaskSettingsSet. Every element below is
# load-bearing and says why inline — none of it is boilerplate to trim.
# ---------------------------------------------------------------------------
function Register-NewsTask {
  param(
    [string]$Name,
    [string]$Description,
    [string]$Launcher,
    [int]$IntervalMinutes,
    [string]$TimeLimit,
    [int]$StartInMinutes
  )

  $argument = [Security.SecurityElement]::Escape("""$Launcher""")
  $start = (Get-Date).AddMinutes($StartInMinutes).ToString("yyyy-MM-ddTHH:mm:ss")
  $interval = "PT${IntervalMinutes}M"

  # Ten years, not [TimeSpan]::MaxValue. MaxValue is the obvious way to say
  # "forever" and the way that fails: it serialises to P99999999DT23H59M59S,
  # which Task Scheduler rejects outright as "a value which is incorrectly
  # formatted or out of range" — leaving no task at all, behind an error that
  # names the duration rather than the cause. Ten years is forever for a news
  # collector.
  $duration = "P3650D"

  $xml = @"
<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.3" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Description>$Description</Description>
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
         arrangement can corrupt data rather than merely miss some. The story
         pass needs it for its own reason as well — two runs labelling the same
         groups would pay the API twice for one answer. -->
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <!-- Catch up if the machine was asleep or off at the appointed minute. -->
    <StartWhenAvailable>true</StartWhenAvailable>
    <!-- A run hung past its limit is not going to finish; killing it frees
         the next one, which is worth more than the stuck one's output. -->
    <ExecutionTimeLimit>$TimeLimit</ExecutionTimeLimit>
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
  $xmlFile = Join-Path ([IO.Path]::GetTempPath()) "$Name.xml"
  [IO.File]::WriteAllText($xmlFile, $xml, [Text.Encoding]::Unicode)
  try {
    $created = & schtasks.exe /Create /TN $Name /XML $xmlFile /F 2>&1
    if ($LASTEXITCODE -ne 0) { throw "schtasks /Create failed for ${Name}: $created" }
  } finally {
    Remove-Item $xmlFile -ErrorAction SilentlyContinue
  }
}

Register-NewsTask -Name $CollectorTask `
  -Description "Collects Marathi news and YouTube view snapshots for maharashtra-is-building. Observations only; nothing here scores anything." `
  -Launcher $LauncherFile -IntervalMinutes $Every -TimeLimit "PT30M" -StartInMinutes 1

# Started three minutes out rather than one so the first story pass reads a
# corpus the first collector run has already written to, and so the two are not
# permanently in step: the story pipeline reads news.db while the collector
# writes it, which WAL handles, but there is no reason to schedule the
# contention.
#
# PT1H rather than the collector's PT30M because a cold run — an empty
# label_cache over a fortnight of groups — makes a few hundred model calls, and
# killing that at thirty minutes would leave the cache half-warm and the run
# unfinished, which `loadStories` correctly refuses to read (`ended_at IS NOT
# NULL AND ok = 1`). Warm runs finish in a fraction of it.
Register-NewsTask -Name $StoryTask `
  -Description "Clusters collected articles into running stories for maharashtra-is-building's pin map. Names stories; never ranks them." `
  -Launcher $StoryLauncherFile -IntervalMinutes $StoryEvery -TimeLimit "PT1H" -StartInMinutes 3

Write-Host "Registered $CollectorTask — every $Every minutes, starting in about a minute."
Write-Host "  repo   $RepoRoot"
Write-Host "  log    $LogFile"
Write-Host ""
Write-Host "Registered $StoryTask — every $StoryEvery minutes, starting in about three."
Write-Host "  log    $StoryLogFile"
Write-Host ""
Write-Host "Check them with:   powershell -ExecutionPolicy Bypass -File scripts\news\schedule-windows.ps1 -Status"
Write-Host "Then, in a few hours:   pnpm news:stats"
