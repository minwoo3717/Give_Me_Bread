import { describe, expect, it } from "vitest";
import { formatAmount, formatMinutes, isoDuration, roundAmount, scaleIngredients } from "@/lib/format";

describe("formatMinutes", () => {
  it.each([
    [0, "0분"],
    [45, "45분"],
    [60, "1시간"],
    [135, "2시간 15분"],
    [180, "3시간"],
  ])("%i -> %s", (input, expected) => {
    expect(formatMinutes(input)).toBe(expected);
  });
});

describe("isoDuration", () => {
  it.each([
    [15, "PT15M"],
    [120, "PT2H"],
    [165, "PT2H45M"],
  ])("%i -> %s", (input, expected) => {
    expect(isoDuration(input)).toBe(expected);
  });
});

describe("roundAmount", () => {
  it("keeps one decimal below 10 so small amounts (salt) stay meaningful", () => {
    expect(roundAmount(0.5)).toBe(0.5);
    expect(roundAmount(1.26)).toBe(1.3);
  });

  it("rounds to whole grams from 10 up", () => {
    expect(roundAmount(62.5)).toBe(63);
    expect(roundAmount(137.4)).toBe(137);
  });
});

describe("scaleIngredients", () => {
  const base = [
    { name: "버터", amount: 125, unit: "g" },
    { name: "소금", amount: 1, unit: "g", note: "고운 소금" },
  ];

  it("doubles every amount and keeps notes", () => {
    expect(scaleIngredients(base, 2)).toEqual([
      { name: "버터", amount: 250, unit: "g" },
      { name: "소금", amount: 2, unit: "g", note: "고운 소금" },
    ]);
  });

  it("halves with sensible rounding", () => {
    expect(scaleIngredients(base, 0.5).map((i) => i.amount)).toEqual([63, 0.5]);
  });

  it("ignores invalid factors", () => {
    expect(scaleIngredients(base, 0)).toBe(base);
    expect(scaleIngredients(base, Number.NaN)).toBe(base);
  });
});

describe("formatAmount", () => {
  it("adds thousands separators and trims decimals", () => {
    expect(formatAmount(1250)).toBe("1,250");
    expect(formatAmount(1.5)).toBe("1.5");
  });
});
