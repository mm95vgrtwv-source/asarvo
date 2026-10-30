"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type RawOffer = { name?: string; store?: string; price?: number; currency?: string; delivery?: string | null; url?: string; brand?: string; model?: string; variant?: string };
type ComparedGroup = { id: string; offers: { url: string; price: number; shippingCost: number | null; shippingKnown: boolean; total: number | null }[] };
type ComparisonResponse = { groups?: ComparedGroup[]; rejected?: { reason: string }[]; error?: string };
type Display = { raw: RawOffer; price: number; shippingCost: number | null; total: number | null; compareEligible: boolean; safeUrl: string };

// CORE094_SHIPPING_EXACT_ONLY: minimum/range shipping is not an exact checkout total.
function shippingOf(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const s = value.trim().toLowerCase().replace(/\s+/g, " ");
  if (/^(darmowa dostawa|dostawa gratis|bezpłatna dostawa|free delivery|wysyłka gratis)$/.test(s)) return 0;
  const match = s.match(/^(?:dostawa|wysyłka|koszt dostawy)\s*:?[ ]*(\d+(?:[,.]\d{1,2})?)\s*(?:zł|pln)$/);
  if (!match) return null;
  const cost = Number(match[1].replace(",", "."));
  return Number.isFinite(cost) && cost >= 0 ? cost : null;
}
function safeUrl(value: unknown): string {
  try { const url = new URL(String(value)); return url.protocol === "https:" || url.protocol === "http:" ? url.href : ""; }
  catch { return ""; }
}
function redirectUrl(url: string): boolean {
  try { const u = new URL(url); return /(^|\.)ceneo\.pl$/i.test(u.hostname) && /^\/Click\/Offer\/?$/i.test(u.pathname); }
  catch { return true; }
}
function money(value: number | null): string { return value === null ? "Nieznana" : value.toLocaleString("pl-PL", { style: "currency", currency: "PLN" }); }
function convert(rows: RawOffer[]): Display[] {
  return rows.filter((o) => o && Number.isFinite(o.price) && typeof o.price === "number" && o.price >= 0 && (!o.currency || o.currency.toUpperCase() === "PLN") && safeUrl(o.url)).map((raw) => {
    const price = raw.price as number;
    const shippingCost = shippingOf(raw.delivery);
    const url = safeUrl(raw.url);
    return { raw, price, shippingCost, total: shippingCost === null ? null : Math.round((price + shippingCost) * 100) / 100, compareEligible: !redirectUrl(url), safeUrl: url };
  });
}

// CORE085_LOCAL_USER_DATA: browser-only data; no account, telemetry or server persistence.
type SavedOffer = { url: string; name: string; store: string; price: number; savedAt: string };
const CORE085_HISTORY_KEY = "asarvo2.compare.history.v1";
const CORE085_FAVORITES_KEY = "asarvo2.compare.favorites.v1";
// CORE087_PRICE_TARGETS: local, per exact offer URL. No background polling.
const CORE087_TARGETS_KEY = "asarvo2.compare.price-targets.v1";
type Core087Targets = Record<string, number>;
function readTargets(): Core087Targets {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(CORE087_TARGETS_KEY) || "{}");
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const result: Core087Targets = {};
    for (const [url, target] of Object.entries(value)) {
      if (Object.keys(result).length >= 50) break;
      if (safeUrl(url) === url && typeof target === "number" && Number.isFinite(target) && target >= 0 && target <= 100000000) result[url] = target;
    }
    return result;
  } catch { return {}; }
}
function core087PriceStatus(target: number | undefined, current: number | undefined): "unconfigured" | "not-checked" | "reached" | "above" {
  if (target === undefined) return "unconfigured";
  if (current === undefined || !Number.isFinite(current)) return "not-checked";
  return current <= target ? "reached" : "above";
}
function readHistory(): string[] {
  try { const data: unknown = JSON.parse(localStorage.getItem(CORE085_HISTORY_KEY) || "[]"); return Array.isArray(data) ? data.filter((v): v is string => typeof v === "string" && v.length <= 220).slice(0, 20) : []; } catch { return []; }
}
function readFavorites(): SavedOffer[] {
  try {
    const data: unknown = JSON.parse(localStorage.getItem(CORE085_FAVORITES_KEY) || "[]");
    if (!Array.isArray(data)) return [];
    return data.filter((v): v is SavedOffer => v && typeof v === "object" && typeof v.url === "string" && !!safeUrl(v.url) && typeof v.name === "string" && typeof v.store === "string" && typeof v.price === "number" && Number.isFinite(v.price) && v.price >= 0 && typeof v.savedAt === "string").slice(0, 50);
  } catch { return []; }
}

