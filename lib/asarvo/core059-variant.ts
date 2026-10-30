/** ASARVO CORE059: pure capacity mismatch guard, never creates positive product proof. */
export type VariantSafety = { conflict: boolean; reason: 'no_capacity'|'single_match'|'explicit_conflict'|'ambiguous'; requestedGb: number[]; offeredGb: number[] };
const normalized = (s: string) => String(s ?? '').normalize('NFKC').toLowerCase();
function capacities(s: string): number[] {
  const out = new Set<number>();
  const re = /(^|[^a-z0-9])([0-9]+(?:[.,][0-9]+)?)\s*(tb|gb)(?![a-z])/giu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(normalized(s))) !== null) {
    const n = Number(m[2].replace(',', '.'));
    if (!Number.isFinite(n) || n <= 0 || n > 100000) continue;
    out.add(Math.round(n * (m[3].toLowerCase() === 'tb' ? 1000 : 1)));
  }
  return [...out].sort((a,b)=>a-b);
}
export function checkExplicitCapacityConflict(requested: string, offered: string): VariantSafety {
  const requestedGb = capacities(requested), offeredGb = capacities(offered);
  if (!requestedGb.length || !offeredGb.length) return {conflict:false,reason:'no_capacity',requestedGb,offeredGb};
  if (requestedGb.length !== 1 || offeredGb.length !== 1) return {conflict:false,reason:'ambiguous',requestedGb,offeredGb};
  return {conflict:requestedGb[0] !== offeredGb[0],reason:requestedGb[0] !== offeredGb[0]?'explicit_conflict':'single_match',requestedGb,offeredGb};
}
