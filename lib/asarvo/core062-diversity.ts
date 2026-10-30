/** CORE062: stable host diversity after the three highest-ranked verified offers.
 * Reorders only already verified offers; never creates or admits an offer.
 */
export type MerchantOffer = {url?: string; store?: string};
export function diversifyVerifiedOffers<T extends MerchantOffer>(offers: readonly T[]): T[] {
  if (offers.length <= 4) return [...offers];
  const pinned = offers.slice(0,3);
  const rest = offers.slice(3);
  const host = (o:T):string => {
    try { const u = new URL(o.url ?? ''); return u.protocol==='https:' ? u.hostname.replace(/^www\./,'').toLowerCase() : 'unknown'; }
    catch { return 'unknown'; }
  };
  const groups = new Map<string,T[]>();
  for (const o of rest) { const k = host(o); if (!groups.has(k)) groups.set(k,[]); groups.get(k)!.push(o); }
  // CORE068_VERIFIED_FAIR_TAIL: prefer host groups not already in pinned top 3.
  // Only stable reordering of accepted offers; never changes admission, verification or pricing.
  const pinnedHosts = new Set(pinned.map(host));
  const orderedGroups = [...groups.entries()].sort(([hostA], [hostB]) =>
    Number(pinnedHosts.has(hostA)) - Number(pinnedHosts.has(hostB))
  );
  const result:T[] = [...pinned];
  while (result.length < offers.length) {
    let moved = false;
    for (const [, group] of orderedGroups) { if (group.length) { result.push(group.shift()!); moved=true; } }
    if (!moved) break;
  }
  return result;
}
