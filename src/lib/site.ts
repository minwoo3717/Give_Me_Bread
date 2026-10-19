export const SITE_NAME = "오븐노트";
export const SITE_TAGLINE = "집에서 굽는 제과·제빵 레시피";
export const SITE_DESCRIPTION =
  "브라운버터 휘낭시에부터 시작하는 제과·제빵 레시피 모음. 그램 단위 배합, 단계별 설명, 실패하지 않는 팁까지 정리했습니다.";

/**
 * Absolute origin of the public site (e.g. https://d123.cloudfront.net).
 * Read at request time, so one Docker image can serve any environment.
 */
export function siteUrl(): string {
  return (process.env.SITE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}
