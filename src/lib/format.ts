import type { Ingredient } from "./db/schema";

/** 180 -> "3시간", 45 -> "45분", 135 -> "2시간 15분" */
export function formatMinutes(total: number): string {
  if (total <= 0) return "0분";
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  if (hours === 0) return `${minutes}분`;
  if (minutes === 0) return `${hours}시간`;
  return `${hours}시간 ${minutes}분`;
}

/** schema.org Duration (ISO 8601), e.g. 180 -> "PT3H", 45 -> "PT45M". */
export function isoDuration(total: number): string {
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  if (hours === 0) return `PT${minutes}M`;
  if (minutes === 0) return `PT${hours}H`;
  return `PT${hours}H${minutes}M`;
}

/**
 * Rounds a scaled amount the way a home baker would weigh it:
 * < 10 -> one decimal (1.5 g of salt matters), otherwise whole numbers.
 */
export function roundAmount(value: number): number {
  if (value < 10) return Math.round(value * 10) / 10;
  return Math.round(value);
}

export function scaleIngredients(ingredients: Ingredient[], factor: number): Ingredient[] {
  if (!Number.isFinite(factor) || factor <= 0) return ingredients;
  return ingredients.map((i) => ({ ...i, amount: roundAmount(i.amount * factor) }));
}

export function formatAmount(amount: number): string {
  return Number.isInteger(amount) ? amount.toLocaleString("ko-KR") : amount.toLocaleString("ko-KR", { maximumFractionDigits: 1 });
}

export function formatIngredient(i: Ingredient): string {
  return `${i.name} ${formatAmount(i.amount)}${i.unit}`;
}
