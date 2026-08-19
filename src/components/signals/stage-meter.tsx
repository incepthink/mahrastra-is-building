import { STATUS_LADDER, STATUS_META, TONE_COLOR, stageIndex } from "@/lib/design/status";
import { MR } from "@/lib/signals/marathi";
import type { SignalStatus } from "@/types/signal";

/**
 * Where this record has got to, on the five stages work actually moves through:
 * declared → sanctioned → building → built → running.
 *
 * The panel already names the status in a word. The word alone answers "what is
 * this" but not "how far along is this", which is the question a scale answers
 * for free — `मंजूर` means much more once you can see that it is the second of
 * five and that three remain. The stages behind the current one are filled in
 * their own status ink rather than in a single accent, so the meter and the
 * legend on the brand plate are speaking the same colour language.
 *
 * Nothing here claims a *date* for any stage. The district publishes notices,
 * not schedules; a meter that implied "completion: March" would be inventing
 * the most consequential fact on the panel.
 */
export function StageMeter({ status }: { status: SignalStatus }) {
  const reached = stageIndex(status);
  const last = STATUS_LADDER.length - 1;

  return (
    <section
      className="record-stage"
      aria-label={MR.stage}
      style={{ "--reached": Math.max(0, reached) / last } as React.CSSProperties}
    >
      <div className="stage-track">
        {/* The rails are siblings of the list rather than children of it: an
            `<ol>` may only contain `<li>`, and a stray `<span>` in there is the
            kind of thing that quietly breaks a screen reader's item count. */}
        <span className="stage-rail" aria-hidden />
        <span className="stage-rail-fill" aria-hidden />

        <ol className="stage-steps">
          {STATUS_LADDER.map((step, index) => (
            <li
              key={step}
              className="stage-step"
              data-state={state(index, reached)}
              aria-current={index === reached ? "step" : undefined}
              style={{ "--step": TONE_COLOR[STATUS_META[step].tone] } as React.CSSProperties}
            >
              <span className="stage-node" aria-hidden />
              <span className="stage-word">{STATUS_META[step].shortMr}</span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/** `-1` — a status that is not on the ladder — leaves every step ahead, which
 *  is the honest rendering of "we do not know how far along this is". */
function state(index: number, reached: number): "done" | "now" | "ahead" {
  if (index < reached) return "done";

  return index === reached ? "now" : "ahead";
}
