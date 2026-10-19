"use client";

import { useEffect, useState } from "react";
import type { RecipeStep } from "@/lib/db/schema";
import { formatMinutes } from "@/lib/format";

// Progress is remembered per recipe in this browser only. Storage can be
// unavailable (private mode, blocked cookies), so every access is guarded and
// the list still works without it.
function storageKey(slug: string) {
  return `oven-note:steps:${slug}`;
}

function readDone(slug: string, count: number): boolean[] {
  try {
    const raw = window.localStorage.getItem(storageKey(slug));
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    if (Array.isArray(parsed) && parsed.length === count) return parsed.map(Boolean);
  } catch {
    // ignore
  }
  return Array(count).fill(false);
}

export function StepChecklist({ slug, steps }: { slug: string; steps: RecipeStep[] }) {
  const [done, setDone] = useState<boolean[]>(() => Array(steps.length).fill(false));

  useEffect(() => {
    // Hydrate from localStorage after mount so server and client markup match.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDone(readDone(slug, steps.length));
  }, [slug, steps.length]);

  function toggle(index: number) {
    setDone((prev) => {
      const next = prev.map((v, i) => (i === index ? !v : v));
      try {
        window.localStorage.setItem(storageKey(slug), JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  }

  function reset() {
    setDone(Array(steps.length).fill(false));
    try {
      window.localStorage.removeItem(storageKey(slug));
    } catch {
      // ignore
    }
  }

  const completed = done.filter(Boolean).length;

  return (
    <div>
      <div className="no-print mb-4 flex items-center justify-between text-sm">
        <p className="text-muted" aria-live="polite">
          {completed}/{steps.length}단계 완료
        </p>
        {completed > 0 && (
          <button type="button" onClick={reset} className="rounded-md px-2 py-1 text-accent hover:bg-accent-soft">
            처음부터 다시
          </button>
        )}
      </div>
      <ol className="flex flex-col gap-4">
        {steps.map((step, index) => {
          const checked = done[index];
          const id = `step-${index + 1}`;
          return (
            <li
              key={id}
              className={`rounded-2xl border p-5 transition-colors ${
                checked ? "border-line bg-surface-2/60" : "border-line bg-surface"
              }`}
            >
              <div className="flex items-start gap-4">
                <input
                  id={id}
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(index)}
                  className="no-print mt-1.5 size-5 shrink-0 accent-[var(--accent)]"
                />
                <div className={checked ? "opacity-60" : undefined}>
                  <label htmlFor={id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="font-serif text-sm font-bold text-accent">{index + 1}단계</span>
                    <span className={`text-lg font-bold ${checked ? "line-through decoration-1" : ""}`}>{step.title}</span>
                    {step.durationMin ? (
                      <span className="text-xs text-muted">약 {formatMinutes(step.durationMin)}</span>
                    ) : null}
                  </label>
                  <p className="mt-2 leading-relaxed text-ink/90">{step.body}</p>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
