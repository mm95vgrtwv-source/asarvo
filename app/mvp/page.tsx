"use client";
import React, { useEffect, useMemo, useState } from "react";
import styles from "./mvp.module.css";
import { asarvoStabilityV3DedupeAndRank } from "@/lib/asarvo/legacy-stability";

type Offer = { id?: number | string; name?: string; store?: string; price?: number; totalPrice?: number; currency?: string; url?: string; condition?: string | null; delivery?: string | null; rating?: number | null; verification?: string; priceVerified?: boolean; availability?: string; description?: string };
type SearchData = { success?: boolean; offers?: Offer[]; found?: number; resultStatus?: string; message?: string; error?: string; coverage?: { discoveredCandidates?: number; verificationCandidates?: number } };
type SavedOffer = Offer & { savedId: string };
const FAVORITES_KEY = "asarvo_mvp_v1_favorites";
const HISTORY_KEY = "asarvo_mvp_v1_history";
const offerKey = (o: Offer) => (o.url || `${o.store || ""}::${o.name || ""}::${o.price ?? ""}`).trim();
const priceOf = (o: Offer) => typeof o.totalPrice === "number" ? o.totalPrice : typeof o.price === "number" ? o.price : Number.POSITIVE_INFINITY;
const money = (n: number, currency: string = "PLN") => Number.isFinite(n) ? new Intl.NumberFormat("pl-PL",{style:"currency",currency:currency === "PLN" ? "PLN" : "PLN"}).format(n) : "Cena nieznana";
function safeHref(raw?: string): string | null { if(!raw) return null; try { const u = new URL(raw); return u.protocol === "https:" || u.protocol === "http:" ? u.href : null; } catch { return null; } }
function readStored<T>(key: string, fallback: T): T { try { const value = localStorage.getItem(key); const parsed = value ? JSON.parse(value) : fallback; return Array.isArray(parsed) ? parsed as T : fallback; } catch { return fallback; } }
export default function MvpPage() {
  const [input,setInput]=useState(""); const [query,setQuery]=useState(""); const [data,setData]=useState<SearchData|null>(null);
  const [busy,setBusy]=useState(false); const [error,setError]=useState(""); const [sort,setSort]=useState("recommended"); const [store,setStore]=useState("all");
  const [maxPrice,setMaxPrice]=useState(""); const [favorites,setFavorites]=useState<SavedOffer[]>([]); const [history,setHistory]=useState<string[]>([]);
  const [compare,setCompare]=useState<string[]>([]); const [tab,setTab]=useState<"results"|"favorites">("results"); const [ready,setReady]=useState(false);
  useEffect(()=> { setFavorites(readStored<SavedOffer[]>(FAVORITES_KEY,[])); setHistory(readStored<string[]>(HISTORY_KEY,[])); setReady(true); },[]);
  useEffect(()=> {if(ready) localStorage.setItem(FAVORITES_KEY,JSON.stringify(favorites));},[favorites,ready]);
  useEffect(()=> {if(ready) localStorage.setItem(HISTORY_KEY,JSON.stringify(history));},[history,ready]);
  async function search(text?: string) {
    const q=(text ?? input).trim();if(!q || busy) return; setInput(q);setQuery(q);setTab("results");setBusy(true);setData(null);setError("");setStore("all");setMaxPrice("");setCompare([]);
    setHistory(prev=>[q,...prev.filter(v=>v.toLowerCase()!==q.toLowerCase())].slice(0,8));
    const controller=new AbortController(); const timeout=setTimeout(()=>controller.abort(),65000);
    try {const r=await fetch("/api/search",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({query:q,country:"PL"}),signal:controller.signal,cache:"no-store"});
      const payload:SearchData=await r.json();if(!r.ok || payload.success===false) throw new Error(payload.error || `Błąd wyszukiwarki HTTP ${r.status}`);setData(payload);
    } catch(e) {setError(e instanceof Error && e.name==="AbortError" ? "Wyszukiwanie przekroczyło limit czasu. Spróbuj ponownie." : e instanceof Error ? e.message : "Nie udało się połączyć z wyszukiwarką.");}
    finally{clearTimeout(timeout);setBusy(false);}
  }
  // RELEASE 1.0: UI-side fail-closed guard for visibly foreign SSD categories.
  // Does not replace API verification; it prevents known wrong-class cards reaching the MVP view.
  const isSsdSearch = /\b(?:ssd|nvme)\b/i.test(query) && /\b(?:dysk|drive|storage|ssd|nvme)\b/i.test(query);
  function releaseOfferAllowed(o: Offer): boolean {
    if (!isSsdSearch) return true;
    const title = String(o.name || "");
    const ssdEvidence = /\b(?:ssd|nvme|solid[ -]?state|dysk|drive)\b/i.test(title);
    const foreignClass = /\b(?:telewizor\w*|television|qled|oled|tv|monitor|flipchart|interaktywny(?:\s+ekran)?|interactive\s+(?:display|flat\s+panel)|smartfon|smartphone|tablet|laptop|notebook)\b/i.test(title);
    const accessory = /^\s*(?:etui|pokrowiec|futerał|futeral)\b/i.test(title);
    return !accessory && !(foreignClass && !ssdEvidence);
  }
  const apiOffers = Array.isArray(data?.offers) ? data!.offers! : [];
  const guardedOffers = apiOffers.filter(releaseOfferAllowed);
  // ASARVO_CORE018_OPT_IN_RANKING â€” opt-in UI-only comparison, never alters API, cached offers or default output.
  const rankedResults = useMemo(() => {
    if (sort !== "legacy" || tab !== "results") return guardedOffers;
    return asarvoStabilityV3DedupeAndRank(guardedOffers as unknown as Array<Record<string, unknown>>) as Offer[];
  }, [guardedOffers, sort, tab]);
  const raw = tab === "favorites" ? favorites.filter(releaseOfferAllowed) : rankedResults;
  const stores=useMemo(()=>[...new Set(raw.map(o=>o.store).filter((v):v is string=>!!v))].sort((a,b)=>a.localeCompare(b,"pl")),[raw]);
  const visible=useMemo(()=>{let list=raw.filter(o=>(store==="all" || o.store===store) && (!maxPrice || (Number.isFinite(priceOf(o)) && priceOf(o)<=Number(maxPrice))));
    if(sort==="cheap")list=[...list].sort((a,b)=>priceOf(a)-priceOf(b)); if(sort==="expensive")list=[...list].sort((a,b)=>priceOf(b)-priceOf(a)); return list;},[raw,store,maxPrice,sort]);
  const favorited=new Set(favorites.map(o=>o.savedId)); const chosen=raw.filter(o=>compare.includes(offerKey(o))).slice(0,3);
  function toggleFavorite(o:Offer){const id=offerKey(o);setFavorites(prev=>prev.some(x=>x.savedId===id) ? prev.filter(x=>x.savedId!==id): [{...o,savedId:id},...prev].slice(0,150));}
  function toggleCompare(o:Offer){const id=offerKey(o);setCompare(prev=>prev.includes(id) ? prev.filter(x=>x!==id) : prev.length<3 ? [...prev,id]:prev);}
  return <main className={styles.page}>
    <div className={styles.container}>
      <header className={styles.header}><div><div className={styles.eyebrow}>ASARVO • WERSJA MVP 1.0</div><h1>Znajdź produkt. Porównaj oferty.</h1><p className={styles.muted}>Jedno wyszukiwanie, wiele sklepów. Pokazujemy tylko oferty zwrócone przez silnik — bez wymyślonych cen.</p></div><a className={styles.homeLink} href="/">Obecna strona ↗</a></header>
      <form className={styles.search} onSubmit={e=>{e.preventDefault();void search();}}><label htmlFor="q" className={styles.srOnly}>Szukany produkt</label><input id="q" value={input} onChange={e=>setInput(e.target.value)} placeholder="Np. iPhone 15 128 GB, dysk SSD Samsung..." maxLength={180} /><button type="submit" disabled={busy || !input.trim()}>{busy?"Szukam...":"Szukaj"}</button></form>
      {history.length>0 && <div className={styles.history}><span>Ostatnie:</span>{history.slice(0,4).map(x=><button key={x} onClick={()=>void search(x)} disabled={busy}>{x}</button>)}</div>}
      <div className={styles.tabs}><button aria-pressed={tab==="results"} className={tab==="results"?styles.active:""} onClick={()=>setTab("results")}>Wyniki {data ? `(${guardedOffers.length})`:""}</button><button aria-pressed={tab==="favorites"} className={tab==="favorites"?styles.active:""} onClick={()=>{setTab("favorites");setStore("all");setCompare([]);}}>Ulubione ({favorites.length})</button></div>
      {busy && <div role="status" className={styles.info}>Trwa wyszukiwanie. Niektóre sklepy mogą odpowiadać wolno...</div>}
      {error && <div role="alert" className={styles.error}>{error} <button onClick={()=>void search(query)} disabled={busy}>Spróbuj ponownie</button></div>}
      {tab==="results" && !busy && data && apiOffers.length>guardedOffers.length && <div className={styles.info}>Ukryto {apiOffers.length-guardedOffers.length} ofert o niezgodnej kategorii. Zgłoś je do poprawy silnika ASARVO.</div>}
      {tab==="results" && !busy && data && <div className={styles.info}>{guardedOffers.length ? `Znaleziono ${guardedOffers.length} ofert. Ceny i dostępność mogą się zmieniać.` : `Brak ofert spełniających kontrolę jakości dla „${query}”. ${data.message||"Spróbuj bardziej szczegółowego zapytania."}`}</div>}
      {tab==="results" && !data && !busy && !error && <div className={styles.empty}><h2>Wyszukaj pierwszy produkt</h2><p>Na początek wypróbuj produkt, który jest obecnie obsługiwany przez źródła ASARVO.</p><div className={styles.suggestions}>{["dysk SSD Samsung","iPhone 15 128 GB","pralka Samsung"].map(x=><button key={x} onClick={()=>void search(x)}>{x}</button>)}</div></div>}
      {(tab==="favorites"||!!data) && <section className={styles.layout}>
        <aside className={styles.filters}><h2>Filtry i sortowanie</h2><label>Sklep<select value={store} onChange={e=>setStore(e.target.value)}><option value="all">Wszystkie sklepy</option>{stores.map(x=><option key={x}>{x}</option>)}</select></label><label>Maksymalna cena (zł)<input type="number" min="0" step="1" value={maxPrice} onChange={e=>setMaxPrice(e.target.value)} placeholder="Dowolna" /></label><label>Sortowanie<select value={sort} onChange={e=>setSort(e.target.value)}><option value="recommended">Kolejność ASARVO</option><option value="legacy">Odzyskany ranking (test 2.0)</option><option value="cheap">Najniższa cena</option><option value="expensive">Najwyższa cena</option></select></label><div className={styles.muted}>Wyświetlono {visible.length} z {raw.length} ofert.</div></aside>
        <section className={styles.results} aria-label="Oferty produktów">{visible.length===0 ? <div className={styles.empty}><h2>{tab==="favorites"?"Nie masz jeszcze ulubionych":"Brak ofert pasujących do filtrów"}</h2><p>Usuń filtry lub spróbuj innego produktu.</p></div> : <div className={styles.cards}>{visible.map((o,i)=>{const href=safeHref(o.url);const key=offerKey(o);return <article className={styles.card} key={`${key}:${i}`}><div className={styles.productTitle}>{o.name||"Produkt bez nazwy"}</div><div className={styles.store}>{o.store||"Nieznany sprzedawca"}</div><div className={styles.price}>{money(priceOf(o),o.currency)}</div><div className={styles.meta}>{o.delivery||"Dostawa: sprawdź w sklepie"} · {o.condition||"Stan: nieustalony"}</div><div className={styles.meta}>{o.priceVerified ? "✓ Cena potwierdzona przez silnik" : "Cena wymaga sprawdzenia"}</div><div className={styles.actions}>{href?<a href={href} target="_blank" rel="noopener noreferrer nofollow">Przejdź do oferty ↗</a>:<span>Brak bezpiecznego linku</span>}<button aria-label="Dodaj lub usuń z ulubionych" aria-pressed={favorited.has(key)} onClick={()=>toggleFavorite(o)}>{favorited.has(key)?"♥ Zapisano":"♡ Zapisz"}</button><button onClick={()=>toggleCompare(o)} aria-pressed={compare.includes(key)}>{compare.includes(key)?"✓ Porównuję":"Porównaj"}</button></div></article>;})}</div>}</section>
      </section>}
      {chosen.length>0 && <section className={styles.comparison}><div className={styles.comparisonHeader}><h2>Porównanie ({chosen.length}/3)</h2><button onClick={()=>setCompare([])}>Wyczyść</button></div><div className={styles.compareGrid}>{chosen.map(o=><div key={offerKey(o)}><strong>{o.name}</strong><p>{o.store}</p><b>{money(priceOf(o))}</b><p>{o.delivery||"Dostawa do sprawdzenia"}</p></div>)}</div></section>}
      <footer className={styles.footer}>ASARVO MVP 1.0 • Wersja rozwojowa. Serwis nie sprzedaje produktów. Dostępność i końcową cenę sprawdź bezpośrednio u sprzedawcy. Ulubione i historia są zapisywane lokalnie w tej przeglądarce.</footer>
    </div></main>;
}
