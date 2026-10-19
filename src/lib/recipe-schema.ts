import { z } from "zod";
import { DIFFICULTIES } from "./db/schema";

const trimmed = (max: number) => z.string().trim().min(1, "필수 항목입니다").max(max, `${max}자 이하로 입력하세요`);
// Empty strings from the form become undefined; the key stays optional.
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `${max}자 이하로 입력하세요`)
    .transform((v) => (v ? v : undefined))
    .optional();
const minutes = z.coerce.number().int("정수로 입력하세요").min(0, "0 이상이어야 합니다").max(60 * 24 * 7);

export const ingredientSchema = z.object({
  name: trimmed(80),
  amount: z.coerce.number().positive("0보다 커야 합니다").max(100_000),
  unit: trimmed(20),
  note: optionalText(200),
});

export const stepSchema = z.object({
  title: trimmed(80),
  body: trimmed(2_000),
  durationMin: z.coerce.number().int().min(0).max(60 * 48).optional(),
});

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const recipeInputSchema = z.object({
  slug: z
    .string()
    .trim()
    .min(2, "2자 이상 입력하세요")
    .max(80)
    .regex(SLUG_PATTERN, "영문 소문자, 숫자, 하이픈(-)만 쓸 수 있습니다"),
  title: trimmed(80),
  titleOriginal: optionalText(80),
  summary: trimmed(400),
  story: optionalText(4_000),
  category: trimmed(40),
  difficulty: z.enum(DIFFICULTIES),
  yieldQuantity: z.coerce.number().int().min(1).max(1_000),
  yieldUnit: trimmed(20),
  moldNote: optionalText(500),
  prepMin: minutes,
  restMin: minutes,
  bakeMin: minutes,
  totalMin: minutes,
  ovenTempC: z.coerce.number().int().min(50).max(300),
  ovenMode: trimmed(40),
  ovenNote: optionalText(1_000),
  equipment: z.array(trimmed(100)).max(50),
  ingredients: z.array(ingredientSchema).min(1, "재료를 1개 이상 입력하세요").max(60),
  steps: z.array(stepSchema).min(1, "만드는 법을 1단계 이상 입력하세요").max(40),
  tips: z.array(trimmed(1_000)).max(30),
  storage: optionalText(2_000),
  variations: z.array(trimmed(1_000)).max(20),
});

export type RecipeInput = z.infer<typeof recipeInputSchema>;
export type RecipeInputDraft = z.input<typeof recipeInputSchema>;

/** Flattens zod issues into `{ "ingredients.2.amount": "..." }` for the admin form. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_form";
    out[key] ??= issue.message;
  }
  return out;
}
