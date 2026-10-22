/**
 * ASARVO 2.0 CORE016: isolated recovery from release/asarvo-1.0.
 * Read-only integration stage: NOT wired into /api/search.
 * Original dedupe key is normalized URL (NOT exact product model).
 */
function normalizeAsarvoStabilityOfferUrl(rawUrl: unknown): string | null {
  if (typeof rawUrl !== "string" || !rawUrl.trim()) return null;

  try {
    const url = new URL(rawUrl.trim());
    url.hash = "";

    for (const key of Array.from(url.searchParams.keys())) {
      if (
        /^utm_/i.test(key) ||
        /^(?:gclid|fbclid|msclkid|ref|referrer)$/i.test(key)
      ) {
        url.searchParams.delete(key);
      }
    }

    url.hostname = url.hostname.toLowerCase();
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";

    return url.toString();
  } catch {
    return rawUrl.trim().replace(/#.*$/, "").replace(/\/+$/, "");
  }
}

function asarvoStabilityV3FiniteNumber(
  value: unknown,
  fallback: number
): number {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : fallback;
}

function asarvoStabilityV3ComparablePrice(
  offer: Record<string, unknown>
): number {
  const totalPrice = asarvoStabilityV3FiniteNumber(
    offer.totalPrice,
    Number.POSITIVE_INFINITY
  );

  if (Number.isFinite(totalPrice)) return totalPrice;

  return asarvoStabilityV3FiniteNumber(
    offer.price,
    Number.POSITIVE_INFINITY
  );
}

function asarvoStabilityV3OfferKey(
  offer: Record<string, unknown>
): string {
  return (
    normalizeAsarvoStabilityOfferUrl(offer.url) ??
    [
      typeof offer.store === "string" ? offer.store : "",
      typeof offer.name === "string" ? offer.name : "",
      String(asarvoStabilityV3ComparablePrice(offer)),
    ].join("|")
  );
}

function asarvoStabilityV3CompareOffers(
  a: Record<string, unknown>,
  b: Record<string, unknown>
): number {
  const dealDiff =
    asarvoStabilityV3FiniteNumber(b.dealScore, 0) -
    asarvoStabilityV3FiniteNumber(a.dealScore, 0);
  if (dealDiff !== 0) return dealDiff;

  const riskDiff =
    asarvoStabilityV3FiniteNumber(a.riskScore, 100) -
    asarvoStabilityV3FiniteNumber(b.riskScore, 100);
  if (riskDiff !== 0) return riskDiff;

  const priceDiff =
    asarvoStabilityV3ComparablePrice(a) -
    asarvoStabilityV3ComparablePrice(b);
  if (priceDiff !== 0) return priceDiff;

  const relevanceDiff =
    asarvoStabilityV3FiniteNumber(b.relevance, 0) -
    asarvoStabilityV3FiniteNumber(a.relevance, 0);
  if (relevanceDiff !== 0) return relevanceDiff;

  const sourceConfidenceDiff =
    asarvoStabilityV3FiniteNumber(b.sourceConfidence, 0) -
    asarvoStabilityV3FiniteNumber(a.sourceConfidence, 0);
  if (sourceConfidenceDiff !== 0) return sourceConfidenceDiff;

  return asarvoStabilityV3OfferKey(a).localeCompare(
    asarvoStabilityV3OfferKey(b)
  );
}

function asarvoStabilityV3DedupeAndRank(
  offers: Array<Record<string, unknown>>
): Array<Record<string, unknown>> {
  const byKey = new Map<string, Record<string, unknown>>();

  for (const offer of offers) {
    const key = asarvoStabilityV3OfferKey(offer);
    const current = byKey.get(key);

    if (!current) {
      byKey.set(key, { ...offer });
      continue;
    }

    if (asarvoStabilityV3CompareOffers(offer, current) < 0) {
      byKey.set(key, { ...current, ...offer });
    } else {
      byKey.set(key, { ...offer, ...current });
    }
  }

  const ranked = Array.from(byKey.values()).sort(
    asarvoStabilityV3CompareOffers
  );

  const cheapest = [...ranked]
    .filter((offer) =>
      Number.isFinite(asarvoStabilityV3ComparablePrice(offer))
    )
    .sort((a, b) => {
      const priceDiff =
        asarvoStabilityV3ComparablePrice(a) -
        asarvoStabilityV3ComparablePrice(b);
      if (priceDiff !== 0) return priceDiff;

      return asarvoStabilityV3OfferKey(a).localeCompare(
        asarvoStabilityV3OfferKey(b)
      );
    })[0];

  const safest = [...ranked].sort((a, b) => {
    const riskDiff =
      asarvoStabilityV3FiniteNumber(a.riskScore, 100) -
      asarvoStabilityV3FiniteNumber(b.riskScore, 100);
    if (riskDiff !== 0) return riskDiff;

    const confidenceDiff =
      asarvoStabilityV3FiniteNumber(b.sourceConfidence, 0) -
      asarvoStabilityV3FiniteNumber(a.sourceConfidence, 0);
    if (confidenceDiff !== 0) return confidenceDiff;

    return asarvoStabilityV3OfferKey(a).localeCompare(
      asarvoStabilityV3OfferKey(b)
    );
  })[0];

  const best = ranked[0];
  const bestKey = best ? asarvoStabilityV3OfferKey(best) : null;
  const cheapestKey = cheapest
    ? asarvoStabilityV3OfferKey(cheapest)
    : null;
  const safestKey = safest
    ? asarvoStabilityV3OfferKey(safest)
    : null;

  return ranked.map((offer) => {
    const key = asarvoStabilityV3OfferKey(offer);

    return {
      ...offer,
      bestOffer: bestKey !== null && key === bestKey,
      cheapestOffer:
        cheapestKey !== null && key === cheapestKey,
      safestOffer: safestKey !== null && key === safestKey,
    };
  });
}

export { normalizeAsarvoStabilityOfferUrl, asarvoStabilityV3DedupeAndRank };
