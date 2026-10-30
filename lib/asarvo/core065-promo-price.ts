/** CORE065: reject only offers whose displayed amount is demonstrably a promotional benefit.
 * Conservatively requires BOTH an explicit future-shopping benefit phrase in the same offer title
 * AND matching offer price. Never infers a replacement price from other products.
 */
export type PromoPriceDecision = { suspect: boolean; reason: string };
export function core065PromoPriceDecision(title: unknown, price: unknown): PromoPriceDecision {
  if (typeof title !== 'string' || typeof price !== 'number' || !Number.isFinite(price) || price <= 0) return {suspect:false,reason:'insufficient-evidence'};
  const normalized = title.toLocaleLowerCase('pl-PL').replace(/\s+/g,' ');
  const money = normalized.match(/(?:nawet|do)\s+(\d[\d\s]*(?:[,.]\d{1,2})?)\s*z[łl]\s+na\s+(?:kolejne|nast[eę]pne|przysz[łl]e)\s+zakupy/iu);
  if (!money) return {suspect:false,reason:'no-future-purchase-benefit'};
  const benefit = Number(money[1].replace(/\s/g,'').replace(',','.'));
  if (!Number.isFinite(benefit) || benefit <= 0) return {suspect:false,reason:'invalid-benefit'};
  // A product can actually cost the same as a voucher; require a high-value item category and strong wording.
  const highValueProduct = /\b(?:rower\s+elektryczn\w*|e[- ]?bike|laptop|pralk\w*|telewizor\w*)\b/iu.test(normalized);
  if (!highValueProduct) return {suspect:false,reason:'weak-product-evidence'};
  return {suspect:Math.abs(price-benefit)<0.005, reason:Math.abs(price-benefit)<0.005?'promotion-misbound-as-product-price':'price-does-not-equal-benefit'};
}
export function filterCore065PromotionMisprices<T extends {name?:unknown;title?:unknown;price?:unknown;totalPrice?:unknown}>(offers: T[]): { offers:T[]; rejected:number } {
  const kept = offers.filter(o => {
    const price = typeof o.totalPrice==='number' && o.totalPrice>0 ? o.totalPrice : o.price;
    return !core065PromoPriceDecision(typeof o.name==='string'?o.name:o.title,price).suspect;
  });
  return {offers:kept,rejected:offers.length-kept.length};
}
