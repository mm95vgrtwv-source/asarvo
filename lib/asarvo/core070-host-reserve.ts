// CORE070: bounded candidate scheduling only, no verification or acceptance change.
export type Core070Candidate = { url?: string; host?: string };
export function core070Host(row: Core070Candidate): string | null {
  if (!row || typeof row !== "object") return null;
  for (const key of ["host", "url"] as const) {
    const raw = row[key];
    if (typeof raw !== "string" || !raw.trim()) continue;
    try {
      const u = new URL(raw.includes("://") ? raw : `https://${raw}`);
      if (u.protocol !== "https:" && u.protocol !== "http:") continue;
      const host = u.hostname.toLowerCase().replace(/^www\./, "");
      if (!host.includes(".") || host.length > 253) continue;
      return host;
    } catch { /* invalid candidate */ }
  }
  return null;
}
export function core070ReserveVerifiedQueue<T extends Core070Candidate>(candidates: T[], reserve = 3): T[] {
  if (!Array.isArray(candidates)) return candidates;
  if (!Number.isSafeInteger(reserve) || reserve < 0) return candidates;
  const selected: T[] = [];
  const represented = new Set<string>();
  const used = new Set<T>();
  for (const row of candidates) {
    if (selected.length >= reserve) break;
    if (!row || typeof row.url !== "string") continue;
    let url: URL;
    try { url = new URL(row.url); } catch { continue; }
    if (url.protocol !== "https:" && url.protocol !== "http:") continue;
    const host = core070Host(row);
    if (!host || represented.has(host)) continue;
    represented.add(host); used.add(row); selected.push(row);
  }
  for (const row of candidates) if (!used.has(row)) selected.push(row);
  return selected.length === candidates.length ? selected : candidates;
}
