"use client";

import { useActionState, useState } from "react";
import { DIFFICULTIES } from "@/lib/db/schema";
import type { RecipeInput } from "@/lib/recipe-schema";
import { saveRecipeAction, type FormState } from "../actions";

// Form state keeps numbers as strings while typing; the server action
// validates and coerces everything with the shared zod schema.
type IngredientRow = { name: string; amount: string; unit: string; note: string };
type StepRow = { title: string; body: string; durationMin: string };
type Draft = {
  slug: string;
  title: string;
  titleOriginal: string;
  summary: string;
  story: string;
  category: string;
  difficulty: string;
  yieldQuantity: string;
  yieldUnit: string;
  moldNote: string;
  prepMin: string;
  restMin: string;
  bakeMin: string;
  totalMin: string;
  ovenTempC: string;
  ovenMode: string;
  ovenNote: string;
  equipment: string;
  ingredients: IngredientRow[];
  steps: StepRow[];
  tips: string;
  storage: string;
  variations: string;
};

const EMPTY: Draft = {
  slug: "",
  title: "",
  titleOriginal: "",
  summary: "",
  story: "",
  category: "",
  difficulty: "보통",
  yieldQuantity: "",
  yieldUnit: "개",
  moldNote: "",
  prepMin: "",
  restMin: "0",
  bakeMin: "",
  totalMin: "",
  ovenTempC: "",
  ovenMode: "컨벤셔널(상하불)",
  ovenNote: "",
  equipment: "",
  ingredients: [{ name: "", amount: "", unit: "g", note: "" }],
  steps: [{ title: "", body: "", durationMin: "" }],
  tips: "",
  storage: "",
  variations: "",
};

function toDraft(r: RecipeInput): Draft {
  return {
    slug: r.slug,
    title: r.title,
    titleOriginal: r.titleOriginal ?? "",
    summary: r.summary,
    story: r.story ?? "",
    category: r.category,
    difficulty: r.difficulty,
    yieldQuantity: String(r.yieldQuantity),
    yieldUnit: r.yieldUnit,
    moldNote: r.moldNote ?? "",
    prepMin: String(r.prepMin),
    restMin: String(r.restMin),
    bakeMin: String(r.bakeMin),
    totalMin: String(r.totalMin),
    ovenTempC: String(r.ovenTempC),
    ovenMode: r.ovenMode,
    ovenNote: r.ovenNote ?? "",
    equipment: r.equipment.join("\n"),
    ingredients: r.ingredients.map((i) => ({ name: i.name, amount: String(i.amount), unit: i.unit, note: i.note ?? "" })),
    steps: r.steps.map((s) => ({ title: s.title, body: s.body, durationMin: s.durationMin?.toString() ?? "" })),
    tips: r.tips.join("\n"),
    storage: r.storage ?? "",
    variations: r.variations.join("\n"),
  };
}

const lines = (text: string) =>
  text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

function toPayload(d: Draft) {
  return {
    ...d,
    equipment: lines(d.equipment),
    tips: lines(d.tips),
    variations: lines(d.variations),
    ingredients: d.ingredients.map((i) => ({ ...i, note: i.note || undefined })),
    steps: d.steps.map((s) => ({ ...s, durationMin: s.durationMin === "" ? undefined : s.durationMin })),
  };
}

function move<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

const inputClass = "w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm";
const errorClass = "mt-1 text-xs text-danger";