export default function Core079ComparePage() {
  const [query, setQuery] = useState("dysk SSD Samsung 990 PRO 2TB");
  const [history, setHistory] = useState<string[]>([]);
  const [favorites, setFavorites] = useState<SavedOffer[]>([]);
  const [storageNotice, setStorageNotice] = useState("");
  const [targets, setTargets] = useState<Core087Targets>({});
  const [targetDrafts, setTargetDrafts] = useState<Record<string,string>>({});
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  useEffect(() => { setHistory(readHistory()); setFavorites(readFavorites()); setTargets(readTargets()); }, []);
  function saveTarget(url: string) {
    const input = (targetDrafts[url] ?? "").trim().replace(",", ".");
    const price = Number(input);
    if (!/^(?:\d+)(?:\.\d{1,2})?$/.test(input) || !Number.isFinite(price) || price < 0 || price > 100000000) {
      setStorageNotice("Podaj prawidlowa cene produktu w PLN (maksymalnie 2 miejsca po przecinku)."); return;
    }
    const next = { ...readTargets(), [url]: price };
    try { localStorage.setItem(CORE087_TARGETS_KEY, JSON.stringify(next)); setTargets(next); setStorageNotice("Zapisano prog ceny produktu (bez dostawy)."); }
    catch { setStorageNotice("Nie mozna zapisac progu ceny."); }
  }
  function removeTarget(url: string) {
    const next = readTargets(); delete next[url];
    try { localStorage.setItem(CORE087_TARGETS_KEY, JSON.stringify(next)); setTargets(next); setStorageNotice("Usunieto prog ceny."); }
    catch { setStorageNotice("Nie mozna usunac progu ceny."); }
  }
  function rememberQuery(value: string) {
    const normalized = value.trim().slice(0, 220);
    if (!normalized) return;
    const next = [normalized, ...readHistory().filter(q => q.toLowerCase() !== normalized.toLowerCase())].slice(0, 20);
    try { localStorage.setItem(CORE085_HISTORY_KEY, JSON.stringify(next)); setHistory(next); }
    catch { setStorageNotice("Nie mozna zapisac historii w tej przegladarce."); }
  }
  function clearHistory() {
    try { localStorage.removeItem(CORE085_HISTORY_KEY); setHistory([]); }
    catch { setStorageNotice("Nie mozna usunac historii w tej przegladarce."); }
  }
  function toggleFavorite(offer: Display) {
    const url = safeUrl(offer.safeUrl);
    if (!url) return;
    const current = readFavorites();
    const existing = current.some(v => v.url === url);
    const next = existing ? current.filter(v => v.url !== url) : [{url, name: (offer.raw.name || "Produkt bez nazwy").slice(0, 240), store: (offer.raw.store || new URL(url).hostname).slice(0, 100), price: offer.price, savedAt: new Date().toISOString()}, ...current].slice(0, 50);
    try { localStorage.setItem(CORE085_FAVORITES_KEY, JSON.stringify(next)); setFavorites(next); }
    catch { setStorageNotice("Nie mozna zapisac ulubionych w tej przegladarce."); }
  }
  function removeFavorite(url: string) {
    const next = readFavorites().filter(v => v.url !== url);
    try { localStorage.setItem(CORE085_FAVORITES_KEY, JSON.stringify(next)); setFavorites(next); }
    catch { setStorageNotice("Nie mozna usunac ulubionej oferty."); }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requested = params.get("q")?.trim() ?? "";
    if (requested && requested.length <= 220) {
      setQuery(requested);
      if (params.get("auto") === "1") void search(requested);
    }
    // Landing URL is evaluated once; user can edit and resubmit afterward.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [loading, setLoading] = useState(false);
  // CORE130: synchronous click/auto-search guard, independent of React render timing.
  const searchInFlightRef = useRef(false);
  const [error, setError] = useState("");
  const [offers, setOffers] = useState<Display[]>([]);
  // These prices are only from the most recently completed live ASARVO query.
  const livePricesByUrl = useMemo(() => {
    const current = new Map<string, number>();
    if (!checkedAt) return current;
    for (const offer of offers) current.set(offer.safeUrl, offer.price);
    return current;
  }, [offers, checkedAt]);
  const [groups, setGroups] = useState<ComparedGroup[]>([]);
  const [rejected, setRejected] = useState(0);
  const [sort, setSort] = useState<"price" | "total">("price");
  // CORE083_FILTER_UI_MARKER: filters do not alter verification or product identity.
  const [storeFilter, setStoreFilter] = useState("all");
  const [deliveryFilter, setDeliveryFilter] = useState<"all" | "known" | "unknown">("all");
  const stores = useMemo(() => [...new Set(offers.map(o => o.raw.store?.trim() || new URL(o.safeUrl).hostname))].sort((a,b)=>a.localeCompare(b,"pl")), [offers]);
  const filtered = useMemo(() => offers.filter(o => {
    const merchant = o.raw.store?.trim() || new URL(o.safeUrl).hostname;
    return (storeFilter === "all" || storeFilter === merchant) &&
      (deliveryFilter === "all" || (deliveryFilter === "known" ? o.total !== null : o.total === null));
  }), [offers, storeFilter, deliveryFilter]);
  const cheapestKnown = useMemo(() => {
    const known = filtered.filter(o => o.total !== null);
    if (!known.length) return null;
    return Math.min(...known.map(o => o.total as number));
  }, [filtered]);
  // CORE122: deterministic tie-breaks ONLY in the UI; preserves price priority and the API ranking.
  const sorted = useMemo(() => [...filtered].sort((a, b) => {
    const primary = sort === "total"
      ? ((a.total ?? Infinity) - (b.total ?? Infinity) || a.price - b.price)
      : a.price - b.price;
    if (Number.isFinite(primary) && primary !== 0) return primary;
    if (!Number.isFinite(primary)) {
      // Infinity - Infinity is NaN: unknown shipping belongs after known shipping.
      if (a.total === null && b.total !== null) return 1;
      if (a.total !== null && b.total === null) return -1;
    }
    return a.safeUrl < b.safeUrl ? -1 : a.safeUrl > b.safeUrl ? 1 : 0;
  }), [filtered, sort]);
  async function search(overrideQuery?: string) {
    const activeQuery = (overrideQuery ?? query).trim();
    if (searchInFlightRef.current || !activeQuery) return;
    searchInFlightRef.current = true;
    setLoading(true); setCheckedAt(null); setError(""); setOffers([]); setGroups([]); setRejected(0); setStoreFilter("all"); setDeliveryFilter("all");
    try {
      const r = await fetch("/api/search", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: activeQuery }) });
      if (!r.ok) throw new Error(`Wyszukiwanie HTTP ${r.status}`);
      const response: unknown = await r.json();
      const record = response as { offers?: unknown };
      if (!Array.isArray(record?.offers)) throw new Error("Brak tablicy offers w odpowiedzi wyszukiwarki");
      const valid = convert(record.offers as RawOffer[]); setOffers(valid); setCheckedAt(new Date().toISOString());
      rememberQuery(activeQuery);
      const eligible = valid.filter(x => x.compareEligible).slice(0, 100).map((x) => ({
        url: x.safeUrl, price: x.price, shippingCost: x.shippingCost, currency: "PLN",
        brand: typeof x.raw.brand === "string" ? x.raw.brand : undefined,
        model: typeof x.raw.model === "string" ? x.raw.model : undefined,
        variant: typeof x.raw.variant === "string" ? x.raw.variant : undefined,
      }));
      if (eligible.length) {
        const cr = await fetch("/api/compare", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ offers: eligible }) });
        if (!cr.ok) throw new Error(`Porównywarka HTTP ${cr.status}`);
        const cmp: ComparisonResponse = await cr.json();
        if (!Array.isArray(cmp.groups)) throw new Error(cmp.error || "Nieprawidłowa odpowiedź porównywarki");
        setGroups(cmp.groups.filter(g => g.offers.length > 1)); setRejected(cmp.rejected?.length ?? 0);
      }
    } catch (e) { setError(e instanceof Error ? e.message : "Nieznany błąd"); }
    finally { searchInFlightRef.current = false; setLoading(false); }
  }
  return <main className="asarvo-core086" style={{ maxWidth: 1060, margin: "24px auto", padding: "0 18px", fontFamily: "system-ui, sans-serif", color: "#162436" }}>

      {/* CORE086_DARK_CONTRAST: scoped, accessible dark styles; no changes to offer logic. */}
      <style>{`
        .asarvo-core086 { color: #e7edf6 !important; }
        .asarvo-core086 h1, .asarvo-core086 h2, .asarvo-core086 h3,
        .asarvo-core086 p, .asarvo-core086 strong, .asarvo-core086 label,
        .asarvo-core086 article div, .asarvo-core086 section, .asarvo-core086 li,
        .asarvo-core086 span { color: #e7edf6 !important; }
        .asarvo-core086 article, .asarvo-core086 section { background: #151b28 !important; border-color: #46556c !important; }
        .asarvo-core086 article { box-shadow: 0 5px 20px rgba(0, 0, 0, .12); }
        .asarvo-core086 article div:first-child { color: #afbdd2 !important; }
        .asarvo-core086 input, .asarvo-core086 select { background: #1c2738 !important; color: #f8fafc !important; border: 1px solid #71839b !important; border-radius: 8px; }
        .asarvo-core086 button { color: #f8fafc !important; background: #283950 !important; border: 1px solid #657891 !important; border-radius: 8px; }
        .asarvo-core086 button:hover:not(:disabled), .asarvo-core086 button:focus-visible { background: #37516d !important; outline: 2px solid #93c5fd; outline-offset: 2px; }
        .asarvo-core086 button:disabled { opacity: .6; cursor: not-allowed; }
        .asarvo-core086 a { color: #80bbff !important; text-underline-offset: 3px; }
        .asarvo-core086 a:hover, .asarvo-core086 a:focus-visible { color: #bedbff !important; }
        .asarvo-core086 [role="alert"] { color: #ffb4b4 !important; }
        .asarvo-core086 [aria-label="Najniższa znana suma w filtrze"] { color: #93c5fd !important; }
        .asarvo-core086 ::placeholder { color: #bcc8d8; }
        @media (max-width: 600px) { .asarvo-core086 { padding: 0 12px !important; } .asarvo-core086 article { padding: 14px !important; } }
      `}</style>
    <a href="/mvp" style={{ color: "#2563eb" }}>← Wróć do ASARVO</a>
    <h1 style={{ fontSize: 30, marginBottom: 5 }}>ASARVO — porównanie ofert</h1>
    <p>Wyniki LIVE z wyszukiwarki. Koszt dostawy nie jest zgadywany; podobne produkty bez dowodu tożsamości nie są łączone.</p>
    <form onSubmit={(e) => { e.preventDefault(); void search(); }} style={{ display: "flex", flexWrap: "wrap", gap: 8, margin: "20px 0" }}>
      <input aria-label="Wyszukiwany produkt" value={query} onChange={e => setQuery(e.target.value)} style={{ flex: "1 1 280px", border: "1px solid #b9c3d0", borderRadius: 8, padding: 12 }} />
      <button disabled={loading} style={{ background: "#2563eb", color: "white", border: "none", padding: "12px 22px", borderRadius: 8, cursor: "pointer" }}>{loading ? "Szukam…" : "Szukaj i porównaj"}</button>
    </form>
    {storageNotice && <p role="status">{storageNotice}</p>}
    <section aria-label="Historia wyszukiwan" style={{ margin: "16px 0", padding: 14, background: "#f1f5f9", borderRadius: 10 }}>
      <h2 style={{ fontSize: 18, margin: "0 0 8px" }}>Historia wyszukiwan (na tym urzadzeniu)</h2>
      {history.length === 0 ? <p>Brak zapisanych wyszukiwan.</p> : <><div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>{history.map(q => <button key={q} type="button" onClick={() => { setQuery(q); void search(q); }} style={{ border: "1px solid #a6b5c7", borderRadius: 8, padding: 8, background: "white", cursor: "pointer" }}>{q}</button>)}</div><button type="button" onClick={clearHistory} style={{ marginTop: 10 }}>Wyczysc historie</button></>}
    </section>
    <section aria-label="Ulubione oferty" style={{ margin: "16px 0", padding: 14, border: "1px solid #cbd5e1", borderRadius: 10 }}>
      <h2 style={{ fontSize: 18, margin: "0 0 8px" }}>Ulubione oferty ({favorites.length})</h2>
      <p style={{ fontSize: 12 }}>Zapis lokalny. Cena jest migawka z chwili zapisania, nie aktualna oferta.</p>
      {favorites.length === 0 ? <p>Nie zapisano jeszcze ofert.</p> : <ul style={{ paddingLeft: 18 }}>{favorites.map(f => {
        const current = livePricesByUrl.get(f.url);
        const status = core087PriceStatus(targets[f.url], current);
        return <li key={f.url} style={{ marginBottom: 16 }}>
          <a href={f.url} target="_blank" rel="noopener noreferrer">{f.name}</a> — {f.store}, zapisano za {money(f.price)}
          <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
            <label htmlFor={`target-${encodeURIComponent(f.url)}`}>Prog ceny produktu (PLN):</label>
            <input id={`target-${encodeURIComponent(f.url)}`} type="text" inputMode="decimal" placeholder={targets[f.url] === undefined ? "np. 999,99" : String(targets[f.url])} value={targetDrafts[f.url] ?? ""} onChange={e => setTargetDrafts(prev => ({ ...prev, [f.url]: e.target.value }))} style={{ padding: 8, maxWidth: 125 }} />
            <button type="button" onClick={() => saveTarget(f.url)}>Zapisz prog</button>
            {targets[f.url] !== undefined && <button type="button" onClick={() => removeTarget(f.url)}>Usun prog</button>}
            <button type="button" disabled={loading} onClick={() => { setQuery(f.name); void search(f.name); }}>Sprawdz ponownie</button>
            <button type="button" onClick={() => removeFavorite(f.url)}>Usun ulubiona</button>
          </div>
          {targets[f.url] !== undefined && <p role="status" style={{ fontSize: 13, margin: "6px 0" }}>
            Prog: {money(targets[f.url])}. {status === "reached" ? `Osiagniety: cena produktu ${money(current ?? null)} w ostatnich wynikach ASARVO.` : status === "above" ? `Nieosiagniety: cena produktu ${money(current ?? null)} w ostatnich wynikach ASARVO.` : "Nie sprawdzono: brak tej samej oferty URL w ostatnich wynikach. Nie znamy aktualnej ceny."}
            {checkedAt && status !== "not-checked" ? ` Sprawdzono: ${new Date(checkedAt).toLocaleString("pl-PL")}.` : ""}
          </p>}
        </li>;
      })}</ul>}
    </section>
    {error && <p role="alert" style={{ color: "#b91c1c" }}>Błąd: {error}</p>}
    {offers.length > 0 && <><p><strong>{offers.length} ofert</strong> · {groups.length} grup wieloofertowych z potwierdzoną tożsamością · {rejected} odrzuconych przez porównywarkę</p>
      <p style={{ fontSize: 13, color: "#546174" }}>Przekierowania Ceneo wyświetlamy osobno: parametr adresu może wskazywać inny produkt. Suma „cena + dostawa” jest dostępna wyłącznie dla jawnie określonej dostawy; sortowanie po sumie przesuwa nieznane koszty na koniec.</p>
      <label>Sortowanie: <select value={sort} onChange={e => setSort(e.target.value as "price" | "total")} style={{ padding: 8, margin: 6 }}><option value="price">Cena produktu</option><option value="total">Cena z dostawą (jeżeli znana)</option></select></label>
      <div aria-label="Filtry ofert" style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", margin: "14px 0" }}>
        <label>Sklep: <select aria-label="Filtr sklepu" value={storeFilter} onChange={e => setStoreFilter(e.target.value)} style={{ padding: 8 }}><option value="all">Wszystkie sklepy</option>{stores.map(s => <option key={s} value={s}>{s}</option>)}</select></label>
        <label>Dostawa: <select aria-label="Filtr dostawy" value={deliveryFilter} onChange={e => setDeliveryFilter(e.target.value as "all" | "known" | "unknown")} style={{ padding: 8 }}><option value="all">Wszystkie</option><option value="known">Znany koszt</option><option value="unknown">Nieznany koszt</option></select></label>
        <span role="status">Widoczne oferty: {sorted.length} z {offers.length}</span>
      </div>
      {cheapestKnown !== null && <p style={{ padding: 12, background: "#eff6ff", borderRadius: 8 }}>Najniższa znana cena z dostawą w aktualnym filtrze: <strong>{money(cheapestKnown)}</strong>. Nie jest to gwarancja najtańszego identycznego produktu ani cena ofert z nieznaną dostawą.</p>}
      <div style={{ display: "grid", gap: 12, marginTop: 16 }}>
        {sorted.map((o, i) => <article key={`${o.safeUrl}-${i}`} style={{ padding: 16, border: "1px solid #dde4ed", borderRadius: 12 }}>
          <div style={{ fontSize: 13, color: "#58677a" }}>{o.raw.store || new URL(o.safeUrl).hostname}</div>
          <div style={{ fontWeight: 650, margin: "6px 0" }}>{o.raw.name || "Produkt bez nazwy"}</div>
          <div>Cena produktu: <strong>{money(o.price)}</strong></div>
          <div>Dostawa: {money(o.shippingCost)}</div>
          <div>Cena z dostawą: <strong>{money(o.total)}</strong> {o.total !== null && cheapestKnown !== null && o.total === cheapestKnown ? <span aria-label="Najniższa znana suma w filtrze" style={{ fontSize: 12, color: "#1d4ed8" }}>· Najniższa znana suma w filtrze</span> : null}</div>
          <a href={o.safeUrl} target="_blank" rel="noopener noreferrer" style={{ color: "#2563eb" }}>Przejdź do oferty ↗</a>
          <button type="button" aria-label={favorites.some(f => f.url === o.safeUrl) ? "Usun z ulubionych" : "Dodaj do ulubionych"} onClick={() => toggleFavorite(o)} style={{ marginLeft: 12, padding: 8, cursor: "pointer" }}>{favorites.some(f => f.url === o.safeUrl) ? "★ W ulubionych" : "☆ Dodaj do ulubionych"}</button>
        </article>)}
      </div>
      {/* CORE084_GROUP_WINNER_MARKER: only compare within API-confirmed same-variant groups. */}
      <section style={{ marginTop: 28 }} aria-label="Porownanie potwierdzonych wariantow">
        <h2>Porównanie identycznych wariantów</h2>
        {groups.length === 0 && <p role="status">Brak grup z co najmniej dwiema ofertami o potwierdzonej tożsamości. Nie wskazujemy zwycięzcy pomiędzy różnymi produktami.</p>}
        {groups.map((g, i) => {
          const valid = g.offers.filter(o => Number.isFinite(o.price) && o.price >= 0 && safeUrl(o.url));
          const known = valid.filter(o => o.shippingKnown === true && typeof o.total === "number" && Number.isFinite(o.total) && o.total >= 0);
          const best = [...known].sort((a, b) => (a.total as number) - (b.total as number) || a.price - b.price)[0] ?? null;
          const missingShipping = valid.length - known.length;
          return <article key={g.id + i} style={{ border: "1px solid #cbd5e1", padding: 16, borderRadius: 12, marginBottom: 12 }}>
            <h3>Grupa {i + 1}: {valid.length} ofert tego samego wariantu</h3>
            {best ? <p><strong>Najniższa potwierdzona suma w tej grupie: {money(best.total)}</strong> ({money(best.price)} + dostawa {money(best.shippingCost)}). {missingShipping > 0 ? "To nie jest gwarancja najniższej ceny: część ofert ma nieznaną dostawę." : "Porównano wszystkie oferty tej grupy z rozpoznaną ceną dostawy."}</p> : <p>Nie można wskazać najtańszej ceny z dostawą: brak potwierdzonych kosztów dostawy.</p>}
            <ol>{valid.map((o, j) => <li key={o.url + j} style={{ marginBottom: 8 }}>
              <a href={safeUrl(o.url)} rel="noopener noreferrer" target="_blank">Oferta {j + 1}</a> — cena {money(o.price)}, dostawa {o.shippingKnown ? money(o.shippingCost) : "nieznana"}, razem {o.shippingKnown ? money(o.total) : "nieznana"}
              {best && o.url === best.url && o.total === best.total ? " — najniższa potwierdzona suma w tej grupie" : ""}
            </li>)}</ol>
          </article>;
        })}
      </section>
    </>}
  </main>;
}
