/** ASARVO v2 CORE027: isolated recovery of V12 and V18 algorithm bodies.
 * The original normalizeText / normalizeMatchText dependencies are injected.
 * This does NOT prove production parity until the real dependencies are wired.
 */
export type TextNormalizer = (value: string) => string;
export function asarvoIntentCoreV12NormalizeAdversarialQuerySurface(
  valueRaw: string,
  normalizeText: TextNormalizer
): string {
  let value = normalizeText(valueRaw);
  value = value.replace(/[\uFF01-\uFF5E]/gu, (character) =>
    String.fromCharCode(character.charCodeAt(0) - 0xfee0)
  );
  return normalizeText(value)
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212\uFE58\uFE63]/gu, "-")
    .replace(/[\u201C\u201D\u201E\u201F\u2033]/gu, '"')
    .replace(/[\u2018\u2019\u201A\u201B\u02BC\u2032]/gu, "'")
    .replace(/[\u2044\u2215]/gu, "/")
    .replace(/[\u01C0\u2223\u2758\uFF5C]/gu, "|")
    .replace(/\u2026/gu, "...")
    .replace(/\s+/gu, " ")
    .trim();
}
export function asarvoSearchCoreV18NormalizeStructuredIdentifier(
  valueRaw: unknown,
  normalizeMatchText: TextNormalizer
): string {
  return normalizeMatchText(String(valueRaw ?? "")).replace(/[^a-z0-9]+/giu, "");
}
