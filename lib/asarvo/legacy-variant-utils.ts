/**
 * ASARVO 2.0 CORE025 - isolated source recovery, no API wiring.
 * Logic copied from release/asarvo-1.0 (CORE024 source inventory).
 */
function asarvoSearchCoreV20NormalizeVariantNumber(
  valueRaw: string
): string {
  return String(
    valueRaw ?? ""
  )
    .replace(",", ".")
    .replace(
      /\.0+$/u,
      ""
    );
}

function asarvoIntentCoreV9CanonicalNumber(
  value: number
): string {
  if (!Number.isFinite(value)) return "";
  return String(
    Math.round(value * 1000) / 1000
  );
}

function normalizeAsarvoRetailDecimalDotBeforeCurrency(valueRaw: string): string {
  return String(valueRaw ?? "").replace(
    /(\d{1,7})\.(\d{2})(?=\s*(?:zł|PLN|€|EUR|USD|GBP|CZK|KČ)(?=$|[^\p{L}\p{N}_]))/giu,
    "$1,$2"
  );
}

export {
  asarvoSearchCoreV20NormalizeVariantNumber,
  asarvoIntentCoreV9CanonicalNumber,
  normalizeAsarvoRetailDecimalDotBeforeCurrency,
};
