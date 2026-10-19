"use client";

import { useId, useState } from "react";
import type { Ingredient } from "@/lib/db/schema";
import { formatAmount, scaleIngredients } from "@/lib/format";

const PRESETS = [0.5, 1, 1.5, 2] as const;
const MAX_COUNT = 1000;

export function IngredientScaler({
  ingredients,
  yieldQuantity,
  yieldUnit,
}: {
  ingredients: Ingredient[];
  yieldQuantity: number;
  yieldUnit: string;
}) {
  const [count, setCount] = useState(yieldQuantity);
  const [draft, setDraft] = useState(String(yieldQuantity));
  const inputId = useId();
  const factor = count / yieldQuantity;
  const scaled = scaleIngredients(ingredients, factor);

  function applyCount(next: number) {
    const clamped = Math.min(MAX_COUNT, Math.max(1, Math.round(next)));
    setCount(clamped);
    setDraft(String(clamped));
  }

  return (
    <div>
      <div className="no-print flex flex-wrap items-end gap-3 rounded-xl bg-surface-2 p-4">
        <div className="flex flex-col gap-1">
          <label htmlFor={inputId} className="text-xs font-medium text-muted">
            만들 개수
          </label>
          <div className="flex items-center gap-2">
            <input
              id={inputId}
              type="number"
              inputMode="numeric"
              min={1}
              max={MAX_COUNT}
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                const n = Number(e.target.value);
                if (Number.isFinite(n) && n >= 1) setCount(Math.min(MAX_COUNT, Math.round(n)));
              }}
              onBlur={() => applyCount(Number(draft) || yieldQuantity)}
              className="w-20 rounded-lg border border-line bg-surface px-3 py-2 text-right tabular-nums"
            />
            <span className="text-sm">{yieldUnit}</span>
          </div>
        </div>
        <div role="group" aria-label="배합 배수" className="flex gap-1">
          {PRESETS.map((p) => {
            const target = Math.max(1, Math.round(yieldQuantity * p));
            const active = count === target;
            return (
              <button
                key={p}
                type="button"
                aria-pressed={active}
                onClick={() => applyCount(target)}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  active ? "bg-accent text-accent-ink" : "bg-surface text-ink hover:bg-accent-soft"
                }`}
              >
                {p === 1 ? "기본" : `${p}배`}
              </button>
            );
          })}
        </div>
        {factor !== 1 && (
          <p className="w-full text-xs text-muted" aria-live="polite">
            기본 {yieldQuantity}
            {yieldUnit} 대비 {formatAmount(Math.round(factor * 100) / 100)}배로 계산했어요. 틀 개수와 굽는 시간도 함께
            확인하세요.
          </p>
        )}
      </div>

      <ul className="mt-4 divide-y divide-line">
        {scaled.map((item, index) => (
          <li key={`${item.name}-${index}`} className="flex items-start justify-between gap-4 py-3">
            <div>
              <p className="font-medium">{item.name}</p>
              {item.note && <p className="mt-0.5 text-sm text-muted">{item.note}</p>}
            </div>
            <p className="shrink-0 font-serif text-lg font-bold tabular-nums">
              {formatAmount(item.amount)}
              <span className="ml-0.5 text-sm font-normal text-muted">{item.unit}</span>
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
