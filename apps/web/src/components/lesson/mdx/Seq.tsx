
interface Msg { from: number; to: number; label: string }

/**
 * Static sequence diagram in HTML/CSS: participants as columns, dashed lifelines, one row per message.
 * An ordered list for screen readers carries the same content, since the picture is decorative.
 */
export function Seq({ participants, messages }: { participants: string[]; messages: Msg[] }) {
  const n = participants.length;
  const col = (i: number) => ((i + 0.5) / n) * 100;
  return (
    <figure className="my-8">
      <div className="overflow-x-auto rounded-xl border border-line bg-surface p-4">
        <div aria-hidden="true" style={{ minWidth: `${n * 8.5}rem` }}>
          <div className="grid" style={{ gridTemplateColumns: `repeat(${n}, 1fr)` }}>
            {participants.map((p) => <div key={p} className="px-1 text-center"><span className="inline-block rounded-md border border-line-strong bg-bg px-2.5 py-1 font-mono text-[0.72rem]">{p}</span></div>)}
          </div>
          <div className="relative mt-1">
            {participants.map((_, i) => <span key={i} className="absolute inset-y-0 border-l border-dashed border-line-strong" style={{ left: `${col(i)}%` }} />)}
            {messages.map((m, k) => {
              const a = Math.min(m.from, m.to), b = Math.max(m.from, m.to), right = m.to > m.from;
              return (
                <div key={k} className="relative h-14">
                  <div className="absolute bottom-3 flex flex-col items-center" style={{ left: `${col(a)}%`, width: `${col(b) - col(a)}%` }}>
                    <span className="mb-1 max-w-full bg-surface px-1.5 text-center font-mono text-[0.68rem] leading-tight text-ink">{m.label}</span>
                    <span className="relative block h-px w-full bg-signal">
                      <span className={right ? "absolute -right-px -top-[4px] border-y-[4px] border-l-[8px] border-y-transparent border-l-signal" : "absolute -left-px -top-[4px] border-y-[4px] border-r-[8px] border-y-transparent border-r-signal"} />
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <figcaption className="sr-only">Sequence of messages</figcaption>
      <ol className="sr-only">{messages.map((m, k) => <li key={k}>{participants[m.from]} to {participants[m.to]}: {m.label}</li>)}</ol>
    </figure>
  );
}
