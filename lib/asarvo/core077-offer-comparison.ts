/** CORE077: conservative offer comparison. No network access, no fabricated delivery. */
export type ComparisonOffer = {
  url: string;
  price: number;
  shippingCost?: number | null;
  currency?: string;
  brand?: string;
  model?: string;
  variant?: string;
};
export type EvaluatedOffer = {
  valid: boolean; reason?: string; url?: string; price?: number;
  shippingCost?: number | null; total?: number | null;
  shippingKnown?: boolean; identity?: string | null;
};
export function finiteMoney(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
function normalizeText(value: unknown): string {
  return String(value ?? '').normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
}
export function normalizeModel(value: unknown): string {
  return normalizeText(value).replace(/[^a-z0-9]/g, '');
}
export function canonicalUrl(value: unknown): string | null {
  try {
    const url = new URL(String(value));
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    url.hash = ''; url.search = '';
    return url.origin.toLowerCase() + url.pathname.replace(/\/+$/, '/');
  } catch { return null; }
}
export function identity(offer: Partial<ComparisonOffer> | null | undefined): string | null {
  if (!offer || typeof offer !== 'object') return null;
  const brand = normalizeModel(offer.brand), model = normalizeModel(offer.model), variant = normalizeModel(offer.variant);
  if (brand && model && variant) return `model:${brand}:${model}:${variant}`;
  const url = canonicalUrl(offer.url);
  return url ? `url:${url}` : null;
}
export function evaluateOffer(offer: Partial<ComparisonOffer> | null | undefined): EvaluatedOffer {
  if (!offer || typeof offer !== 'object') return { valid: false, reason: 'invalid_object' };
  const url = canonicalUrl(offer.url);
  if (!url) return { valid: false, reason: 'invalid_url' };
  const price = finiteMoney(offer.price);
  if (price === null) return { valid: false, reason: 'invalid_price' };
  if (offer.currency !== undefined && normalizeText(offer.currency) !== 'pln') return { valid: false, reason: 'currency_not_pln' };
  const shippingCost = finiteMoney(offer.shippingCost);
  const total = shippingCost === null ? null : finiteMoney(price + shippingCost);
  return { valid: true, url, price, shippingCost, total, shippingKnown: shippingCost !== null, identity: identity(offer) };
}
export function compareOffers(a: Partial<ComparisonOffer>, b: Partial<ComparisonOffer>): {
  comparable: boolean; reason?: string; cheaper?: 'a' | 'b' | 'tie'; a?: EvaluatedOffer; b?: EvaluatedOffer;
} {
  const ea = evaluateOffer(a), eb = evaluateOffer(b);
  if (!ea.valid || !eb.valid) return { comparable: false, reason: 'invalid_offer' };
  if (!ea.identity || ea.identity !== eb.identity) return { comparable: false, reason: 'identity_not_proven' };
  if (ea.total === null || eb.total === null) return { comparable: false, reason: 'shipping_unknown', a: ea, b: eb };
  if (ea.total === undefined || eb.total === undefined) return { comparable: false, reason: 'shipping_unknown', a: ea, b: eb };
  return { comparable: true, cheaper: ea.total === eb.total ? 'tie' : ea.total < eb.total ? 'a' : 'b', a: ea, b: eb };
}
export function groupOffers(rows: Partial<ComparisonOffer>[]): {
  groups: { id: string; offers: (EvaluatedOffer & { source: Partial<ComparisonOffer> })[] }[];
  rejected: { reason: string; row: Partial<ComparisonOffer> }[];
} {
  if (!Array.isArray(rows)) throw new TypeError('rows must be an array');
  const groups = new Map<string, (EvaluatedOffer & { source: Partial<ComparisonOffer> })[]>();
  const rejected: { reason: string; row: Partial<ComparisonOffer> }[] = [];
  for (const row of rows) {
    const evaluated = evaluateOffer(row);
    if (!evaluated.valid || !evaluated.identity) { rejected.push({ reason: evaluated.reason || 'missing_identity', row }); continue; }
    if (!groups.has(evaluated.identity)) groups.set(evaluated.identity, []);
    groups.get(evaluated.identity)!.push({ ...evaluated, source: row });
  }
  return { groups: [...groups].map(([id, offers]) => ({ id, offers: offers.sort((a, b) =>
    (a.total === null || a.total === undefined ? Infinity : a.total) -
    (b.total === null || b.total === undefined ? Infinity : b.total) || (a.price ?? 0) - (b.price ?? 0)
  ) })), rejected };
}