export function RecipeForm({ recipeId, initial }: { recipeId?: number; initial?: RecipeInput }) {
  const [draft, setDraft] = useState<Draft>(initial ? toDraft(initial) : EMPTY);
  const [state, formAction, pending] = useActionState<FormState, FormData>(saveRecipeAction, {});
  const errors = state.fieldErrors ?? {};

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const text = (key: keyof Draft) => ({
    value: draft[key] as string,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      set(key, e.target.value as never),
  });

  const sumMinutes = ["prepMin", "restMin", "bakeMin"].reduce(
    (acc, k) => acc + (Number(draft[k as keyof Draft]) || 0),
    0,
  );

  return (
    <form action={formAction} className="flex flex-col gap-8">
      <input type="hidden" name="payload" value={JSON.stringify(toPayload(draft))} />
      {recipeId && <input type="hidden" name="id" value={recipeId} />}

      {state.error && (
        <p role="alert" className="rounded-lg bg-danger-soft px-4 py-3 text-sm text-danger">
          {state.error}
          {errors._form ? ` ${errors._form}` : ""}
        </p>
      )}

      <Fieldset legend="기본 정보">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="제목" error={errors.title}>
            <input className={inputClass} required {...text("title")} />
          </Field>
          <Field label="원어 이름 (선택)" error={errors.titleOriginal}>
            <input className={inputClass} placeholder="Financier" {...text("titleOriginal")} />
          </Field>
          <Field label="주소 (slug)" hint="영문 소문자, 숫자, 하이픈. 예: financier" error={errors.slug}>
            <input className={`${inputClass} font-mono`} required pattern="[a-z0-9]+(-[a-z0-9]+)*" {...text("slug")} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="분류" error={errors.category}>
              <input className={inputClass} required placeholder="구움과자" {...text("category")} />
            </Field>
            <Field label="난이도" error={errors.difficulty}>
              <select className={inputClass} {...text("difficulty")}>
                {DIFFICULTIES.map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </select>
            </Field>
          </div>
        </div>
        <Field label="요약 (목록과 검색 결과에 표시)" error={errors.summary}>
          <textarea className={inputClass} rows={2} required {...text("summary")} />
        </Field>
        <Field label="이야기 (선택)" error={errors.story}>
          <textarea className={inputClass} rows={4} {...text("story")} />
        </Field>
      </Fieldset>

      <Fieldset legend="분량과 시간">
        <div className="grid gap-4 sm:grid-cols-4">
          <Field label="분량" error={errors.yieldQuantity}>
            <input className={inputClass} type="number" min={1} required {...text("yieldQuantity")} />
          </Field>
          <Field label="단위" error={errors.yieldUnit}>
            <input className={inputClass} required {...text("yieldUnit")} />
          </Field>
          <Field label="준비(분)" error={errors.prepMin}>
            <input className={inputClass} type="number" min={0} required {...text("prepMin")} />
          </Field>
          <Field label="휴지(분)" error={errors.restMin}>
            <input className={inputClass} type="number" min={0} required {...text("restMin")} />
          </Field>
          <Field label="굽기(분)" error={errors.bakeMin}>
            <input className={inputClass} type="number" min={0} required {...text("bakeMin")} />
          </Field>
          <Field label="총 소요(분)" error={errors.totalMin}>
            <input className={inputClass} type="number" min={0} required {...text("totalMin")} />
          </Field>
          <div className="flex items-end sm:col-span-2">
            <button
              type="button"
              onClick={() => set("totalMin", String(sumMinutes))}
              className="rounded-lg border border-line px-3 py-2 text-sm hover:bg-surface-2"
            >
              준비+휴지+굽기 합계({sumMinutes}분)로 채우기
            </button>
          </div>
        </div>
        <Field label="틀과 분량 메모 (선택)" error={errors.moldNote}>
          <textarea className={inputClass} rows={2} {...text("moldNote")} />
        </Field>
      </Fieldset>

      <Fieldset legend="오븐">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="온도(°C)" error={errors.ovenTempC}>
            <input className={inputClass} type="number" min={50} max={300} required {...text("ovenTempC")} />
          </Field>
          <Field label="방식" error={errors.ovenMode}>
            <input className={inputClass} required {...text("ovenMode")} />
          </Field>
        </div>
        <Field label="오븐 메모 (선택)" error={errors.ovenNote}>
          <textarea className={inputClass} rows={2} {...text("ovenNote")} />
        </Field>
      </Fieldset>

      <Fieldset legend="재료">
        {errors.ingredients && <p className={errorClass}>{errors.ingredients}</p>}
        <ol className="flex flex-col gap-3">
          {draft.ingredients.map((row, i) => {
            const update = (patch: Partial<IngredientRow>) =>
              set(
                "ingredients",
                draft.ingredients.map((r, j) => (j === i ? { ...r, ...patch } : r)),
              );
            return (
              <li key={i} className="grid gap-2 rounded-xl bg-surface-2 p-3 sm:grid-cols-[2fr_1fr_0.7fr_2fr_auto]">
                <Field label="재료명" error={errors[`ingredients.${i}.name`]} compact>
                  <input className={inputClass} value={row.name} onChange={(e) => update({ name: e.target.value })} />
                </Field>
                <Field label="양" error={errors[`ingredients.${i}.amount`]} compact>
                  <input
                    className={inputClass}
                    type="number"
                    step="any"
                    min={0}
                    value={row.amount}
                    onChange={(e) => update({ amount: e.target.value })}
                  />
                </Field>
                <Field label="단위" error={errors[`ingredients.${i}.unit`]} compact>
                  <input className={inputClass} value={row.unit} onChange={(e) => update({ unit: e.target.value })} />
                </Field>
                <Field label="메모" error={errors[`ingredients.${i}.note`]} compact>
                  <input className={inputClass} value={row.note} onChange={(e) => update({ note: e.target.value })} />
                </Field>
                <RowControls
                  index={i}
                  count={draft.ingredients.length}
                  onMove={(to) => set("ingredients", move(draft.ingredients, i, to))}
                  onRemove={() => set("ingredients", draft.ingredients.filter((_, j) => j !== i))}
                />
              </li>
            );
          })}
        </ol>
        <AddButton onClick={() => set("ingredients", [...draft.ingredients, { name: "", amount: "", unit: "g", note: "" }])}>
          재료 추가
        </AddButton>
      </Fieldset>

      <Fieldset legend="만드는 법">
        {errors.steps && <p className={errorClass}>{errors.steps}</p>}
        <ol className="flex flex-col gap-3">
          {draft.steps.map((row, i) => {
            const update = (patch: Partial<StepRow>) =>
              set(
                "steps",
                draft.steps.map((r, j) => (j === i ? { ...r, ...patch } : r)),
              );
            return (
              <li key={i} className="flex flex-col gap-2 rounded-xl bg-surface-2 p-3">
                <div className="flex items-center justify-between">
                  <span className="font-serif text-sm font-bold text-accent">{i + 1}단계</span>
                  <RowControls
                    index={i}
                    count={draft.steps.length}
                    onMove={(to) => set("steps", move(draft.steps, i, to))}
                    onRemove={() => set("steps", draft.steps.filter((_, j) => j !== i))}
                  />
                </div>
                <div className="grid gap-2 sm:grid-cols-[3fr_1fr]">
                  <Field label="제목" error={errors[`steps.${i}.title`]} compact>
                    <input className={inputClass} value={row.title} onChange={(e) => update({ title: e.target.value })} />
                  </Field>
                  <Field label="소요(분, 선택)" error={errors[`steps.${i}.durationMin`]} compact>
                    <input
                      className={inputClass}
                      type="number"
                      min={0}
                      value={row.durationMin}
                      onChange={(e) => update({ durationMin: e.target.value })}
                    />
                  </Field>
                </div>
                <Field label="설명" error={errors[`steps.${i}.body`]} compact>
                  <textarea
                    className={inputClass}
                    rows={4}
                    value={row.body}
                    onChange={(e) => update({ body: e.target.value })}
                  />
                </Field>
              </li>
            );
          })}
        </ol>
        <AddButton onClick={() => set("steps", [...draft.steps, { title: "", body: "", durationMin: "" }])}>
          단계 추가
        </AddButton>
      </Fieldset>

      <Fieldset legend="부가 정보">
        <Field label="도구 (한 줄에 하나)" error={errors.equipment}>
          <textarea className={inputClass} rows={4} {...text("equipment")} />
        </Field>
        <Field label="팁 (한 줄에 하나, '제목: 내용' 형식이면 제목이 굵게 표시)" error={errors.tips}>
          <textarea className={inputClass} rows={5} {...text("tips")} />
        </Field>
        <Field label="보관 (선택)" error={errors.storage}>
          <textarea className={inputClass} rows={3} {...text("storage")} />
        </Field>
        <Field label="응용 (한 줄에 하나, '이름: 설명')" error={errors.variations}>
          <textarea className={inputClass} rows={3} {...text("variations")} />
        </Field>
      </Fieldset>

      <div className="sticky bottom-0 -mx-4 flex flex-wrap justify-end gap-2 border-t border-line bg-bg/95 px-4 py-3 backdrop-blur">
        {recipeId ? (
          <SubmitButton pending={pending} primary>
            저장
          </SubmitButton>
        ) : (
          <>
            <SubmitButton pending={pending} name="intent" value="draft">
              비공개로 저장
            </SubmitButton>
            <SubmitButton pending={pending} name="intent" value="publish" primary>
              저장 후 공개
            </SubmitButton>
          </>
        )}
      </div>
    </form>
  );
}

function Fieldset({ legend, children }: { legend: string; children: React.ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5">
      <legend className="px-1 font-serif text-lg font-bold">{legend}</legend>
      {children}
    </fieldset>
  );
}

function Field({
  label,
  hint,
  error,
  compact,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  compact?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className={`font-medium ${compact ? "text-xs text-muted" : "text-sm"}`}>{label}</span>
      {children}
      {hint && !error && <span className="text-xs text-muted">{hint}</span>}
      {error && <span className={errorClass}>{error}</span>}
    </label>
  );
}

function RowControls({
  index,
  count,
  onMove,
  onRemove,
}: {
  index: number;
  count: number;
  onMove: (to: number) => void;
  onRemove: () => void;
}) {
  const btn = "rounded-md px-2 py-1 text-xs hover:bg-surface disabled:opacity-30";
  return (
    <div className="flex items-end gap-1">
      <button type="button" className={btn} disabled={index === 0} onClick={() => onMove(index - 1)} aria-label="위로">
        ↑
      </button>
      <button
        type="button"
        className={btn}
        disabled={index === count - 1}
        onClick={() => onMove(index + 1)}
        aria-label="아래로"
      >
        ↓
      </button>
      <button type="button" className={`${btn} text-danger`} disabled={count === 1} onClick={onRemove}>
        삭제
      </button>
    </div>
  );
}

function AddButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="self-start rounded-lg border border-dashed border-line px-3 py-2 text-sm hover:bg-surface-2"
    >
      + {children}
    </button>
  );
}

function SubmitButton({
  pending,
  primary,
  children,
  ...rest
}: { pending: boolean; primary?: boolean; children: React.ReactNode } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="submit"
      disabled={pending}
      className={`rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-60 ${
        primary ? "bg-accent text-accent-ink hover:opacity-90" : "border border-line bg-surface hover:bg-surface-2"
      }`}
      {...rest}
    >
      {pending ? "저장 중…" : children}
    </button>
  );
}
