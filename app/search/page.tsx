"use client";

// ASARVO_RESULTS_UI_V6_3_OPTIONAL_IMAGES
// ASARVO_RESULTS_UI_V6_2_SINGLE_RESULT_TRUTH
// ASARVO_RESULTS_UI_V6_1_PRICE_PANEL_MICRO
// ASARVO_RESULTS_UI_V6_FIX1_BUILD
// ASARVO_RESULTS_UI_V6_FINAL_QA
// ASARVO_RESULTS_UI_V5_9_ADAPTIVE_DECISION
// ASARVO_RESULTS_UI_V5_8_FINAL_POLISH
// ASARVO_RESULTS_UI_V5_7_STATES_FINISH
// ASARVO_RESULTS_UI_V5_6_MARKETPLACE_TRUST
// ASARVO_RESULTS_UI_V5_5_RESPONSIVE_FINISH
// ASARVO_RESULTS_UI_V5_4_ADAPTIVE_TRUST
// ASARVO_RESULTS_UI_V5_3_RELEVANCE_LOCK
// ASARVO_RESULTS_UI_V5_2_TRUST_COMPACT
// COMPACT_SHIELD_V52
// ASARVO_RESULTS_UI_V5_1_RELEVANCE_SHIELD

// ASARVO_RESULTS_UI_V5_SIGNATURE_POLISH — premium visual hierarchy + quieter trust chips + richer cards + motion-safe microinteractions; search engine untouched.

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import AsarvoSearchLoader from "../components/AsarvoSearchLoader";

type OriginalityConfidence =
  | "high"
  | "medium"
  | "low"
  | "unknown";

type RiskLevel = "low" | "medium" | "high";

type PriceAttractiveness =
  | "excellent"
  | "good"
  | "fair"
  | "poor";

type AssessedCondition =
  | "new"
  | "used"
  | "unknown";

type Product = {
  id: number;
  name: string;
  store: string;
  price: number | null;
  rating: number | null;
  condition: "Nowy" | "Używany" | null;
  original: boolean | null;
  delivery: number | null;
  url?: string;
  imageUrl?: string | null;
  description?: string;
  category: string;
  platform: string | null;
  brand: string | null;

  // V23 — dane rankingu z backendu V21.4
  priceVerified?: boolean;
  availability?: "available" | "unknown";
  matchScore?: number | null;
  originalityScore?: number | null;
  originalityConfidence?: OriginalityConfidence;
  riskScore?: number | null;
  riskLevel?: RiskLevel | null;
  assessedCondition?: AssessedCondition;
  conditionConfidence?: number | null;
  priceScore?: number | null;
  priceAttractiveness?: PriceAttractiveness | null;
  sourceConfidence?: number | null;
  sellerConfidence?: number | null;
  totalPrice?: number | null;
  dealScore?: number | null;
  aiReason?: string;
  bestOffer?: boolean;
  cheapestOffer?: boolean;
  safestOffer?: boolean;
};

type ProductGroup = {
  key: string;
  displayName: string;
  representative: Product;
  offers: Product[];
  colors: string[];
  lowestPrice: number | null;
  lowestConfirmedTotal: number | null;
};

type ProductFamilyStoreOffer = {
  key: string;
  store: string;
  representative: Product;
  costRepresentative: Product;
  offers: Product[];
  colors: string[];
  lowestPrice: number | null;
  lowestConfirmedTotal: number | null;
};

type ProductFamily = {
  key: string;
  displayName: string;
  representative: Product;
  offers: Product[];
  storeOffers: ProductFamilyStoreOffer[];
  colors: string[];
  lowestPrice: number | null;
  lowestConfirmedTotal: number | null;
  storeCount: number;
};

type Interpretation = {
  product: string | null;
  category: string | null;
  brand: string | null;
  model: string | null;
  platform: string | null;
  condition: "new" | "used" | null;
  original: boolean | null;
  maxPrice: number | null;
  requirements?: Array<{
    key: string;
    label: string;
    value: string;
    hard: boolean;
  }>;
};

function formatPrice(price: number | null): string {
  if (price === null || !Number.isFinite(price)) {
    return "Cena nieznana";
  }

  return `${price.toFixed(2).replace(".", ",")} zł`;
}

function parseDeliveryCost(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, value);
  }

  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();

  if (
    normalized.includes("darm") ||
    normalized.includes("gratis") ||
    normalized.includes("free")
  ) {
    return 0;
  }

  const match = normalized.match(/(\d{1,5}(?:[.,]\d{1,2})?)/);

  if (!match) {
    return null;
  }

  const parsed = Number(match[1].replace(",", "."));

  return Number.isFinite(parsed) ? parsed : null;
}

function getPurchaseTotal(product: Product): number | null {
  // Całkowity koszt uznajemy za POTWIERDZONY tylko wtedy,
  // gdy znamy również koszt dostawy. Dzięki temu backendowe
  // totalPrice równe samej cenie produktu nie udaje pełnego
  // kosztu zakupu przy nieznanej dostawie.
  if (product.delivery === null) {
    return null;
  }

  if (
    typeof product.totalPrice === "number" &&
    Number.isFinite(product.totalPrice) &&
    product.totalPrice >= 0
  ) {
    return product.totalPrice;
  }

  if (
    product.price !== null &&
    Number.isFinite(product.price) &&
    Number.isFinite(product.delivery)
  ) {
    return product.price + product.delivery;
  }

  return null;
}

function deliveryCostLabel(delivery: number | null): string {
  if (delivery === null) return "Niepotwierdzona";
  if (delivery === 0) return "Darmowa";
  return formatPrice(delivery);
}

function purchaseTotalLabel(product: Product): string {
  const total = getPurchaseTotal(product);

  if (total !== null) {
    return formatPrice(total);
  }

  if (product.price !== null) {
    return `od ${formatPrice(product.price)}`;
  }

  return "Niepotwierdzony";
}

function polishCountWord(
  count: number,
  singular: string,
  few: string,
  many: string
): string {
  const value = Math.abs(Math.trunc(count));
  const mod10 = value % 10;
  const mod100 = value % 100;

  if (value === 1) return singular;
  if (mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)) {
    return few;
  }

  return many;
}

function countLabel(
  count: number,
  singular: string,
  few: string,
  many: string
): string {
  return `${count} ${polishCountWord(count, singular, few, many)}`;
}

function firstNonEmptyString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

function uiProductTitle(value: string): string {
  let normalized = value.replace(/\s+/g, " ").trim();

  normalized = normalized
    .replace(/\s*[|—]\s*(?:nawet|kup|raty|ratach|promocja|bonus|głośniki|sluchawki|słuchawki|sprawdź|sprawdz|oferta).*$/i, "")
    .replace(/\s*-\s*(?:Apple Business Partner|Kup na Raty.*|Raty.*|Nawet.*|Promocja.*|najlepsze\s+ce(?:ny)?[^|—]*|sprawdź.*|sprawdz.*)$/i, "")
    .replace(/\s+Apple Business Partner\b.*$/i, "")
    .replace(/[-–—]\s*najlepsze\s+ce(?:ny)?[^|—]*$/i, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  const firstSegment = normalized.split(/\s+\|\s+|\s+—\s+/)[0]?.trim() || normalized;

  if (firstSegment.length <= 104) return firstSegment;
  return `${firstSegment.slice(0, 101).trimEnd()}…`;
}

function extractCpuUiLabel(value: string): string | null {
  const coreUltra = value.match(
    /\b(?:Intel(?:\s*[™®])?\s+)?Core(?:\s*[™®])?\s+Ultra\s+([579])\s*[- ]?\s*(\d{3,4}[A-Z]{0,3})\b/i
  );
  if (coreUltra) {
    return `Core Ultra ${coreUltra[1]} ${coreUltra[2].toUpperCase()}`;
  }

  const core = value.match(
    /\b(?:Intel(?:\s*[™®])?\s+)?Core(?:\s*[™®])?\s+(i[3579])\s*[- ]?\s*(\d{3,5}[A-Z]{0,3})\b/i
  );
  if (core) {
    return `Core ${core[1].toLowerCase()}-${core[2].toUpperCase()}`;
  }

  const ryzen = value.match(
    /\b(?:AMD(?:\s*[™®])?\s+)?Ryzen(?:\s*[™®])?\s+([3579])\s*[- ]?\s*(\d{3,5}[A-Z]{0,3})\b/i
  );
  if (ryzen) {
    return `Ryzen ${ryzen[1]} ${ryzen[2].toUpperCase()}`;
  }

  return null;
}

function extractGpuUiLabel(value: string): string | null {
  const geforce = value.match(
    /\b(RTX|GTX)\s*[- ]?\s*(\d{4})(?:\s*(Ti|SUPER))?\b/i
  );
  if (geforce) {
    const suffix = geforce[3] ? ` ${geforce[3].toUpperCase() === "TI" ? "Ti" : "SUPER"}` : "";
    return `${geforce[1].toUpperCase()} ${geforce[2]}${suffix}`;
  }

  const radeon = value.match(/\bRX\s*[- ]?\s*(\d{4}[A-Z]{0,3})\b/i);
  if (radeon) {
    return `RX ${radeon[1].toUpperCase()}`;
  }

  return null;
}

function extractLaptopModelBase(raw: string, normalized: string): string {
  const hpVictus = raw.match(/\bHP\s+VICTUS\s+(\d{2})\b/i);
  if (hpVictus) return `HP VICTUS ${hpVictus[1]}`;

  const hpOmen = raw.match(/\bHP\s+OMEN\s+(\d{2})\b/i);
  if (hpOmen) return `HP OMEN ${hpOmen[1]}`;

  const omenByHp = raw.match(/\bOMEN\s+BY\s+HP\s+(\d{2})\b/i);
  if (omenByHp) return `HP OMEN ${omenByHp[1]}`;

  const lenovoLoq = raw.match(/\bLENOVO\s+LOQ\s+(\d{2})/i);
  if (lenovoLoq) return `Lenovo LOQ ${lenovoLoq[1]}`;

  const lenovoLegion = raw.match(/\bLENOVO\s+LEGION\s+([3579])(?:\s+(\d{2}))?/i);
  if (lenovoLegion) {
    return `Lenovo Legion ${lenovoLegion[1]}${lenovoLegion[2] ? ` ${lenovoLegion[2]}` : ""}`;
  }

  const lenovoY = raw.match(/\bLENOVO\s+(Y\d{3})\b/i);
  if (lenovoY) {
    return `Lenovo Legion ${lenovoY[1].toUpperCase()}`;
  }

  const asusTuf = raw.match(/\bASUS\s+TUF\s+GAMING\s+([AF]\d{2})\b/i);
  if (asusTuf) return `ASUS TUF Gaming ${asusTuf[1].toUpperCase()}`;

  if (/\bASUS\s+TUF(?:\s+GAMING)?\b/i.test(raw)) {
    return "ASUS TUF Gaming";
  }

  const asusRog = raw.match(/\bASUS\s+ROG\s+(STRIX|ZEPHYRUS)\s+([A-Z]\d{2})\b/i);
  if (asusRog) {
    const line = asusRog[1].toLowerCase() === "strix" ? "Strix" : "Zephyrus";
    return `ASUS ROG ${line} ${asusRog[2].toUpperCase()}`;
  }

  const acerNitro = raw.match(/\bACER\s+NITRO(?:\s+V)?\s+(\d{2})\b/i);
  if (acerNitro) {
    const hasV = /\bACER\s+NITRO\s+V\b/i.test(raw);
    return `Acer Nitro${hasV ? " V" : ""} ${acerNitro[1]}`;
  }

  const gigabyteGaming = raw.match(/\bGIGABYTE\s+GAMING\s+([A-Z]\d{2})\b/i);
  if (gigabyteGaming) return `Gigabyte Gaming ${gigabyteGaming[1].toUpperCase()}`;

  const msiLine = raw.match(/\bMSI\s+(KATANA|CYBORG|THIN|PULSE|VECTOR|RAIDER)\s+(\d{2})\b/i);
  if (msiLine) {
    const line = msiLine[1].charAt(0).toUpperCase() + msiLine[1].slice(1).toLowerCase();
    return `MSI ${line} ${msiLine[2]}`;
  }

  const dellG = raw.match(/\bDELL\s+(G\d{2})\b/i);
  if (dellG) return `Dell ${dellG[1].toUpperCase()}`;

  let base = normalized
    .replace(/^Laptop\s+/i, "")
    .replace(/^Notebook\s+/i, "")
    .replace(/^gamingowy\s+/i, "")
    .replace(/^gamingowa\s+/i, "")
    .replace(/^gamingowe\s+/i, "")
    .replace(/\s+do\s+gier\b.*$/i, "")
    .trim();

  const specStart = base.search(
    /\b(?:(?:Intel\s+)?Core(?:\s*[™®])?\s+(?:Ultra\s+)?[i3579]|(?:AMD\s+)?Ryzen(?:\s*[™®])?\s+[3579]|RTX\s*\d{4}|GTX\s*\d{4}|RX\s*\d{4}|\d{2,4}\s*(?:GB|TB)|Windows\s*1[01]|Win\s*1[01])\b/i
  );

  if (specStart > 3) {
    base = base.slice(0, specStart).trim();
  }

  base = base
    .split(/\s+\|\s+|\s+—\s+|\s*\/\s*/)[0]
    ?.replace(/[-–—,:]+\s*$/, "")
    .replace(/\s{2,}/g, " ")
    .trim() || normalized;

  if (base.length <= 54) return base;
  return `${base.slice(0, 51).trimEnd()}…`;
}

function productUiIdentity(product: Product, fallback?: string | null): string {
  const raw = `${fallback ?? ""} ${product.name}`.replace(/\s+/g, " ").trim();
  const normalized = uiProductTitle(fallback || product.name);

  const iphone = raw.match(/(?:Apple\s+)?iPhone\s+\d{1,2}[A-Za-z]*(?:\s+(?:Pro|Max|Plus|Mini|Air|SE))?(?:\s+\d{2,4}\s*(?:GB|TB))?/i);
  if (iphone) {
    const title = iphone[0].replace(/\s+/g, " ").trim();
    return /^Apple\b/i.test(title) ? title : `Apple ${title}`;
  }

  const cpu = extractCpuUiLabel(raw);
  const gpu = extractGpuUiLabel(raw);
  const laptopSignal = /\b(?:laptop|notebook|victus|omen|legion|loq|tuf|nitro|rog|ideapad|vivobook|zenbook|katana|predator|gigabyte\s+gaming|cyborg|pulse|vector|raider|dell\s+g\d{2})\b/i.test(raw) ||
    Boolean(cpu || gpu);

  if (laptopSignal) {
    const base = extractLaptopModelBase(raw, normalized);

    const parts = [base, cpu, gpu]
      .filter((part): part is string => Boolean(part && part.trim()))
      .map((part) => part.replace(/\s+/g, " ").trim());

    const seen = new Set<string>();
    const unique = parts.filter((part) => {
      const key = normalizeGroupingText(part);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const title = unique.join(" · ");
    return title.length <= 96 ? title : `${title.slice(0, 93).trimEnd()}…`;
  }

  return normalized;
}

function productUiSpecs(product: Product): string[] {
  const raw = `${product.name} ${product.description ?? ""}`.replace(/\s+/g, " ");
  const specs: string[] = [];

  const push = (value: string | null | undefined) => {
    if (!value) return;
    const clean = value.replace(/\s+/g, " ").trim();
    if (clean && !specs.some((item) => item.toLowerCase() === clean.toLowerCase())) {
      specs.push(clean);
    }
  };

  push(extractCpuUiLabel(raw));
  push(extractGpuUiLabel(raw));

  const memoryValues = Array.from(raw.matchAll(/\b(\d{2,4})\s*(GB|TB)\b/gi))
    .map((match) => `${match[1]} ${match[2].toUpperCase()}`);
  for (const memory of memoryValues.slice(0, 2)) push(memory);

  push(raw.match(/\b\d{2,3}\s*Hz\b/i)?.[0]?.replace(/\s+/g, " ").trim());

  const windows = raw.match(
    /\b(?:Windows\s*11|Win\s*11|Windows\s*10|Win\s*10)\b/i
  )?.[0];
  if (windows) {
    push(
      /^Win\s*11$/i.test(windows)
        ? "Windows 11"
        : /^Win\s*10$/i.test(windows)
          ? "Windows 10"
          : windows.replace(/\s+/g, " ").trim()
    );
  }

  push(raw.match(/\b5G\b/i)?.[0]);

  return specs.slice(0, 6);
}

function productFamilyUiIdentity(family: ProductFamily): string {
  const candidates = [
    productUiIdentity(family.representative, family.displayName),
    ...family.offers.map((offer) =>
      productUiIdentity(offer, family.displayName)
    ),
  ].filter(Boolean);

  const score = (value: string): number => {
    let result = 0;
    if (extractCpuUiLabel(value)) result += 4;
    if (extractGpuUiLabel(value)) result += 4;
    result += Math.min(3, (value.match(/ · /g) ?? []).length);
    return result;
  };

  return [...candidates].sort((a, b) => {
    const diff = score(b) - score(a);
    if (diff !== 0) return diff;
    return a.length - b.length;
  })[0] ?? family.displayName;
}

function productFamilyUiSpecs(family: ProductFamily): string[] {
  const all = family.offers.flatMap((offer) => productUiSpecs(offer));
  const unique = all.filter(
    (spec, index) =>
      all.findIndex((candidate) => candidate.toLowerCase() === spec.toLowerCase()) === index
  );

  const cpu = unique.find((spec) => /^(?:Core|Ryzen)\b/i.test(spec));
  const gpu = unique.find((spec) => /^(?:RTX|GTX|RX)\b/i.test(spec));
  const memory = unique.filter((spec) => /^\d{1,4}\s+(?:GB|TB)$/i.test(spec));
  const ram = memory.find((spec) => {
    const match = spec.match(/^(\d+)\s+GB$/i);
    return Boolean(match && Number(match[1]) <= 128);
  });
  const storage = memory.find((spec) => {
    if (ram && spec.toLowerCase() === ram.toLowerCase()) return false;
    const gb = spec.match(/^(\d+)\s+GB$/i);
    return /TB$/i.test(spec) || Boolean(gb && Number(gb[1]) >= 128);
  });
  const refresh = unique.find((spec) => /Hz$/i.test(spec));
  const system = unique.find((spec) => /^Windows\b/i.test(spec));
  const connectivity = unique.find((spec) => /^5G$/i.test(spec));

  return [cpu, gpu, ram, storage, refresh, system, connectivity]
    .filter((spec): spec is string => Boolean(spec))
    .slice(0, 6);
}

function originalityChipTone(
  confidence: OriginalityConfidence | undefined
): string {
  if (confidence === "high") {
    return "border-emerald-500/20 bg-emerald-500/[0.07] text-emerald-300";
  }

  if (confidence === "medium") {
    return "border-amber-500/20 bg-amber-500/[0.07] text-amber-200";
  }

  if (confidence === "low") {
    return "border-orange-500/25 bg-orange-500/[0.08] text-orange-200";
  }

  return "border-white/[0.08] bg-white/[0.03] text-gray-400";
}

function originalityChipIcon(
  confidence: OriginalityConfidence | undefined
): string {
  if (confidence === "high") return "✓";
  if (confidence === "medium" || confidence === "low") return "⚠";
  return "•";
}

function originalityUiLabel(
  confidence: OriginalityConfidence | undefined
): string {
  if (confidence === "high") return "Oryginalność: mocne sygnały";
  if (confidence === "medium") return "Oryginalność: częściowo potwierdzona";
  if (confidence === "low") return "Oryginalność: wymaga weryfikacji";
  return "Oryginalność: brak danych";
}

function productNeedsCaution(product: Product | null | undefined): boolean {
  if (!product) return false;

  return (
    product.riskLevel === "high" ||
    product.riskLevel === "medium" ||
    product.originalityConfidence === "low" ||
    (typeof product.sourceConfidence === "number" && product.sourceConfidence < 55)
  );
}

const productImageResolverCache = new Map<string, Promise<string | null>>();

function resolveProductImageFromSource(offerUrl: string): Promise<string | null> {
  const cached = productImageResolverCache.get(offerUrl);
  if (cached) return cached;

  const request = fetch(`/api/product-image?url=${encodeURIComponent(offerUrl)}`)
    .then(async (response) => {
      if (!response.ok) return null;
      const payload = (await response.json()) as { imageUrl?: unknown };
      return typeof payload.imageUrl === "string" && payload.imageUrl.trim()
        ? payload.imageUrl.trim()
        : null;
    })
    .catch(() => null);

  productImageResolverCache.set(offerUrl, request);
  return request;
}

function ProductVisual({
  product,
  label,
  compact = false,
}: {
  product: Product;
  label: string;
  compact?: boolean;
}) {
  const directImageUrl = product.imageUrl?.trim() || null;
  const [resolvedImageUrl, setResolvedImageUrl] = useState<string | null>(directImageUrl);
  const [imageFailed, setImageFailed] = useState(false);
  const [imageReady, setImageReady] = useState(false);

  useEffect(() => {
    let active = true;
    setImageFailed(false);
    setImageReady(false);

    if (directImageUrl) {
      setResolvedImageUrl(directImageUrl);
      return () => {
        active = false;
      };
    }

    if (!product.url) {
      setResolvedImageUrl(null);
      return () => {
        active = false;
      };
    }

    setResolvedImageUrl(null);

    void resolveProductImageFromSource(product.url).then((imageUrl) => {
      if (!active) return;
      setResolvedImageUrl(imageUrl);
    });

    return () => {
      active = false;
    };
  }, [directImageUrl, product.url]);

  const imageUrl = resolvedImageUrl;

  if (!imageUrl || imageFailed) {
    return null;
  }

  return (
    <div
      data-product-image={imageReady ? "ready" : "loading"}
      className={`${
        imageReady
          ? `relative overflow-hidden rounded-[22px] border border-blue-300/[0.10] bg-[radial-gradient(circle_at_38%_18%,rgba(59,130,246,0.26),transparent_40%),linear-gradient(145deg,#0b1628,#060a11_62%,#030507)] ring-1 ring-inset ring-white/[0.025] shadow-[0_18px_60px_rgba(0,0,0,0.24)] ${
              compact
                ? "h-[96px] min-h-[96px] w-[84px] shrink-0 sm:h-[112px] sm:min-h-[112px] sm:w-[96px]"
                : "h-[220px] w-full shrink-0 self-start sm:h-[265px] md:w-[235px] lg:h-[285px] xl:w-[270px]"
            }`
          : "pointer-events-none absolute h-px w-px overflow-hidden opacity-0"
      }`}
    >
      {imageReady && (
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,transparent_20%,rgba(255,255,255,0.035)_48%,transparent_70%)]" />
      )}

      <div
        className={`absolute overflow-hidden bg-[linear-gradient(145deg,#ffffff,#f4f7fb)] shadow-[0_20px_55px_rgba(0,0,0,0.30)] ring-1 ring-black/[0.04] ${
          compact
            ? "inset-2 rounded-xl"
            : "inset-3 rounded-[20px] sm:inset-4"
        }`}
      >
        <img
          src={imageUrl}
          alt={label}
          loading="lazy"
          referrerPolicy="no-referrer"
          onLoad={() => setImageReady(true)}
          onError={() => {
            setImageReady(false);
            setImageFailed(true);
          }}
          className={`h-full w-full object-contain transition-transform duration-500 ease-out group-hover:scale-[1.025] motion-reduce:transform-none motion-reduce:transition-none ${
            compact ? "p-2" : "p-3"
          }`}
        />
      </div>

      {imageReady && !compact && (
        <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between gap-2">
          <span className="max-w-[70%] truncate rounded-full border border-white/[0.08] bg-black/45 px-2.5 py-1 text-[9px] font-medium text-gray-300 backdrop-blur">
            {product.store}
          </span>
          {product.priceVerified && (
            <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-2.5 py-1 text-[9px] font-semibold text-emerald-300 backdrop-blur">
              ✓ cena
            </span>
          )}
        </div>
      )}
    </div>
  );
}


function MetricGauge({
  label,
  value,
  inverse = false,
}: {
  label: string;
  value: number | null | undefined;
  inverse?: boolean;
}) {
  const raw =
    typeof value === "number" && Number.isFinite(value)
      ? Math.max(0, Math.min(100, value))
      : null;
  const display = raw === null ? null : inverse ? 100 - raw : raw;
  const quality = display ?? 0;

  const barTone =
    quality >= 82
      ? "bg-emerald-400"
      : quality >= 68
        ? "bg-blue-400"
        : quality >= 50
          ? "bg-amber-400"
          : "bg-rose-400";

  return (
    <div className="rounded-xl border border-white/[0.07] bg-[linear-gradient(145deg,rgba(255,255,255,0.028),rgba(255,255,255,0.012))] px-3 py-3 transition duration-300 hover:border-blue-300/[0.14] hover:bg-white/[0.026]">
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-1.5 text-[10px] font-medium text-gray-500">
          <span className={`h-1.5 w-1.5 rounded-full ${barTone} shadow-[0_0_10px_currentColor]`} />
          {label}
        </span>
        <span className="text-sm font-bold text-white">
          {display === null ? "—" : `${Math.round(display)}/100`}
        </span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
        <div
          className={`h-full rounded-full shadow-[0_0_12px_currentColor] transition-all duration-700 ease-out ${barTone}`}
          style={{ width: `${display ?? 0}%` }}
        />
      </div>
    </div>
  );
}


function scoreChipTone(score: number | null | undefined): string {
  if (typeof score !== "number" || !Number.isFinite(score)) {
    return "border-white/[0.10] bg-white/[0.04] text-gray-300";
  }
  if (score >= 82) return "border-emerald-400/20 bg-emerald-500/[0.08] text-emerald-300";
  if (score >= 68) return "border-blue-400/20 bg-blue-500/[0.08] text-blue-300";
  if (score >= 52) return "border-amber-400/20 bg-amber-500/[0.08] text-amber-300";
  return "border-rose-400/20 bg-rose-500/[0.08] text-rose-300";
}

type ShortlistRole = "best" | "cheapest" | "safest";

type ShortlistEntry = {
  key: string;
  product: Product;
  family: ProductFamily | null;
  roles: ShortlistRole[];
};

function shortlistRoleLabel(role: ShortlistRole): string {
  if (role === "best") return "Najlepsze dopasowanie";
  if (role === "cheapest") return "Najtańszy z wyników";
  return "Najbezpieczniejsza";
}

function shortlistRoleIcon(role: ShortlistRole): string {
  if (role === "best") return "🏆";
  if (role === "cheapest") return "💸";
  return "🛡";
}

function shortlistMergedRoleLabel(role: ShortlistRole): string {
  if (role === "best") return "Najlepsze dopasowanie";
  if (role === "cheapest") return "Najtańszy model z wyników";
  return "Najbezpieczniejsza oferta modelu";
}

function shortlistSameProductModel(
  aProduct: Product,
  aFamily: ProductFamily | null,
  bProduct: Product,
  bFamily: ProductFamily | null
): boolean {
  if (aFamily?.key && bFamily?.key && aFamily.key === bFamily.key) {
    return true;
  }

  if (sameProductIdentity(aProduct, bProduct)) {
    return true;
  }

  const aUi = normalizeGroupingText(
    productUiIdentity(aProduct, aFamily?.displayName)
  );
  const bUi = normalizeGroupingText(
    productUiIdentity(bProduct, bFamily?.displayName)
  );

  return Boolean(aUi && bUi && aUi === bUi);
}

function ShortlistCard({ entry }: { entry: ShortlistEntry }) {
  const { product, family, roles } = entry;
  const merged = roles.length > 1;
  const primary = roles[0] ?? "best";
  const shortlistSpecs = (
    family ? productFamilyUiSpecs(family) : productUiSpecs(product)
  ).slice(0, 3);

  const shellClass = merged
    ? "border-blue-400/30 bg-[linear-gradient(145deg,rgba(37,99,235,0.14),rgba(7,13,24,0.97)_48%,rgba(3,6,10,0.99))] shadow-[0_18px_80px_rgba(37,99,235,0.10)] hover:border-blue-300/45"
    : primary === "best"
      ? "border-amber-400/30 bg-[linear-gradient(145deg,rgba(245,158,11,0.12),rgba(8,11,17,0.95)_46%,rgba(3,6,10,0.98))] shadow-[0_18px_70px_rgba(245,158,11,0.07)] hover:border-amber-300/45"
      : primary === "cheapest"
        ? "border-emerald-400/25 bg-[linear-gradient(145deg,rgba(16,185,129,0.10),rgba(7,15,16,0.96)_48%,rgba(3,6,10,0.98))] shadow-[0_18px_70px_rgba(16,185,129,0.06)] hover:border-emerald-300/40"
        : "border-cyan-400/25 bg-[linear-gradient(145deg,rgba(14,165,233,0.11),rgba(6,13,22,0.97)_48%,rgba(3,6,10,0.98))] shadow-[0_18px_70px_rgba(14,165,233,0.06)] hover:border-cyan-300/40";

  const ctaClass = merged
    ? "bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-[0_8px_24px_rgba(37,99,235,0.20)] hover:from-blue-500 hover:to-cyan-500"
    : primary === "best"
      ? "bg-gradient-to-r from-amber-300 to-yellow-300 text-black shadow-[0_8px_24px_rgba(245,158,11,0.16)] hover:from-amber-200 hover:to-yellow-200"
      : primary === "cheapest"
        ? "bg-gradient-to-r from-emerald-400 to-teal-400 text-[#03110c] shadow-[0_8px_24px_rgba(16,185,129,0.16)] hover:from-emerald-300 hover:to-teal-300"
        : "bg-gradient-to-r from-blue-500 to-cyan-500 text-white shadow-[0_8px_24px_rgba(14,165,233,0.16)] hover:from-blue-400 hover:to-cyan-400";

  const accentClass = merged
    ? "text-blue-300"
    : primary === "best"
      ? "text-amber-300"
      : primary === "cheapest"
        ? "text-emerald-300"
        : "text-cyan-300";

  return (
    <article
      className={`group relative overflow-hidden rounded-[26px] border p-4 sm:p-5 ring-1 ring-inset ring-white/[0.018] transition duration-300 hover:-translate-y-1 hover:shadow-[0_26px_90px_rgba(37,99,235,0.12)] motion-reduce:transform-none motion-reduce:transition-none ${shellClass}`}
    >
      <div className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full bg-blue-400/[0.08] blur-3xl" />

      <div className="relative flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className={`text-[10px] font-bold uppercase tracking-[0.18em] ${accentClass}`}>
            {merged ? "✦ Lider w kilku kategoriach" : `${shortlistRoleIcon(primary)} ${shortlistRoleLabel(primary)}`}
          </div>

          <div className="mt-2 flex flex-wrap gap-1.5">
            {roles.map((role) => (
              <span
                key={role}
                className="rounded-full border border-white/[0.08] bg-black/20 px-2 py-1 text-[9px] font-semibold text-gray-300"
              >
                {shortlistRoleIcon(role)} {merged ? shortlistMergedRoleLabel(role) : shortlistRoleLabel(role)}
              </span>
            ))}
          </div>

          <h3 className="mt-3 line-clamp-2 min-h-[44px] text-base font-bold leading-snug text-white">
            {family ? productFamilyUiIdentity(family) : productUiIdentity(product)}
          </h3>

          {shortlistSpecs.length > 0 && (
            <div className="mt-2 flex max-h-[24px] flex-wrap gap-1 overflow-hidden">
              {shortlistSpecs.map((spec) => (
                <span
                  key={spec}
                  className="rounded-md border border-blue-400/12 bg-blue-500/[0.045] px-2 py-1 text-[9px] font-semibold leading-none text-blue-100/75"
                >
                  {spec}
                </span>
              ))}
            </div>
          )}
        </div>

        {typeof product.dealScore === "number" && (
          <span
            className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-semibold ${scoreChipTone(
              product.dealScore
            )}`}
          >
            {product.dealScore}/100
          </span>
        )}
      </div>

      <div className="relative mt-4 flex items-stretch gap-3 sm:gap-4">
        <ProductVisual
          product={product}
          label={family ? productFamilyUiIdentity(family) : productUiIdentity(product)}
          compact
        />

        <div className="flex min-w-0 flex-1 flex-col justify-between py-1">
          <div>
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <span className="truncate text-xs text-gray-500">{product.store}</span>
              <span
                className={`rounded-full border px-2 py-0.5 text-[8px] font-semibold uppercase tracking-[0.08em] ${sourceKindChipTone(
                  product.store
                )}`}
              >
                {sourceKindLabel(product.store)}
              </span>
            </div>
            <div className="mt-2 text-xl font-bold tracking-tight text-white sm:text-2xl">
              {purchaseTotalLabel(product)}
            </div>
            <div
              className={`mt-2 text-xs ${
                product.delivery === 0 ? "text-emerald-300" : "text-gray-400"
              }`}
            >
              {deliveryCostLabel(product.delivery)} dostawa
            </div>

            {marketplaceTrustNote(product.store) ? (
              <div className="mt-2 rounded-lg border border-amber-400/15 bg-amber-400/[0.06] px-2.5 py-1.5 text-[10px] leading-4 text-amber-200">
                ⚠ {marketplaceTrustNote(product.store)}
              </div>
            ) : productNeedsCaution(product) ? (
              <div className="mt-2 rounded-lg border border-amber-400/15 bg-amber-400/[0.06] px-2.5 py-1.5 text-[10px] leading-4 text-amber-200">
                ⚠ Warto sprawdzić sygnały wiarygodności
              </div>
            ) : null}
          </div>

          {product.url && (
            <a
              href={product.url}
              target="_blank"
              rel="noreferrer"
              className={`mt-4 inline-flex items-center justify-center rounded-xl px-3 py-2.5 text-xs font-bold transition duration-300 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300/40 motion-reduce:transform-none ${ctaClass}`}
            >
              Zobacz ofertę →
            </a>
          )}
        </div>
      </div>
    </article>
  );
}

function MergedLeaderStrip({ entry }: { entry: ShortlistEntry }) {
  const { product, family, roles } = entry;
  const title = family ? productFamilyUiIdentity(family) : productUiIdentity(product);

  return (
    <article className="relative overflow-hidden rounded-[20px] border border-blue-400/25 bg-[linear-gradient(125deg,rgba(37,99,235,0.15),rgba(5,10,18,0.985)_46%,rgba(2,5,9,0.995))] px-4 py-4 sm:rounded-[24px] sm:px-6 shadow-[0_22px_90px_rgba(37,99,235,0.11)] ring-1 ring-inset ring-white/[0.018] backdrop-blur-xl sm:px-6">
      <div className="pointer-events-none absolute -left-20 top-1/2 h-44 w-44 -translate-y-1/2 rounded-full bg-blue-500/[0.10] blur-[70px]" />

      <div className="relative flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-blue-300/20 bg-blue-500/[0.09] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-blue-200">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-300 shadow-[0_0_14px_rgba(96,165,250,0.9)]" />
              ASARVO DECISION
            </span>
            <span className="text-xs text-gray-500">
              ten model obejmuje liderów w {roles.length} kryteriach
            </span>
          </div>

          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between xl:justify-start xl:gap-8">
            <div className="min-w-0">
              <h2 className="line-clamp-2 text-lg font-bold tracking-tight text-white sm:text-2xl">
                {title}
              </h2>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
                <span>{product.store}</span>
                <span className="font-semibold text-white">{purchaseTotalLabel(product)}</span>
                {typeof product.dealScore === "number" && (
                  <span className="text-blue-300">ASARVO {product.dealScore}/100</span>
                )}
              </div>
            </div>

            <div className="shrink-0 text-xs text-gray-500">
              pełna analiza poniżej ↓
            </div>
          </div>
        </div>

        <div className="flex min-w-0 flex-wrap gap-2 xl:max-w-[520px] xl:justify-end">
          {roles.map((role) => {
            const tone =
              role === "best"
                ? "border-amber-400/20 bg-amber-400/[0.06] text-amber-200"
                : role === "cheapest"
                  ? "border-emerald-400/20 bg-emerald-400/[0.06] text-emerald-200"
                  : "border-cyan-400/20 bg-cyan-400/[0.06] text-cyan-200";

            return (
              <div
                key={role}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 sm:gap-2 sm:px-3 sm:py-2 ${tone}`}
              >
                <span className="text-xs">{shortlistRoleIcon(role)}</span>
                <span className="text-[9px] font-bold uppercase tracking-[0.08em] sm:text-[10px] sm:tracking-[0.10em]">
                  {shortlistMergedRoleLabel(role)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </article>
  );
}



const COLOR_VARIANTS = [
  { label: "Czarny", aliases: ["czarny", "czarna", "czarne", "black", "onyx"] },
  { label: "Biały", aliases: ["biały", "bialy", "biała", "biala", "białe", "biale", "white"] },
  { label: "Niebieski", aliases: ["niebieski", "niebieska", "niebieskie", "blue"] },
  { label: "Granatowy", aliases: ["granatowy", "granatowa", "granatowe", "navy"] },
  { label: "Srebrny", aliases: ["srebrny", "srebrna", "srebrne", "silver"] },
  { label: "Szary", aliases: ["szary", "szara", "szare", "gray", "grey"] },
  { label: "Grafitowy", aliases: ["grafitowy", "grafitowa", "grafitowe", "graphite"] },
  { label: "Różowy", aliases: ["różowy", "rozowy", "różowa", "rozowa", "różowe", "rozowe", "pink"] },
  { label: "Zielony", aliases: ["zielony", "zielona", "zielone", "green"] },
  { label: "Czerwony", aliases: ["czerwony", "czerwona", "czerwone", "red"] },
  { label: "Fioletowy", aliases: ["fioletowy", "fioletowa", "fioletowe", "purple", "violet"] },
  { label: "Złoty", aliases: ["złoty", "zloty", "złota", "zlota", "złote", "zlote", "gold"] },
  { label: "Beżowy", aliases: ["beżowy", "bezowy", "beżowa", "bezowa", "beżowe", "bezowe", "beige"] },
  { label: "Brązowy", aliases: ["brązowy", "brazowy", "brązowa", "brazowa", "brązowe", "brazowe", "brown"] },
  { label: "Pomarańczowy", aliases: ["pomarańczowy", "pomaranczowy", "pomarańczowa", "pomaranczowa", "orange"] },
  { label: "Żółty", aliases: ["żółty", "zolty", "żółta", "zolta", "żółte", "zolte", "yellow"] },
] as const;

function normalizeGroupingText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function extractColorVariant(name: string): string | null {
  const normalized = ` ${normalizeGroupingText(name)} `;

  for (const color of COLOR_VARIANTS) {
    for (const alias of color.aliases) {
      const normalizedAlias = normalizeGroupingText(alias);
      if (normalized.includes(` ${normalizedAlias} `)) {
        return color.label;
      }
    }
  }

  return null;
}

function removeKnownColorForGrouping(name: string): string {
  const tokens = normalizeGroupingText(name).split(" ").filter(Boolean);
  const aliases = new Set(
    COLOR_VARIANTS.flatMap((color) =>
      color.aliases.map((alias) => normalizeGroupingText(alias))
    )
  );

  return tokens.filter((token) => !aliases.has(token)).join(" ");
}

function removeColorFromDisplayName(name: string): string {
  for (const color of COLOR_VARIANTS) {
    for (const alias of color.aliases) {
      const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const pattern = new RegExp(`(^|[\\s,(/-])${escaped}(?=$|[\\s,)/-])`, "i");

      if (pattern.test(name)) {
        const cleaned = name
          .replace(pattern, "$1")
          .replace(/\s{2,}/g, " ")
          .replace(/\s+([,)/-])/g, "$1")
          .replace(/([(/-])\s+/g, "$1")
          .replace(/[-,/]\s*$/, "")
          .trim();

        return cleaned || name;
      }
    }
  }

  return name;
}

function getProductGroupKey(product: Product): string {
  const color = extractColorVariant(product.name);
  const normalizedName = color
    ? removeKnownColorForGrouping(product.name)
    : normalizeGroupingText(product.name);

  return [
    normalizeGroupingText(product.store),
    normalizeGroupingText(product.brand ?? ""),
    normalizeGroupingText(product.category),
    normalizeGroupingText(product.platform ?? ""),
    normalizeGroupingText(product.condition ?? ""),
    normalizedName,
  ].join("::");
}

function selectGroupRepresentative(offers: Product[]): Product {
  return [...offers].sort((a, b) => {
    if (a.bestOffer !== b.bestOffer) return a.bestOffer ? -1 : 1;

    const dealA = a.dealScore ?? -1;
    const dealB = b.dealScore ?? -1;
    if (dealB !== dealA) return dealB - dealA;

    const totalA = getPurchaseTotal(a);
    const totalB = getPurchaseTotal(b);

    if (totalA !== null || totalB !== null) {
      if (totalA === null) return 1;
      if (totalB === null) return -1;
      if (totalA !== totalB) return totalA - totalB;
    }

    return (a.price ?? Infinity) - (b.price ?? Infinity);
  })[0];
}

function buildProductGroups(products: Product[]): ProductGroup[] {
  const groups = new Map<string, Product[]>();
  const keyOrder: string[] = [];

  for (const product of products) {
    const key = getProductGroupKey(product);

    if (!groups.has(key)) {
      groups.set(key, []);
      keyOrder.push(key);
    }

    groups.get(key)!.push(product);
  }

  return keyOrder.map((key) => {
    const offers = groups.get(key) ?? [];
    const representative = selectGroupRepresentative(offers);
    const colors = Array.from(
      new Set(
        offers
          .map((offer) => extractColorVariant(offer.name))
          .filter((color): color is string => Boolean(color))
      )
    );

    const prices = offers
      .map((offer) => offer.price)
      .filter((price): price is number => price !== null && Number.isFinite(price));

    const totals = offers
      .map((offer) => getPurchaseTotal(offer))
      .filter((total): total is number => total !== null && Number.isFinite(total));

    return {
      key,
      displayName:
        colors.length > 1
          ? removeColorFromDisplayName(representative.name)
          : representative.name,
      representative,
      offers,
      colors,
      lowestPrice: prices.length > 0 ? Math.min(...prices) : null,
      lowestConfirmedTotal: totals.length > 0 ? Math.min(...totals) : null,
    };
  });
}



const PRODUCT_IDENTITY_NOISE = new Set([
  "smartfon",
  "telefon",
  "phone",
  "laptop",
  "notebook",
  "monitor",
  "telewizor",
  "tv",
  "sluchawki",
  "headphones",
  "kontroler",
  "controller",
  "pad",
  "konsola",
  "console",
  "nowy",
  "nowa",
  "nowe",
  "uzywany",
  "uzywana",
  "uzywane",
  "fabrycznie",
  "zaplombowany",
  "zaplombowana",
  "zaplombowane",
  "sealed",
  "oryginalny",
  "oryginalna",
  "oryginalne",
  "bez",
  "rat",
  "ratalny",
  "ratalna",
  "ratalne",
  "wersja",
  "version",
  "model",
  "produkt",
  "oferta",
  "szt",
  "sztuka",
  "polska",
  "dystrybucja",
  "eu",
  "europejska",
  "europejski",
]);

const PRODUCT_IDENTITY_MODIFIERS = new Set([
  "pro",
  "max",
  "plus",
  "ultra",
  "mini",
  "slim",
  "lite",
  "air",
  "se",
  "fe",
  "fold",
  "flip",
  "edge",
]);

function normalizedIdentityText(product: Product): string {
  let value = removeKnownColorForGrouping(product.name);

  value = normalizeGroupingText(value)
    .replace(/\b(\d{1,4})\s+(gb|tb)\b/g, "$1$2")
    .replace(/\s+/g, " ")
    .trim();

  return value;
}

function productIdentityTokens(product: Product): string[] {
  const brandTokens = new Set(
    normalizeGroupingText(product.brand ?? "")
      .split(" ")
      .filter(Boolean)
  );

  const platformTokens = new Set(
    normalizeGroupingText(product.platform ?? "")
      .split(" ")
      .filter(Boolean)
  );

  return Array.from(
    new Set(
      normalizedIdentityText(product)
        .split(" ")
        .filter(Boolean)
        .filter((token) => token.length > 1 || /^\d+$/.test(token))
        .filter((token) => !PRODUCT_IDENTITY_NOISE.has(token))
        .filter((token) => !brandTokens.has(token))
        .filter((token) => !platformTokens.has(token))
    )
  );
}

function storageSignature(product: Product): string[] {
  const matches = normalizedIdentityText(product).matchAll(
    /\b(\d{1,4})(gb|tb)\b/g
  );

  return Array.from(
    new Set(
      Array.from(matches, (match) => `${match[1]}${match[2]}`)
    )
  ).sort();
}

function modifierSignature(product: Product): string[] {
  return productIdentityTokens(product)
    .filter((token) => PRODUCT_IDENTITY_MODIFIERS.has(token))
    .sort();
}

function significantNumberSignature(product: Product): number[] {
  const storages = new Set(
    storageSignature(product).map((value) =>
      Number(value.replace(/[^\d]/g, ""))
    )
  );

  return Array.from(
    new Set(
      productIdentityTokens(product)
        .filter((token) => /^\d+$/.test(token))
        .map(Number)
        .filter((value) => Number.isFinite(value))
        .filter((value) => !storages.has(value))
        // Małe liczby często oznaczają RAM/liczbę sztuk.
        // Platformę (np. PS4/PS5) porównujemy osobno.
        .filter((value) => value >= 10)
    )
  ).sort((a, b) => a - b);
}

function mixedModelTokenSignature(product: Product): string[] {
  return productIdentityTokens(product)
    .filter((token) => /[a-z]/.test(token) && /\d/.test(token))
    .filter((token) => !/^\d+(gb|tb)$/.test(token))
    .filter((token) => token.length >= 3)
    .sort();
}

function arraysEqual<T>(a: T[], b: T[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function setOverlapRatio(a: string[], b: string[]): number {
  const setA = new Set(a);
  const setB = new Set(b);
  const union = new Set([...setA, ...setB]);

  if (union.size === 0) return 0;

  let intersection = 0;

  for (const token of setA) {
    if (setB.has(token)) intersection += 1;
  }

  return intersection / union.size;
}

function sameProductIdentity(a: Product, b: Product): boolean {
  const brandA = normalizeGroupingText(a.brand ?? "");
  const brandB = normalizeGroupingText(b.brand ?? "");

  if (brandA && brandB && brandA !== brandB) {
    return false;
  }

  if (
    normalizeGroupingText(a.category) !== normalizeGroupingText(b.category)
  ) {
    return false;
  }

  const platformA = normalizeGroupingText(a.platform ?? "");
  const platformB = normalizeGroupingText(b.platform ?? "");

  if (platformA && platformB && platformA !== platformB) {
    return false;
  }

  const storageA = storageSignature(a);
  const storageB = storageSignature(b);

  // Pojemność jest cechą tożsamości produktu.
  // Jeżeli tylko jedna oferta ją podaje, nie łączymy ich na siłę.
  if (
    (storageA.length > 0 || storageB.length > 0) &&
    !arraysEqual(storageA, storageB)
  ) {
    return false;
  }

  const modifiersA = modifierSignature(a);
  const modifiersB = modifierSignature(b);

  // iPhone 15 != iPhone 15 Pro, Galaxy S != Galaxy S Ultra itd.
  if (!arraysEqual(modifiersA, modifiersB)) {
    return false;
  }

  const numbersA = significantNumberSignature(a);
  const numbersB = significantNumberSignature(b);

  if (numbersA.length > 0 && numbersB.length > 0) {
    const common = numbersA.filter((value) => numbersB.includes(value));

    // Jeśli oba tytuły mają liczby modelu/specyfikacji, muszą mieć
    // co najmniej jeden wspólny rdzeń. Chroni np. iPhone 14 vs 15.
    if (common.length === 0) {
      return false;
    }

    const conflictingA = numbersA.filter(
      (value) => !numbersB.includes(value)
    );
    const conflictingB = numbersB.filter(
      (value) => !numbersA.includes(value)
    );

    // Gdy po obu stronach występują różne większe liczby,
    // traktujemy to jako inny model/specyfikację.
    if (conflictingA.length > 0 && conflictingB.length > 0) {
      return false;
    }
  }

  const mixedA = mixedModelTokenSignature(a);
  const mixedB = mixedModelTokenSignature(b);

  if (mixedA.length > 0 && mixedB.length > 0) {
    const commonMixed = mixedA.some((token) => mixedB.includes(token));

    // Różne jawne oznaczenia modelowe po obu stronach = osobne produkty.
    if (!commonMixed) {
      return false;
    }
  }

  const tokensA = productIdentityTokens(a);
  const tokensB = productIdentityTokens(b);
  const similarity = setOverlapRatio(tokensA, tokensB);

  const overlapCount = tokensA.filter((token) =>
    tokensB.includes(token)
  ).length;

  return similarity >= 0.5 && overlapCount >= 2;
}

function sourceKindLabel(store: string): "Marketplace" | "Sklep" | "Źródło" {
  const normalized = normalizeGroupingText(store);

  if (
    normalized.includes("allegro") ||
    normalized.includes("olx") ||
    normalized.includes("ebay") ||
    normalized.includes("vinted") ||
    normalized.includes("facebook marketplace")
  ) {
    return "Marketplace";
  }

  if (
    normalized.includes("x kom") ||
    normalized.includes("xkom") ||
    normalized.includes("media markt") ||
    normalized.includes("mediamarkt") ||
    normalized.includes("media expert") ||
    normalized.includes("morele") ||
    normalized.includes("rtv euro") ||
    normalized.includes("euro agd") ||
    normalized.includes("komputronik") ||
    normalized.includes("neonet")
  ) {
    return "Sklep";
  }

  return "Źródło";
}

function sourceKindChipTone(store: string): string {
  const kind = sourceKindLabel(store);

  if (kind === "Marketplace") {
    return "border-amber-400/18 bg-amber-400/[0.055] text-amber-200";
  }

  if (kind === "Sklep") {
    return "border-blue-400/16 bg-blue-500/[0.05] text-blue-200";
  }

  return "border-white/[0.08] bg-white/[0.025] text-gray-400";
}

function marketplaceTrustNote(store: string): string | null {
  return sourceKindLabel(store) === "Marketplace"
    ? "Marketplace — sprawdź stan, sprzedawcę i warunki gwarancji"
    : null;
}

function compactListingName(
  offer: Product,
  familyDisplayName: string
): string {
  const color = extractColorVariant(offer.name);
  const cleanFamily = familyDisplayName.trim();

  if (color) {
    return `${cleanFamily} — ${color}`;
  }

  return cleanFamily || offer.name;
}

function listingVariantLabel(offer: Product): string | null {
  const color = extractColorVariant(offer.name);

  if (color) {
    return `Kolor: ${color}`;
  }

  return null;
}

function cleanFamilyDisplayName(product: Product): string {
  let value = removeColorFromDisplayName(product.name);

  const removableWords = [
    "smartfon",
    "telefon",
    "nowy",
    "nowa",
    "nowe",
    "używany",
    "uzywany",
    "używana",
    "uzywana",
    "fabrycznie",
    "zaplombowany",
    "zaplombowana",
    "zaplombowane",
    "sealed",
    "bez rat",
  ];

  for (const word of removableWords) {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    value = value.replace(
      new RegExp(`(^|[\\s,(/-])${escaped}(?=$|[\\s,)/-])`, "gi"),
      "$1"
    );
  }

  value = value
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,)/-])/g, "$1")
    .replace(/([(/-])\s+/g, "$1")
    .replace(/[-,/]\s*$/, "")
    .trim();

  return value || product.name;
}

function selectFamilyRepresentative(offers: Product[]): Product {
  return selectGroupRepresentative(offers);
}

function selectCostRepresentative(offers: Product[]): Product {
  return [...offers].sort((a, b) => {
    const totalA = getPurchaseTotal(a);
    const totalB = getPurchaseTotal(b);

    if (totalA !== null || totalB !== null) {
      if (totalA === null) return 1;
      if (totalB === null) return -1;

      if (totalA !== totalB) {
        return totalA - totalB;
      }
    }

    return (a.price ?? Infinity) - (b.price ?? Infinity);
  })[0];
}

function buildFamilyStoreOffers(
  offers: Product[]
): ProductFamilyStoreOffer[] {
  const stores = new Map<string, Product[]>();

  for (const offer of offers) {
    const key = normalizeGroupingText(offer.store);

    if (!stores.has(key)) {
      stores.set(key, []);
    }

    stores.get(key)!.push(offer);
  }

  return Array.from(stores.entries())
    .map(([key, storeOffers]) => {
      const representative = selectGroupRepresentative(storeOffers);
      const costRepresentative = selectCostRepresentative(storeOffers);
      const colors = Array.from(
        new Set(
          storeOffers
            .map((offer) => extractColorVariant(offer.name))
            .filter((color): color is string => Boolean(color))
        )
      );

      const prices = storeOffers
        .map((offer) => offer.price)
        .filter(
          (price): price is number =>
            price !== null && Number.isFinite(price)
        );

      const totals = storeOffers
        .map((offer) => getPurchaseTotal(offer))
        .filter(
          (total): total is number =>
            total !== null && Number.isFinite(total)
        );

      return {
        key,
        store: representative.store,
        representative,
        costRepresentative,
        offers: storeOffers,
        colors,
        lowestPrice:
          prices.length > 0 ? Math.min(...prices) : null,
        lowestConfirmedTotal:
          totals.length > 0 ? Math.min(...totals) : null,
      };
    })
    .sort((a, b) => {
      const bestA = a.offers.some((offer) => offer.bestOffer);
      const bestB = b.offers.some((offer) => offer.bestOffer);

      if (bestA !== bestB) return bestA ? -1 : 1;

      const scoreA = a.representative.dealScore ?? -1;
      const scoreB = b.representative.dealScore ?? -1;

      if (scoreB !== scoreA) return scoreB - scoreA;

      if (
        a.lowestConfirmedTotal !== null ||
        b.lowestConfirmedTotal !== null
      ) {
        if (a.lowestConfirmedTotal === null) return 1;
        if (b.lowestConfirmedTotal === null) return -1;

        if (a.lowestConfirmedTotal !== b.lowestConfirmedTotal) {
          return a.lowestConfirmedTotal - b.lowestConfirmedTotal;
        }
      }

      return (a.lowestPrice ?? Infinity) - (b.lowestPrice ?? Infinity);
    });
}

function buildProductFamilies(
  groups: ProductGroup[]
): ProductFamily[] {
  const buckets: ProductGroup[][] = [];

  for (const group of groups) {
    const matchingBucket = buckets.find((bucket) =>
      sameProductIdentity(
        bucket[0].representative,
        group.representative
      )
    );

    if (matchingBucket) {
      matchingBucket.push(group);
    } else {
      buckets.push([group]);
    }
  }

  return buckets.map((bucket, index) => {
    const offers = bucket.flatMap((group) => group.offers);
    const representative = selectFamilyRepresentative(offers);
    const storeOffers = buildFamilyStoreOffers(offers);
    const colors = Array.from(
      new Set(
        offers
          .map((offer) => extractColorVariant(offer.name))
          .filter((color): color is string => Boolean(color))
      )
    );

    const prices = offers
      .map((offer) => offer.price)
      .filter(
        (price): price is number =>
          price !== null && Number.isFinite(price)
      );

    const totals = offers
      .map((offer) => getPurchaseTotal(offer))
      .filter(
        (total): total is number =>
          total !== null && Number.isFinite(total)
      );

    return {
      key: `product-family-${index}-${normalizeGroupingText(
        cleanFamilyDisplayName(representative)
      )}`,
      displayName: productUiIdentity(
        representative,
        cleanFamilyDisplayName(representative)
      ),
      representative,
      offers,
      storeOffers,
      colors,
      lowestPrice:
        prices.length > 0 ? Math.min(...prices) : null,
      lowestConfirmedTotal:
        totals.length > 0 ? Math.min(...totals) : null,
      storeCount: storeOffers.length,
    };
  });
}

function familyHasProduct(
  family: ProductFamily,
  product: Product | null
): boolean {
  return Boolean(
    product &&
      family.offers.some((offer) => offer.id === product.id)
  );
}

function storeOfferHasProduct(
  storeOffer: ProductFamilyStoreOffer,
  product: Product | null
): boolean {
  return Boolean(
    product &&
      storeOffer.offers.some((offer) => offer.id === product.id)
  );
}

function familyQualityScore(family: ProductFamily): number {
  const scores = family.offers
    .map((offer) => offer.dealScore)
    .filter(
      (score): score is number =>
        typeof score === "number" && Number.isFinite(score)
    );

  if (scores.length > 0) {
    return Math.max(...scores);
  }

  return productGroupQualityScore({
    key: family.key,
    displayName: family.displayName,
    representative: family.representative,
    offers: family.offers,
    colors: family.colors,
    lowestPrice: family.lowestPrice,
    lowestConfirmedTotal: family.lowestConfirmedTotal,
  });
}

function sortProductFamilies(
  families: ProductFamily[]
): ProductFamily[] {
  return [...families].sort((a, b) => {
    const scoreDiff =
      familyQualityScore(b) - familyQualityScore(a);

    if (scoreDiff !== 0) return scoreDiff;

    const costA =
      a.lowestConfirmedTotal ?? a.lowestPrice ?? Infinity;
    const costB =
      b.lowestConfirmedTotal ?? b.lowestPrice ?? Infinity;

    return costA - costB;
  });
}

function familyVariantSummary(
  family: ProductFamily | null
): string | null {
  if (!family) return null;

  const pieces: string[] = [];

  if (family.colors.length > 0) {
    pieces.push(
      family.colors.length === 1
        ? `kolor: ${family.colors[0]}`
        : countLabel(family.colors.length, "kolor", "kolory", "kolorów")
    );
  }

  if (family.storeCount > 0) {
    pieces.push(
      countLabel(family.storeCount, "źródło", "źródła", "źródeł")
    );
  }

  pieces.push(
    countLabel(family.offers.length, "oferta", "oferty", "ofert")
  );

  return pieces.join(" · ");
}

function productGroupQualityScore(group: ProductGroup): number {
  const product = group.representative;

  if (typeof product.dealScore === "number" && Number.isFinite(product.dealScore)) {
    return product.dealScore;
  }

  const match =
    typeof product.matchScore === "number" && Number.isFinite(product.matchScore)
      ? product.matchScore
      : 0;
  const source =
    typeof product.sourceConfidence === "number" &&
    Number.isFinite(product.sourceConfidence)
      ? product.sourceConfidence
      : 0;
  const price =
    typeof product.priceScore === "number" && Number.isFinite(product.priceScore)
      ? product.priceScore
      : 0;

  return match * 0.6 + source * 0.25 + price * 0.15;
}

function productGroupCost(group: ProductGroup): number {
  return (
    group.lowestConfirmedTotal ??
    group.lowestPrice ??
    Infinity
  );
}

function diversifyProductGroups(groups: ProductGroup[]): ProductGroup[] {
  /*
   * SOURCE DIVERSITY:
   * 1. Najpierw zachowujemy ranking jakości.
   * 2. Inny sklep może zostać przesunięty wyżej TYLKO wtedy,
   *    gdy jego wynik jakości jest porównywalny (maks. 8 pkt różnicy).
   * 3. Nie zmieniamy bestOffer / cheapestOffer / safestOffer.
   * 4. Nie łączymy produktów między sklepami.
   *
   * Dzięki temu ASARVO nie pokazuje np. sześciu kart jednego sklepu
   * na początku listy, ale też nie promuje słabej oferty wyłącznie
   * po to, żeby sztucznie zwiększyć różnorodność.
   */
  const remaining = [...groups].sort((a, b) => {
    const scoreDiff =
      productGroupQualityScore(b) - productGroupQualityScore(a);

    if (scoreDiff !== 0) return scoreDiff;

    return productGroupCost(a) - productGroupCost(b);
  });

  const result: ProductGroup[] = [];
  const storeUsage = new Map<string, number>();
  const MAX_QUALITY_GAP = 8;
  const CANDIDATE_WINDOW = 8;

  while (remaining.length > 0) {
    const bestRemainingScore = productGroupQualityScore(remaining[0]);

    let chosenIndex = 0;
    let chosenStoreUsage =
      storeUsage.get(
        normalizeGroupingText(remaining[0].representative.store)
      ) ?? 0;
    let chosenScore = bestRemainingScore;
    let chosenCost = productGroupCost(remaining[0]);

    const maxIndex = Math.min(remaining.length, CANDIDATE_WINDOW);

    for (let index = 1; index < maxIndex; index += 1) {
      const candidate = remaining[index];
      const candidateScore = productGroupQualityScore(candidate);

      if (bestRemainingScore - candidateScore > MAX_QUALITY_GAP) {
        continue;
      }

      const storeKey = normalizeGroupingText(candidate.representative.store);
      const usage = storeUsage.get(storeKey) ?? 0;
      const cost = productGroupCost(candidate);

      const isBetterDiversityChoice =
        usage < chosenStoreUsage ||
        (usage === chosenStoreUsage && candidateScore > chosenScore) ||
        (usage === chosenStoreUsage &&
          candidateScore === chosenScore &&
          cost < chosenCost);

      if (isBetterDiversityChoice) {
        chosenIndex = index;
        chosenStoreUsage = usage;
        chosenScore = candidateScore;
        chosenCost = cost;
      }
    }

    const [chosen] = remaining.splice(chosenIndex, 1);
    const chosenStoreKey = normalizeGroupingText(chosen.representative.store);

    storeUsage.set(
      chosenStoreKey,
      (storeUsage.get(chosenStoreKey) ?? 0) + 1
    );

    result.push(chosen);
  }

  return result;
}

function findProductGroup(
  groups: ProductGroup[],
  product: Product | null
): ProductGroup | null {
  if (!product) return null;

  return (
    groups.find((group) =>
      group.offers.some((offer) => offer.id === product.id)
    ) ?? null
  );
}

function groupHasProduct(
  group: ProductGroup,
  product: Product | null
): boolean {
  return Boolean(
    product &&
      group.offers.some((offer) => offer.id === product.id)
  );
}

function variantSummary(group: ProductGroup | null): string | null {
  if (!group || group.offers.length <= 1) return null;

  if (group.colors.length > 1) {
    return `Dostępny w ${group.colors.length} kolorach: ${group.colors.join(" · ")}`;
  }

  return `${group.offers.length} zweryfikowane oferty tego samego wariantu`;
}

function readNumber(
  value: unknown
): number | null {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : null;
}

function riskLabel(
  risk: RiskLevel | null | undefined
): string {
  if (risk === "low") return "Niskie ryzyko";
  if (risk === "medium") return "Średnie ryzyko";
  if (risk === "high") return "Wysokie ryzyko";
  return "Ryzyko: brak danych";
}

function originalityLabel(
  confidence: OriginalityConfidence | undefined
): string {
  if (confidence === "high") return "Wysokie sygnały oryginalności";
  if (confidence === "medium") return "Średnie sygnały oryginalności";
  if (confidence === "low") return "Niskie sygnały oryginalności";
  return "Oryginalność: brak danych";
}

function priceAttractivenessLabel(
  value: PriceAttractiveness | null | undefined
): string | null {
  if (value === "excellent") return "Świetna cena";
  if (value === "good") return "Dobra cena";
  if (value === "fair") return "Przeciętna cena";
  if (value === "poor") return "Wysoka cena";
  return null;
}

function singleModelReason(product: Product): string {
  const reasons: string[] = [];

  if (typeof product.matchScore === "number" && product.matchScore >= 70) {
    reasons.push("dobre dopasowanie do zapytania");
  } else if (typeof product.matchScore === "number" && product.matchScore >= 55) {
    reasons.push("solidne dopasowanie do zapytania");
  }

  if (product.riskLevel === "low") {
    reasons.push("niskie ryzyko");
  } else if (product.riskLevel === "medium") {
    reasons.push("ryzyko na akceptowalnym poziomie");
  }

  if (product.priceVerified) {
    reasons.push("cena zweryfikowana");
  }

  if (product.delivery === 0) {
    reasons.push("darmowa dostawa");
  }

  if (
    typeof product.sourceConfidence === "number" &&
    product.sourceConfidence >= 80
  ) {
    reasons.push("silne źródło");
  }

  return (
    reasons.slice(0, 4).join(" • ") ||
    "najlepiej zweryfikowany wynik dla tego zapytania"
  );
}

function productConditionLabel(product: Product): string {
  if (product.condition) {
    return `Stan: ${product.condition.toLowerCase()}`;
  }

  if (product.assessedCondition === "new") {
    return "Stan: nowy";
  }

  if (product.assessedCondition === "used") {
    return "Stan: używany";
  }

  return "Stan: brak danych";
}

function categoryLabel(category: string): string {
  const normalized = category.toLowerCase();

  if (normalized === "controller") return "kontroler / pad";
  if (normalized === "console") return "konsola";
  if (normalized === "headphones") return "słuchawki";
  if (normalized === "phone") return "telefon";
  if (normalized === "laptop") return "laptop";
  if (normalized === "monitor") return "monitor";

  return category;
}

type DiscountCode = {
  code: string;
  discountPercent: number | null;
  minPrice: number | null;
  store: string;
  expires: string | null;
  description: string;
  sourceUrl: string;
  sourceTitle: string;
};

type SearchApiResponse = {
  interpreted?: Interpretation;
  offers?: unknown[];
  ranking?: {
    version?: string;
    bestOfferId?: number | null;
    cheapestOfferId?: number | null;
    safestOfferId?: number | null;
  };
  error?: string | null;
};

// ASARVO_SEARCH_CANCEL_V1
type CachedSearchRequest = {
  createdAt: number;
  promise: Promise<SearchApiResponse>;
  controller: AbortController;
};

const SEARCH_REQUEST_CACHE = new Map<string, CachedSearchRequest>();
const SEARCH_REQUEST_TTL_MS = 3000;

async function saveSearchHistory(
  query: string,
  resultCount: number,
  interpreted: Interpretation | null
): Promise<void> {
  try {
    const supabase = createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return;
    }

    const normalizedQuery = query.trim().slice(0, 500);

    if (!normalizedQuery) {
      return;
    }

    // Nie zapisujemy podwójnie tego samego wyszukania uruchomionego
    // w ciągu kilku sekund (np. React Strict Mode w development).
    const { data: latest } = await supabase
      .from("search_history")
      .select("id,searched_at")
      .eq("user_id", user.id)
      .eq("query", normalizedQuery)
      .order("searched_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latest?.searched_at) {
      const latestTime = new Date(latest.searched_at).getTime();

      if (
        Number.isFinite(latestTime) &&
        Date.now() - latestTime < 10_000
      ) {
        return;
      }
    }

    const { error } = await supabase
      .from("search_history")
      .insert({
        user_id: user.id,
        query: normalizedQuery,
        result_count: Math.max(0, Math.floor(resultCount)),
        interpreted,
      });

    if (error) {
      console.error("[ASARVO HISTORY][INSERT]", error);
      return;
    }

    // Free plan: przechowujemy maksymalnie 200 ostatnich wyszukiwań.
    const { data: oldRows } = await supabase
      .from("search_history")
      .select("id")
      .eq("user_id", user.id)
      .order("searched_at", { ascending: false })
      .range(200, 699);

    if (oldRows?.length) {
      const ids = oldRows
        .map((row) => row.id)
        .filter((id): id is number => typeof id === "number");

      if (ids.length) {
        await supabase
          .from("search_history")
          .delete()
          .eq("user_id", user.id)
          .in("id", ids);
      }
    }
  } catch (error) {
    // Historia konta nie może nigdy blokować wyszukiwarki.
    console.warn("[ASARVO] Nie udało się zapisać historii:", error);
  }
}

type AccountPriceWatch = {
  id: string;
  product_key: string;
  target_price: number;
  active: boolean;
};

type PriceWatchEditor = {
  product: Product;
  targetPriceInput: string;
};

function normalizeStorageText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function productStorageKey(product: Product): string {
  const url = typeof product.url === "string" ? product.url.trim() : "";

  if (url) {
    return `url:${url}`.slice(0, 1000);
  }

  return `fallback:${normalizeStorageText(product.store)}|${normalizeStorageText(
    product.name
  )}`.slice(0, 1000);
}

function parsePriceInput(value: string): number | null {
  const normalized = value
    .trim()
    .replace(/\s+/g, "")
    .replace(",", ".");

  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized);

  return Number.isFinite(parsed) && parsed > 0
    ? Math.round(parsed * 100) / 100
    : null;
}

function suggestedTargetPrice(price: number | null): string {
  if (price === null || !Number.isFinite(price) || price <= 0) {
    return "";
  }

  const suggested = Math.max(0.01, Math.round(price * 0.9 * 100) / 100);
  return suggested.toFixed(2).replace(".", ",");
}

function getSearchRequest(query: string): Promise<SearchApiResponse> {
  const key = query.trim().toLowerCase();
  const now = Date.now();
  const cached = SEARCH_REQUEST_CACHE.get(key);

  if (
    cached &&
    !cached.controller.signal.aborted &&
    now - cached.createdAt < SEARCH_REQUEST_TTL_MS
  ) {
    return cached.promise;
  }

  if (cached?.controller.signal.aborted) {
    SEARCH_REQUEST_CACHE.delete(key);
  }

  const controller = new AbortController();

  const promise = fetch("/api/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    signal: controller.signal,
    body: JSON.stringify({
      query,
    }),
  }).then(async (response) => {
    const data = (await response.json()) as SearchApiResponse;

    if (!response.ok) {
      throw new Error(data.error || "Nie udało się wyszukać ofert.");
    }

    return data;
  });

  SEARCH_REQUEST_CACHE.set(key, {
    createdAt: now,
    promise,
    controller,
  });

  setTimeout(() => {
    const entry = SEARCH_REQUEST_CACHE.get(key);

    if (entry?.promise === promise) {
      SEARCH_REQUEST_CACHE.delete(key);
    }
  }, SEARCH_REQUEST_TTL_MS);

  return promise;
}

function cancelSearchRequest(query: string): boolean {
  const key = query.trim().toLowerCase();

  if (!key) {
    return false;
  }

  const cached = SEARCH_REQUEST_CACHE.get(key);

  if (!cached) {
    return false;
  }

  SEARCH_REQUEST_CACHE.delete(key);

  if (!cached.controller.signal.aborted) {
    cached.controller.abort();
  }

  return true;
}

function isSearchAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

const products: Product[] = [
  {
    id: 1,
    name: "Sony DualShock 4 V2 Czarny",
    store: "GameStore",
    price: 179.99,
    rating: 4.8,
    condition: "Nowy",
    original: true,
    delivery: 0,
    category: "controller",
    platform: "PS4",
    brand: "sony",
  },
  {
    id: 2,
    name: "Sony DualShock 4 PS4 V2",
    store: "TechMarket",
    price: 189,
    rating: 4.7,
    condition: "Nowy",
    original: true,
    delivery: 0,
    category: "controller",
    platform: "PS4",
    brand: "sony",
  },
  {
    id: 3,
    name: "DualShock 4 Wireless Controller",
    store: "ElectroShop",
    price: 159.99,
    rating: 4.5,
    condition: "Używany",
    original: true,
    delivery: 12.99,
    category: "controller",
    platform: "PS4",
    brand: "sony",
  },

  {
    id: 4,
    name: "Lenovo LOQ Gaming",
    store: "GameStore",
    price: 3499,
    rating: 4.8,
    condition: "Nowy",
    original: true,
    delivery: 0,
    category: "laptop",
    platform: "PC",
    brand: "lenovo",
  },
  {
    id: 5,
    name: "ASUS TUF Gaming A15",
    store: "TechMarket",
    price: 3799,
    rating: 4.6,
    condition: "Nowy",
    original: true,
    delivery: 0,
    category: "laptop",
    platform: "PC",
    brand: "asus",
  },
  {
    id: 6,
    name: "Acer Nitro V15",
    store: "ElectroShop",
    price: 3199,
    rating: 4.5,
    condition: "Używany",
    original: true,
    delivery: 15,
    category: "laptop",
    platform: "PC",
    brand: "acer",
  },

  {
    id: 7,
    name: "iPhone 15 128 GB",
    store: "TechMarket",
    price: 2899,
    rating: 4.8,
    condition: "Nowy",
    original: true,
    delivery: 0,
    category: "phone",
    platform: null,
    brand: "apple",
  },
  {
    id: 8,
    name: "iPhone 14 128 GB",
    store: "GameStore",
    price: 2399,
    rating: 4.7,
    condition: "Używany",
    original: true,
    delivery: 0,
    category: "phone",
    platform: null,
    brand: "apple",
  },
];

function SearchPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const query = searchParams.get("q") || "";

  // ASARVO_SEARCH_STATE_V1
  const conditionUrlParam = searchParams.get("condition");
  const priceUrlParam = searchParams.get("price");
  const deliveryUrlParam = searchParams.get("delivery");
  const storeUrlParam = searchParams.get("store");
  const ratingUrlParam = searchParams.get("rating");
  const sortUrlParam = searchParams.get("sort");

  const searchStateValue = (
    value: string | null,
    allowed: readonly string[],
    fallback: string
  ): string =>
    value && allowed.includes(value)
      ? value
      : fallback;

  const conditionFromUrl = searchStateValue(
    conditionUrlParam,
    ["Wszystkie", "Nowy", "Używany"],
    "Wszystkie"
  );

  const priceFromUrl = searchStateValue(
    priceUrlParam,
    [
      "Wszystkie",
      "Do 100 zł",
      "Do 200 zł",
      "Do 500 zł",
      "Do 1000 zł",
      "Do 2000 zł",
      "Do 4000 zł",
    ],
    "Wszystkie"
  );

  const deliveryFromUrl = searchStateValue(
    deliveryUrlParam,
    [
      "Wszystkie",
      "Darmowa",
      "Płatna",
      "Niepotwierdzona",
    ],
    "Wszystkie"
  );

  const storeFromUrl =
    storeUrlParam?.trim() || "Wszystkie";

  const ratingFromUrl = searchStateValue(
    ratingUrlParam,
    ["Wszystkie", "4+", "4.5+", "4.8+"],
    "Wszystkie"
  );

  const sortFromUrl = searchStateValue(
    sortUrlParam,
    [
      "ASARVO",
      "Cena: rosnąco",
      "Cena: malejąco",
      "Ocena: najwyższa",
      "Sklep: A-Z",
    ],
    "ASARVO"
  );
  const activeSearchIdRef = useRef(0);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const [searchInput, setSearchInput] = useState(query);
  const [imageAnalyzing, setImageAnalyzing] = useState(false);
  const [imageMessage, setImageMessage] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [favoriteKeys, setFavoriteKeys] = useState<Set<string>>(
    () => new Set()
  );
  const [priceWatchByKey, setPriceWatchByKey] = useState<
    Map<string, AccountPriceWatch>
  >(() => new Map());
  const [priceWatchEditor, setPriceWatchEditor] =
    useState<PriceWatchEditor | null>(null);
  const [priceWatchError, setPriceWatchError] =
    useState<string | null>(null);
  const [libraryActionMessage, setLibraryActionMessage] =
    useState<string | null>(null);
  const [libraryActionBusyKey, setLibraryActionBusyKey] =
    useState<string | null>(null);

  const [interpretation, setInterpretation] =
    useState<Interpretation | null>(null);

  const [loading, setLoading] = useState(true);

  const [products, setProducts] = useState<Product[]>([]);

  const [searchError, setSearchError] = useState<string | null>(null);

  // ASARVO_SEARCH_REFRESH_V1
  const [restoredFromSearchCache, setRestoredFromSearchCache] =
    useState(false);
  const [searchRefreshNonce, setSearchRefreshNonce] =
    useState(0);

  // ASARVO_SEARCH_CANCEL_V1_FIX1
  const searchWasCancelled =
    searchError === "Wyszukiwanie anulowane.";

  const [conditionFilter, setConditionFilter] =
    useState(conditionFromUrl);

  const [priceFilter, setPriceFilter] =
    useState(priceFromUrl);

  const [deliveryFilter, setDeliveryFilter] =
    useState(deliveryFromUrl);

  const [storeFilter, setStoreFilter] =
    useState(storeFromUrl);

  const [ratingFilter, setRatingFilter] =
    useState(ratingFromUrl);

  // ASARVO_RELEVANCE_SHIELD_V1
  const [showSuspiciousMatches, setShowSuspiciousMatches] =
    useState(false);

  // ASARVO_SORTING_V1
  const [sortMode, setSortMode] =
    useState(sortFromUrl);

  // ASARVO_COMPARE_V1
  const [compareFamilyKeys, setCompareFamilyKeys] =
    useState<string[]>([]);

  // ASARVO_COMPARE_V3
  const [compareDifferencesOnly, setCompareDifferencesOnly] =
    useState(false);

  const searchStateUrlSyncRef = useRef(false);
  const compareQueryRef = useRef(query);

  // URL -> UI: back/forward, reload and shared search links restore state.
  useEffect(() => {
    const changed =
      conditionFilter !== conditionFromUrl ||
      priceFilter !== priceFromUrl ||
      deliveryFilter !== deliveryFromUrl ||
      storeFilter !== storeFromUrl ||
      ratingFilter !== ratingFromUrl ||
      sortMode !== sortFromUrl;

    if (!changed) {
      return;
    }

    searchStateUrlSyncRef.current = true;
    setConditionFilter(conditionFromUrl);
    setPriceFilter(priceFromUrl);
    setDeliveryFilter(deliveryFromUrl);
    setStoreFilter(storeFromUrl);
    setRatingFilter(ratingFromUrl);
    setSortMode(sortFromUrl);
  }, [
    query,
    conditionUrlParam,
    priceUrlParam,
    deliveryUrlParam,
    storeUrlParam,
    ratingUrlParam,
    sortUrlParam,
  ]);

  // A new search must not inherit Compare selections from previous results.
  useEffect(() => {
    if (compareQueryRef.current === query) {
      return;
    }

    compareQueryRef.current = query;
    setCompareFamilyKeys([]);
    setShowSuspiciousMatches(false);
  }, [query, searchRefreshNonce]);

  // UI -> URL: keep the current search configuration in the browser address.
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (searchStateUrlSyncRef.current) {
      searchStateUrlSyncRef.current = false;
      return;
    }

    const params = new URLSearchParams(
      window.location.search
    );

    const setSearchStateParam = (
      key: string,
      value: string,
      defaultValue: string
    ) => {
      if (value === defaultValue) {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    };

    setSearchStateParam(
      "condition",
      conditionFilter,
      "Wszystkie"
    );
    setSearchStateParam(
      "price",
      priceFilter,
      "Wszystkie"
    );
    setSearchStateParam(
      "delivery",
      deliveryFilter,
      "Wszystkie"
    );
    setSearchStateParam(
      "store",
      storeFilter,
      "Wszystkie"
    );
    setSearchStateParam(
      "rating",
      ratingFilter,
      "Wszystkie"
    );
    setSearchStateParam(
      "sort",
      sortMode,
      "ASARVO"
    );

    const queryString = params.toString();
    const nextUrl =
      window.location.pathname +
      (queryString ? `?${queryString}` : "") +
      window.location.hash;
    const currentUrl =
      window.location.pathname +
      window.location.search +
      window.location.hash;

    if (nextUrl !== currentUrl) {
      window.history.replaceState(
        window.history.state,
        "",
        nextUrl
      );
    }
  }, [
    conditionFilter,
    priceFilter,
    deliveryFilter,
    storeFilter,
    ratingFilter,
    sortMode,
  ]);

  const [copiedCode, setCopiedCode] =
    useState<string | null>(null);

  const [bestDiscount, setBestDiscount] =
    useState<DiscountCode | null>(null);

  const [couponLoading, setCouponLoading] =
    useState(false);

  const refreshAccountLibrary = async () => {
    const supabase = createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setFavoriteKeys(new Set());
      setPriceWatchByKey(new Map());
      return;
    }

    const [favoritesResult, watchesResult] = await Promise.all([
      supabase
        .from("favorites")
        .select("product_key")
        .eq("user_id", user.id),
      supabase
        .from("price_watches")
        .select("id,product_key,target_price,active")
        .eq("user_id", user.id),
    ]);

    if (favoritesResult.error) {
      console.error("[ASARVO FAVORITES][LOAD]", favoritesResult.error);
    } else {
      setFavoriteKeys(
        new Set(
          (favoritesResult.data ?? [])
            .map((row) => row.product_key)
            .filter(
              (value): value is string =>
                typeof value === "string" && value.length > 0
            )
        )
      );
    }

    if (watchesResult.error) {
      console.error("[ASARVO WATCHES][LOAD]", watchesResult.error);
    } else {
      const next = new Map<string, AccountPriceWatch>();

      for (const row of watchesResult.data ?? []) {
        if (
          typeof row.id === "string" &&
          typeof row.product_key === "string"
        ) {
          next.set(row.product_key, {
            id: row.id,
            product_key: row.product_key,
            target_price:
              typeof row.target_price === "number"
                ? row.target_price
                : Number(row.target_price),
            active: row.active !== false,
          });
        }
      }

      setPriceWatchByKey(next);
    }
  };

  const isFavorite = (product: Product): boolean =>
    favoriteKeys.has(productStorageKey(product));

  const getPriceWatch = (
    product: Product
  ): AccountPriceWatch | null =>
    priceWatchByKey.get(productStorageKey(product)) ?? null;

  const requireAccount = (): boolean => {
    if (isAuthenticated) {
      return true;
    }

    router.push("/login");
    return false;
  };

  const toggleFavorite = async (product: Product) => {
    if (!requireAccount()) {
      return;
    }

    const key = productStorageKey(product);
    setLibraryActionBusyKey(`favorite:${key}`);
    setLibraryActionMessage(null);

    try {
      const supabase = createClient();
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        router.push("/login");
        return;
      }

      if (favoriteKeys.has(key)) {
        const { error } = await supabase
          .from("favorites")
          .delete()
          .eq("user_id", user.id)
          .eq("product_key", key);

        if (error) {
          throw error;
        }

        setFavoriteKeys((current) => {
          const next = new Set(current);
          next.delete(key);
          return next;
        });
        setLibraryActionMessage("Usunięto ofertę z ulubionych.");
      } else {
        const { error } = await supabase
          .from("favorites")
          .insert({
            user_id: user.id,
            product_key: key,
            query: query.trim(),
            product: { ...product },
          });

        if (error) {
          throw error;
        }

        setFavoriteKeys((current) => {
          const next = new Set(current);
          next.add(key);
          return next;
        });
        setLibraryActionMessage("Oferta została dodana do ulubionych.");
      }
    } catch (error) {
      console.error("[ASARVO FAVORITES][TOGGLE]", error);
      setLibraryActionMessage(
        "Nie udało się zmienić ulubionych. Spróbuj ponownie."
      );
    } finally {
      setLibraryActionBusyKey(null);
    }
  };

  // ASARVO_SHARE_SEARCH_V1
  const shareCurrentSearch = async () => {
    if (typeof window === "undefined") {
      return;
    }

    // ASARVO_SHARE_SEARCH_V1_FIX1
    // ASARVO_SHARE_SEARCH_V1_FIX2
    // Search sharing is clipboard-only on purpose.
    // This guarantees that the shared target is the canonical /search URL,
    // never a product URL supplied by browser/OS share integration.
    const params = new URLSearchParams();

    if (query.trim()) {
      params.set("q", query.trim());
    }

    const setShareSearchParam = (
      key: string,
      value: string,
      defaultValue: string
    ) => {
      if (value !== defaultValue) {
        params.set(key, value);
      }
    };

    setShareSearchParam(
      "condition",
      conditionFilter,
      "Wszystkie"
    );
    setShareSearchParam(
      "price",
      priceFilter,
      "Wszystkie"
    );
    setShareSearchParam(
      "delivery",
      deliveryFilter,
      "Wszystkie"
    );
    setShareSearchParam(
      "store",
      storeFilter,
      "Wszystkie"
    );
    setShareSearchParam(
      "rating",
      ratingFilter,
      "Wszystkie"
    );
    setShareSearchParam(
      "sort",
      sortMode,
      "ASARVO"
    );

    const queryString = params.toString();
    const url =
      `${window.location.origin}/search` +
      (queryString ? `?${queryString}` : "");

    setLibraryActionMessage(null);

    try {
      if (
        typeof navigator !== "undefined" &&
        navigator.clipboard?.writeText
      ) {
        await navigator.clipboard.writeText(url);
      } else {
        const textarea =
          document.createElement("textarea");
        textarea.value = url;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();

        const copied =
          document.execCommand("copy");
        document.body.removeChild(textarea);

        if (!copied) {
          throw new Error(
            "Nie udało się skopiować linku."
          );
        }
      }

      setLibraryActionMessage(
        `Skopiowano link WYSZUKIWANIA (nie oferty): ${url}`
      );
    } catch (error) {
      console.error(
        "[ASARVO SHARE SEARCH COPY]",
        error
      );
      setLibraryActionMessage(
        "Nie udało się skopiować linku wyszukiwania."
      );
    }
  };

  // ASARVO_SHARE_V1
  const shareProduct = async (
    product: Product,
    displayName?: string
  ) => {
    const title =
      displayName?.trim() || product.name || "Oferta ASARVO";
    const url =
      product.url?.trim() ||
      (typeof window !== "undefined"
        ? window.location.href
        : "");
    const text =
      product.price !== null
        ? `${title} — ${formatPrice(product.price)}`
        : title;

    setLibraryActionMessage(null);

    const copyShareLink = async () => {
      if (!url) {
        throw new Error("Brak linku do udostępnienia.");
      }

      if (
        typeof navigator !== "undefined" &&
        navigator.clipboard?.writeText
      ) {
        await navigator.clipboard.writeText(url);
        return;
      }

      if (typeof document === "undefined") {
        throw new Error("Schowek jest niedostępny.");
      }

      const textarea = document.createElement("textarea");
      textarea.value = url;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();

      const copied = document.execCommand("copy");
      document.body.removeChild(textarea);

      if (!copied) {
        throw new Error("Nie udało się skopiować linku.");
      }
    };

    try {
      if (
        typeof navigator !== "undefined" &&
        typeof navigator.share === "function"
      ) {
        await navigator.share({
          title,
          text,
          url,
        });

        setLibraryActionMessage(
          "Oferta została udostępniona."
        );
        return;
      }

      await copyShareLink();
      setLibraryActionMessage(
        "Link do oferty skopiowano do schowka."
      );
    } catch (error) {
      if (
        error instanceof DOMException &&
        error.name === "AbortError"
      ) {
        return;
      }

      try {
        await copyShareLink();
        setLibraryActionMessage(
          "Link do oferty skopiowano do schowka."
        );
      } catch (copyError) {
        console.error(
          "[ASARVO SHARE]",
          error,
          copyError
        );
        setLibraryActionMessage(
          "Nie udało się udostępnić oferty."
        );
      }
    }
  };

  const shareFamily = async (family: ProductFamily) => {
    const shareCandidate =
      family.storeOffers
        .map((entry) => entry.costRepresentative)
        .find((offer) => Boolean(offer.url)) ??
      family.representative;

    await shareProduct(
      shareCandidate,
      family.displayName
    );
  };

  const openPriceWatchEditor = (product: Product) => {
    if (!requireAccount()) {
      return;
    }

    const existing = getPriceWatch(product);

    setPriceWatchError(null);
    setLibraryActionMessage(null);
    setPriceWatchEditor({
      product: { ...product },
      targetPriceInput: existing
        ? existing.target_price.toFixed(2).replace(".", ",")
        : suggestedTargetPrice(product.price),
    });
  };

  const closePriceWatchEditor = () => {
    setPriceWatchEditor(null);
    setPriceWatchError(null);
  };

  const savePriceWatch = async () => {
    if (!priceWatchEditor) {
      return;
    }

    const targetPrice = parsePriceInput(
      priceWatchEditor.targetPriceInput
    );

    if (targetPrice === null) {
      setPriceWatchError(
        "Wpisz prawidłową cenę większą od 0 zł."
      );
      return;
    }

    const product = priceWatchEditor.product;
    const key = productStorageKey(product);
    setLibraryActionBusyKey(`watch:${key}`);
    setPriceWatchError(null);

    try {
      const supabase = createClient();
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        router.push("/login");
        return;
      }

      const now = new Date().toISOString();

      const { error } = await supabase
        .from("price_watches")
        .upsert(
          {
            user_id: user.id,
            product_key: key,
            query: query.trim(),
            product: { ...product },
            target_price: targetPrice,
            current_price: product.price,
            last_checked_price: null,
            last_checked_at: null,
            active: true,
              email_alert_armed: true,
          },
          {
            onConflict: "user_id,product_key",
          }
        );

      if (error) {
        throw error;
      }

      await refreshAccountLibrary();
      closePriceWatchEditor();
      setLibraryActionMessage(
        `Obserwujesz cenę. Próg: ${formatPrice(targetPrice)}.`
      );
    } catch (error) {
      console.error("[ASARVO WATCHES][SAVE]", error);
      setPriceWatchError(
        "Nie udało się zapisać obserwacji ceny."
      );
    } finally {
      setLibraryActionBusyKey(null);
    }
  };

  const removePriceWatch = async (product: Product) => {
    if (!requireAccount()) {
      return;
    }

    const key = productStorageKey(product);
    setLibraryActionBusyKey(`watch:${key}`);
    setLibraryActionMessage(null);

    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login");
        return;
      }

      const { error } = await supabase
        .from("price_watches")
        .delete()
        .eq("user_id", user.id)
        .eq("product_key", key);

      if (error) {
        throw error;
      }

      setPriceWatchByKey((current) => {
        const next = new Map(current);
        next.delete(key);
        return next;
      });
      setLibraryActionMessage("Wyłączono obserwowanie ceny.");
    } catch (error) {
      console.error("[ASARVO WATCHES][DELETE]", error);
      setLibraryActionMessage(
        "Nie udało się wyłączyć obserwowania ceny."
      );
    } finally {
      setLibraryActionBusyKey(null);
    }
  };

  useEffect(() => {
    const supabase = createClient();
    let mounted = true;

    const refreshAuth = async () => {
      const { data } = await supabase.auth.getUser();

      if (!mounted) {
        return;
      }

      setIsAuthenticated(Boolean(data.user));
      setAuthReady(true);

      if (data.user) {
        void refreshAccountLibrary();
      } else {
        setFavoriteKeys(new Set());
        setPriceWatchByKey(new Map());
      }
    };

    void refreshAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) {
        return;
      }

      setIsAuthenticated(Boolean(session?.user));
      setAuthReady(true);

      if (session?.user) {
        void refreshAccountLibrary();
      } else {
        setFavoriteKeys(new Set());
        setPriceWatchByKey(new Map());
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // Synchronizujemy pole tekstowe z aktualnym adresem /search?q=...
  useEffect(() => {
    setSearchInput(query);
  }, [query]);

  const handleImageSearch = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      setImageMessage("Wybierz plik graficzny, np. JPG, PNG lub WEBP.");
      return;
    }

    if (file.size > 4 * 1024 * 1024) {
      setImageMessage("Zdjęcie jest za duże. Maksymalny rozmiar to 4 MB.");
      return;
    }

    setImageAnalyzing(true);
    setImageMessage("Analizuję zdjęcie i rozpoznaję produkt…");

    try {
      const formData = new FormData();
      formData.append("image", file);

      const response = await fetch("/api/vision", {
        method: "POST",
        body: formData,
      });

      const data = (await response.json().catch(() => null)) as
        | {
            ok?: boolean;
            query?: string;
            confidence?: number;
            error?: string;
          }
        | null;

      if (!response.ok || !data?.query) {
        throw new Error(
          data?.error ||
            "Nie udało się rozpoznać produktu na zdjęciu."
        );
      }

      const recognizedQuery = data.query.trim();

      if (!recognizedQuery) {
        throw new Error(
          "Nie udało się zbudować zapytania na podstawie zdjęcia."
        );
      }

      setSearchInput(recognizedQuery);
      setImageMessage(`Rozpoznano: „${recognizedQuery}” — uruchamiam wyszukiwanie…`);

      const nextUrl = `/search?q=${encodeURIComponent(recognizedQuery)}`;

      if (recognizedQuery.toLowerCase() === query.trim().toLowerCase()) {
        router.refresh();
      } else {
        router.push(nextUrl);
      }
    } catch (error) {
      setImageMessage(
        error instanceof Error
          ? error.message
          : "Nie udało się przeanalizować zdjęcia."
      );
    } finally {
      setImageAnalyzing(false);

      if (imageInputRef.current) {
        imageInputRef.current.value = "";
      }
    }
  };

  // ASARVO_SEARCH_STATE_V1_FIX1
  // ASARVO_SEARCH_STATE_V1_FIX2
  const SEARCH_SESSION_CACHE_TTL_MS = 3 * 60 * 1000;

  const searchSessionCacheKey = (value: string): string =>
    `asarvo:search-session:v1:${value
      .trim()
      .toLowerCase()}`;

  const readSearchSessionCache = (
    value: string
  ): {
    interpretation: Interpretation;
    products: Product[];
    error: string | null;
  } | null => {
    if (typeof window === "undefined") {
      return null;
    }

    const key = searchSessionCacheKey(value);

    try {
      const raw = window.sessionStorage.getItem(key);

      if (!raw) {
        return null;
      }

      const parsed = JSON.parse(raw) as {
        cachedAt?: unknown;
        interpretation?: unknown;
        products?: unknown;
        error?: unknown;
      };

      if (
        typeof parsed.cachedAt !== "number" ||
        !Number.isFinite(parsed.cachedAt) ||
        Date.now() - parsed.cachedAt >
          SEARCH_SESSION_CACHE_TTL_MS
      ) {
        window.sessionStorage.removeItem(key);
        return null;
      }

      if (
        !parsed.interpretation ||
        typeof parsed.interpretation !== "object" ||
        !Array.isArray(parsed.products)
      ) {
        window.sessionStorage.removeItem(key);
        return null;
      }

      return {
        interpretation:
          parsed.interpretation as Interpretation,
        products: parsed.products as Product[],
        error:
          typeof parsed.error === "string"
            ? parsed.error
            : null,
      };
    } catch {
      window.sessionStorage.removeItem(key);
      return null;
    }
  };

  const writeSearchSessionCache = (
    value: string,
    interpretation: Interpretation,
    products: Product[],
    error: string | null
  ) => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      window.sessionStorage.setItem(
        searchSessionCacheKey(value),
        JSON.stringify({
          cachedAt: Date.now(),
          interpretation,
          products,
          error,
        })
      );
    } catch {
      // Cache jest tylko optymalizacją UX.
    }
  };

  const refreshSearchResults = () => {
    const trimmedQuery = query.trim();

    if (!trimmedQuery) {
      return;
    }

    if (typeof window !== "undefined") {
      try {
        window.sessionStorage.removeItem(
          searchSessionCacheKey(trimmedQuery)
        );
      } catch {
        // Cache jest tylko optymalizacją UX.
      }
    }

    cancelSearchRequest(trimmedQuery);
    setRestoredFromSearchCache(false);
    setSearchError(null);
    setSearchRefreshNonce((current) => current + 1);
  };

  // ANALIZA ZAPYTANIA
  useEffect(() => {
    let cancelled = false;
    const searchId = ++activeSearchIdRef.current;

    async function analyzeQuery() {
      const trimmedQuery = query.trim();

      if (!trimmedQuery) {
        if (searchId === activeSearchIdRef.current) {
          setInterpretation(null);
          setProducts([]);
          setSearchError(null);
          setRestoredFromSearchCache(false);
          setLoading(false);
        }

        return;
      }

      try {
        const cachedSearch =
          readSearchSessionCache(trimmedQuery);

        if (
          cachedSearch &&
          searchId === activeSearchIdRef.current
        ) {
          setInterpretation(
            cachedSearch.interpretation
          );
          setProducts(cachedSearch.products);
          setSearchError(cachedSearch.error);
          setRestoredFromSearchCache(true);
          setLoading(false);
          return;
        }

        if (searchId === activeSearchIdRef.current) {
          setRestoredFromSearchCache(false);
          setLoading(true);
          setSearchError(null);
        }

        /*
         * WAŻNE:
         * getSearchRequest() ma krótki cache Promise.
         * W Next.js/React Strict Mode useEffect może zostać odpalony 2x
         * podczas developmentu. Oba wywołania dostaną wtedy TEN SAM Promise,
         * więc do /api/search poleci tylko jeden request.
         */
        const data = await getSearchRequest(trimmedQuery);

        if (cancelled || searchId !== activeSearchIdRef.current) {
          return;
        }

        // Zapisujemy wyszukiwanie w Supabase tylko dla zalogowanego użytkownika.
        // Endpoint sam ignoruje gości i zabezpiecza dane przez RLS.
        void saveSearchHistory(
          trimmedQuery,
          Array.isArray(data.offers) ? data.offers.length : 0,
          data.interpreted ?? null
        );

        if (data.interpreted) {
          setInterpretation(data.interpreted);

          const liveOffers: Product[] = Array.isArray(data.offers)
            ? data.offers.map((rawOffer: unknown, index: number) => {
                const offer =
                  rawOffer && typeof rawOffer === "object"
                    ? (rawOffer as Record<string, unknown>)
                    : {};

                return {
                  id:
                    typeof offer.id === "number" && Number.isFinite(offer.id)
                      ? offer.id
                      : index + 1,
                  name:
                    typeof offer.name === "string" && offer.name.trim()
                      ? offer.name
                      : "Oferta produktu",
                  store:
                    typeof offer.store === "string" && offer.store.trim()
                      ? offer.store
                      : "Sklep internetowy",
                  price:
                    typeof offer.price === "number" &&
                    Number.isFinite(offer.price) &&
                    offer.price > 0
                      ? offer.price
                      : null,
                  rating:
                    typeof offer.rating === "number" &&
                    Number.isFinite(offer.rating)
                      ? offer.rating
                      : null,
                  condition:
                    offer.condition === "Nowy" || offer.condition === "Używany"
                      ? offer.condition
                      : null,
                  original:
                    typeof offer.original === "boolean"
                      ? offer.original
                      : null,
                  delivery: parseDeliveryCost(
                    offer.delivery
                  ),
                  category:
                    typeof offer.category === "string" && offer.category.trim()
                      ? offer.category
                      : data.interpreted?.category || "",
                  platform:
                    typeof offer.platform === "string"
                      ? offer.platform
                      : data.interpreted?.platform || null,
                  brand:
                    typeof offer.brand === "string"
                      ? offer.brand
                      : data.interpreted?.brand || null,
                  url:
                    typeof offer.url === "string"
                      ? offer.url
                      : "",
                  imageUrl: firstNonEmptyString(
                    offer.imageUrl,
                    offer.image_url,
                    offer.image,
                    offer.thumbnailUrl,
                    offer.thumbnail,
                    offer.photoUrl,
                    offer.photo
                  ),
                  description:
                    typeof offer.description === "string"
                      ? offer.description
                      : "",

                  priceVerified:
                    offer.priceVerified === true,
                  availability:
                    offer.availability === "available"
                      ? "available"
                      : "unknown",
                  matchScore: readNumber(offer.matchScore),
                  originalityScore: readNumber(offer.originalityScore),
                  originalityConfidence:
                    offer.originalityConfidence === "high" ||
                    offer.originalityConfidence === "medium" ||
                    offer.originalityConfidence === "low"
                      ? offer.originalityConfidence
                      : "unknown",
                  riskScore: readNumber(offer.riskScore),
                  riskLevel:
                    offer.riskLevel === "low" ||
                    offer.riskLevel === "medium" ||
                    offer.riskLevel === "high"
                      ? offer.riskLevel
                      : null,
                  assessedCondition:
                    offer.assessedCondition === "new" ||
                    offer.assessedCondition === "used"
                      ? offer.assessedCondition
                      : "unknown",
                  conditionConfidence: readNumber(
                    offer.conditionConfidence
                  ),
                  priceScore: readNumber(offer.priceScore),
                  priceAttractiveness:
                    offer.priceAttractiveness === "excellent" ||
                    offer.priceAttractiveness === "good" ||
                    offer.priceAttractiveness === "fair" ||
                    offer.priceAttractiveness === "poor"
                      ? offer.priceAttractiveness
                      : null,
                  sourceConfidence: readNumber(
                    offer.sourceConfidence
                  ),
                  sellerConfidence: readNumber(
                    offer.sellerConfidence
                  ),
                  totalPrice: readNumber(offer.totalPrice),
                  dealScore: readNumber(offer.dealScore),
                  aiReason:
                    typeof offer.aiReason === "string"
                      ? offer.aiReason
                      : "",
                  bestOffer: offer.bestOffer === true,
                  cheapestOffer: offer.cheapestOffer === true,
                  safestOffer: offer.safestOffer === true,
                };
              })
            : [];

          const normalizedSearchError =
            data.error || null;

          writeSearchSessionCache(
            trimmedQuery,
            data.interpreted,
            liveOffers,
            normalizedSearchError
          );

          setProducts(liveOffers);
          setSearchError(normalizedSearchError);
        } else {
          setInterpretation(null);
          setProducts([]);
          setSearchError(data.error || "Nie udało się wyszukać ofert.");
        }
      } catch (error) {
        if (cancelled || searchId !== activeSearchIdRef.current) {
          return;
        }

        if (isSearchAbortError(error)) {
          setInterpretation(null);
          setProducts([]);
          setSearchError("Wyszukiwanie anulowane.");
          return;
        }

        console.error("Błąd analizy zapytania:", error);

        setInterpretation(null);
        setProducts([]);
        setSearchError(
          error instanceof Error
            ? error.message
            : "Nie udało się wyszukać ofert."
        );
      } finally {
        if (!cancelled && searchId === activeSearchIdRef.current) {
          setLoading(false);
        }
      }
    }

    analyzeQuery();

    return () => {
      cancelled = true;
    };
  }, [query]);

  const handleCancelSearch = () => {
    const trimmedQuery = query.trim();

    if (!trimmedQuery || !loading) {
      return;
    }

    /*
     * Unieważniamy bieżący searchId PRZED abort(),
     * dzięki czemu nawet spóźnione rozstrzygnięcie Promise
     * nie może już nadpisać UI po anulowaniu.
     */
    activeSearchIdRef.current += 1;
    cancelSearchRequest(trimmedQuery);

    setInterpretation(null);
    setProducts([]);
    setSearchError("Wyszukiwanie anulowane.");
    setLoading(false);
  };


  // ASARVO_RELEVANCE_SHIELD_V1
  const normalizeRelevanceText = (
    value: string | null | undefined
  ): string =>
    (value ?? "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

  // ASARVO_RELEVANCE_SHIELD_V2
  // Title-first classification: retailer descriptions often mention the word
  // "laptop" even for bags, hubs, docks and other accessories. Therefore an
  // accessory noun in the offer title wins over generic laptop wording found
  // only in description/SEO text.
  const isObviousLaptopAccessory = (
    product: Product,
    currentInterpretation: Interpretation | null
  ): boolean => {
    if (
      !currentInterpretation ||
      currentInterpretation.category?.toLowerCase() !== "laptop"
    ) {
      return false;
    }

    const title = normalizeRelevanceText(product.name);
    const fullText = normalizeRelevanceText(
      [product.name, product.description ?? ""].join(" ")
    );

    const titleAccessorySignals = [
      "plecak",
      "torba",
      "etui",
      "pokrowiec",
      "rekaw",
      "sleeve",
      "case do laptop",
      "hub usb",
      "usb hub",
      "hub type c",
      "hub type-c",
      "hub usb-c",
      "stacja dokuj",
      "docking station",
      "dock usb",
      "adapter usb",
      "adapter type c",
      "adapter type-c",
      "przejsciow",
      "zasilacz",
      "ladowarka",
      "charger",
      "power adapter",
      "podstawka pod laptop",
      "stand pod laptop",
      "cooling pad",
      "chlodzenie pod laptop",
      "mysz",
      "mouse",
      "klawiatur",
      "keyboard",
      "podkladka",
      "mousepad",
      "kabel",
      "cable",
      "mikrofon",
      "microphone",
      "sluchawki",
      "headset",
      "uchwyt do laptop",
      "ramie do laptop",
      "organizer",
    ];

    const explicitLaptopModelSignals = [
      "victus",
      "omen ",
      "legion",
      "loq ",
      "tuf gaming",
      "rog strix",
      "zephyrus",
      "rog scar",
      "nitro ",
      "predator",
      "katana",
      "raider",
      "cyborg",
      "pulse",
      "vector",
      "thinkpad",
      "ideapad",
      "vivobook",
      "zenbook",
      "latitude",
      "inspiron",
      "xps ",
      "elitebook",
      "probook",
      "matebook",
      "surface laptop",
      "macbook",
      "chromebook",
      "gigabyte gaming",
      "dell g15",
      "dell g16",
    ];

    const explicitDeviceTypeSignals = [
      "laptop ",
      "laptop,",
      "laptop-",
      "notebook",
      "ultrabook",
    ];

    const titleAccessoryWordPatterns = [
      /\bhub\b/i,
      /\bdock(?:ing)?\b/i,
      /\badapter\b/i,
      /\bplecak\b/i,
      /\btorba\b/i,
      /\betui\b/i,
      /\bpokrowiec\b/i,
      /\bsleeve\b/i,
      /\bzasilacz\b/i,
      /\bladowark\w*\b/i,
      /\bcharger\b/i,
      /\bpodstawka\b/i,
      /\bstand\b/i,
      /\bcooling\s+pad\b/i,
      /\bmysz\b/i,
      /\bmouse\b/i,
      /\bklawiatur\w*\b/i,
      /\bkeyboard\b/i,
      /\bmousepad\b/i,
      /\bkabel\b/i,
      /\bcable\b/i,
      /\bmikrofon\b/i,
      /\bmicrophone\b/i,
      /\bsluchawk\w*\b/i,
      /\bheadset\b/i,
      /\borganizer\b/i,
    ];

    const titleHasAccessory =
      titleAccessorySignals.some((signal) => title.includes(signal)) ||
      titleAccessoryWordPatterns.some((pattern) => pattern.test(title));

    const titleHasKnownLaptopModel = explicitLaptopModelSignals.some((signal) =>
      title.includes(signal)
    );

    const titleHasDeviceType = explicitDeviceTypeSignals.some((signal) =>
      title.includes(signal)
    );

    const hardwareSignals = [
      /\b(?:intel\s+)?core\s+(?:ultra\s+)?[i3579][-\s]?\d{3,5}[a-z]{0,3}\b/i,
      /\bryzen\s+[3579]\s*[- ]?\d{3,5}[a-z]{0,3}\b/i,
      /\brtx\s*\d{4}\b/i,
      /\bgtx\s*\d{4}\b/i,
      /\bradeon\s+rx\s*\d{3,4}\b/i,
    ];

    const hardwareSignalCount = hardwareSignals.reduce(
      (count, pattern) => count + (pattern.test(fullText) ? 1 : 0),
      0
    );

    // V5.3 HARD TITLE LOCK:
    // an accessory noun in the TITLE wins before any description/hardware rescue.
    // This prevents e.g. "HUB dla graczy..." from becoming a laptop recommendation
    // just because retailer SEO text mentions CPUs, GPUs or the word "laptop".
    if (titleHasAccessory && !titleHasKnownLaptopModel) {
      return true;
    }

    // Conservative secondary accessory check still runs before hardware rescue.
    const secondaryAccessorySignals = [
      "plecak",
      "torba",
      "hub ",
      "dock ",
      "adapter ",
      "zasilacz",
      "ladowarka",
      "etui",
      "pokrowiec",
      "podstawka",
      "cooling pad",
    ];

    if (
      secondaryAccessorySignals.some((signal) => title.includes(signal)) &&
      !titleHasKnownLaptopModel
    ) {
      return true;
    }

    // Offers that do not look like an accessory but clearly identify a laptop
    // remain visible.
    if (
      titleHasKnownLaptopModel ||
      titleHasDeviceType ||
      hardwareSignalCount >= 2
    ) {
      return false;
    }

    return false;
  };

  const suspiciousRelevanceProducts = useMemo(
    () =>
      products.filter((product) =>
        isObviousLaptopAccessory(
          product,
          interpretation
        )
      ),
    [products, interpretation]
  );

  const suspiciousRelevanceCount =
    suspiciousRelevanceProducts.length;

  const toggleSuspiciousMatches = () => {
    setCompareFamilyKeys([]);
    setShowSuspiciousMatches(
      (current) => !current
    );
  };

  // ASARVO_FILTERS_V1
  const activePriceLimit =
    priceFilter === "Do 100 zł"
      ? 100
      : priceFilter === "Do 200 zł"
        ? 200
        : priceFilter === "Do 500 zł"
          ? 500
          : priceFilter === "Do 1000 zł"
            ? 1000
            : priceFilter === "Do 2000 zł"
              ? 2000
              : priceFilter === "Do 4000 zł"
                ? 4000
                : null;

  const hasActiveFilters =
    conditionFilter !== "Wszystkie" ||
    priceFilter !== "Wszystkie" ||
    deliveryFilter !== "Wszystkie" ||
    storeFilter !== "Wszystkie" ||
    ratingFilter !== "Wszystkie";

  const clearResultFilters = () => {
    setConditionFilter("Wszystkie");
    setPriceFilter("Wszystkie");
    setDeliveryFilter("Wszystkie");
    setStoreFilter("Wszystkie");
    setRatingFilter("Wszystkie");
  };

  // FILTROWANIE PRODUKTÓW
  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      if (!interpretation) {
        return true;
      }

      // KATEGORIA
      if (
        interpretation.category &&
        product.category !== interpretation.category
      ) {
        return false;
      }

      // MARKA
      if (
        interpretation.brand &&
        product.brand !== interpretation.brand
      ) {
        return false;
      }

      // PLATFORMa
      if (
        interpretation.platform &&
        product.platform !== interpretation.platform
      ) {
        return false;
      }

      // ASARVO RELEVANCE SHIELD:
      // konserwatywnie odrzucamy tylko oczywiste akcesoria laptopowe.
      if (
        !showSuspiciousMatches &&
        isObviousLaptopAccessory(
          product,
          interpretation
        )
      ) {
        return false;
      }

      // STAN Z ZAPYTANIA
      if (
        interpretation.condition === "new" &&
        product.condition !== "Nowy"
      ) {
        return false;
      }

      if (
        interpretation.condition === "used" &&
        product.condition !== "Używany"
      ) {
        return false;
      }

      // ORYGINALNOŚĆ
      if (
        interpretation.original === true &&
        product.original !== true
      ) {
        return false;
      }

      // CENA Z ZAPYTANIA
      if (
        interpretation.maxPrice !== null &&
        product.price !== null &&
        product.price > interpretation.maxPrice
      ) {
        return false;
      }

      // FILTR STAN
      if (
        conditionFilter !== "Wszystkie" &&
        product.condition !== conditionFilter
      ) {
        return false;
      }

      // FILTR CENA
      // Przy aktywnym limicie pokazujemy wyłącznie oferty z potwierdzoną
      // ceną mieszczącą się w limicie.
      if (
        activePriceLimit !== null &&
        (product.price === null || product.price > activePriceLimit)
      ) {
        return false;
      }

      // DOSTAWA
      // Darmowa = potwierdzone 0. Płatna = potwierdzone > 0.
      // Nieznany koszt nie trafia do żadnej z tych dwóch kategorii.
      if (
        deliveryFilter === "Darmowa" &&
        product.delivery !== 0
      ) {
        return false;
      }

      if (
        deliveryFilter === "Płatna" &&
        (
          product.delivery === null ||
          product.delivery === undefined ||
          product.delivery <= 0
        )
      ) {
        return false;
      }

      // ASARVO_FILTERS_V1_FIX1
      if (
        deliveryFilter === "Niepotwierdzona" &&
        product.delivery !== null &&
        product.delivery !== undefined
      ) {
        return false;
      }

      // SKLEP
      if (
        storeFilter !== "Wszystkie" &&
        product.store !== storeFilter
      ) {
        return false;
      }

      // OCENA
      if (
        ratingFilter === "4+" &&
        (product.rating ?? 0) < 4
      ) {
        return false;
      }

      if (
        ratingFilter === "4.5+" &&
        (product.rating ?? 0) < 4.5
      ) {
        return false;
      }

      if (
        ratingFilter === "4.8+" &&
        (product.rating ?? 0) < 4.8
      ) {
        return false;
      }

      return true;
    });
  }, [
    interpretation,
    conditionFilter,
    priceFilter,
    deliveryFilter,
    storeFilter,
    ratingFilter,
    activePriceLimit,
    showSuspiciousMatches,
    products,
  ]);

  // DEDUPLIKACJA PRODUKTÓW I WARIANTÓW
  // Grupujemy konserwatywnie: tylko ten sam sklep + marka + kategoria +
  // platforma + stan + dokładna nazwa po usunięciu rozpoznanego koloru.
  // Pojemność, rozmiar, model i inne cechy pozostają w nazwie, więc
  // np. 128 GB nie zostanie połączone z 256 GB.
  const groupedProducts = useMemo(
    () => buildProductGroups(filteredProducts),
    [filteredProducts]
  );

  // NAJLEPSZA OFERTA — ranking pochodzi z backendu V21.4
  const bestProduct = useMemo(() => {
    if (filteredProducts.length === 0) {
      return null;
    }

    const backendBest = filteredProducts.find(
      (product) => product.bestOffer
    );

    if (backendBest) {
      return backendBest;
    }

    const rankedProducts = filteredProducts
      .filter((product) => product.price !== null)
      .sort((a, b) => {
        const scoreA = a.dealScore ?? -1;
        const scoreB = b.dealScore ?? -1;

        if (scoreB !== scoreA) {
          return scoreB - scoreA;
        }

        return (a.price ?? Infinity) - (b.price ?? Infinity);
      });

    return rankedProducts[0] ?? null;
  }, [filteredProducts]);

  const cheapestProduct = useMemo(() => {
    const pricedProducts = filteredProducts.filter(
      (product) => product.price !== null
    );

    if (pricedProducts.length === 0) {
      return null;
    }

    const withConfirmedTotal = pricedProducts
      .filter((product) => getPurchaseTotal(product) !== null)
      .sort(
        (a, b) =>
          (getPurchaseTotal(a) ?? Infinity) -
          (getPurchaseTotal(b) ?? Infinity)
      );

    if (withConfirmedTotal.length > 0) {
      return withConfirmedTotal[0];
    }

    return [...pricedProducts].sort(
      (a, b) => (a.price ?? Infinity) - (b.price ?? Infinity)
    )[0] ?? null;
  }, [filteredProducts]);

  const cheapestHasConfirmedTotal =
    cheapestProduct !== null && getPurchaseTotal(cheapestProduct) !== null;

  const safestProduct = useMemo(
    () =>
      filteredProducts.find(
        (product) => product.safestOffer
      ) ??
      [...filteredProducts]
        .filter((product) => typeof product.riskScore === "number")
        .sort(
          (a, b) =>
            (a.riskScore ?? Infinity) -
            (b.riskScore ?? Infinity)
        )[0] ??
      null,
    [filteredProducts]
  );

  // PRODUCT → VARIANTS → OFFERS
  // Najpierw zachowujemy bezpieczną deduplikację w obrębie sklepu,
  // a następnie łączymy ten sam produkt między różnymi źródłami.
  // Tożsamość produktu nadal zachowuje model, pojemność i istotne
  // oznaczenia typu Pro / Max / Ultra.
  const productFamilies = useMemo(
    () => buildProductFamilies(groupedProducts),
    [groupedProducts]
  );

  const compareFamilies = useMemo(
    () =>
      compareFamilyKeys
        .map((key) =>
          productFamilies.find((family) => family.key === key)
        )
        .filter(
          (family): family is ProductFamily =>
            family !== undefined
        ),
    [compareFamilyKeys, productFamilies]
  );

  const isFamilyCompared = (family: ProductFamily): boolean =>
    compareFamilyKeys.includes(family.key);

  const toggleCompareFamily = (family: ProductFamily) => {
    setCompareFamilyKeys((current) => {
      if (current.includes(family.key)) {
        return current.filter((key) => key !== family.key);
      }

      if (current.length >= 3) {
        return current;
      }

      return [...current, family.key];
    });
  };

  const clearCompareFamilies = () => {
    setCompareFamilyKeys([]);
  };

  const compareFamilyRating = (
    family: ProductFamily
  ): number | null => {
    const ratings = family.offers
      .map((offer) => offer.rating)
      .filter(
        (rating): rating is number =>
          typeof rating === "number" &&
          Number.isFinite(rating)
      );

    return ratings.length > 0
      ? Math.max(...ratings)
      : null;
  };

  // ASARVO_COMPARE_V2
  const compareFamilyRiskScore = (
    family: ProductFamily
  ): number | null => {
    const scores = family.offers
      .map((offer) => offer.riskScore)
      .filter(
        (score): score is number =>
          typeof score === "number" &&
          Number.isFinite(score)
      );

    return scores.length > 0
      ? Math.min(...scores)
      : null;
  };

  const compareFamilyDealScore = (
    family: ProductFamily
  ): number | null => {
    const score = family.representative.dealScore;

    return typeof score === "number" &&
      Number.isFinite(score)
      ? score
      : null;
  };

  const compareBestMetric = (
    values: Array<number | null>,
    direction: "min" | "max"
  ): number | null => {
    const known = values.filter(
      (value): value is number =>
        typeof value === "number" &&
        Number.isFinite(value)
    );

    if (known.length === 0) {
      return null;
    }

    return direction === "min"
      ? Math.min(...known)
      : Math.max(...known);
  };

  const compareMetricMatches = (
    value: number | null,
    best: number | null
  ): boolean =>
    compareFamilies.length > 1 &&
    value !== null &&
    best !== null &&
    Math.abs(value - best) < 0.0001;

  // ASARVO_COMPARE_V21_RELEVANCE_BRIDGE
  // Relevance Shield stays presentation-only. Suspicious products may still be
  // compared after "Pokaż mimo to", but they do not compete for metric leaders.
  const suspiciousCompareProductIds = useMemo(
    () =>
      new Set(
        suspiciousRelevanceProducts.map((product) => product.id)
      ),
    [suspiciousRelevanceProducts]
  );

  const compareFamilyEligibleForLeaders = (
    family: ProductFamily
  ): boolean =>
    !suspiciousCompareProductIds.has(
      family.representative.id
    );

  const compareHasRelevanceExcludedFamily =
    compareFamilies.some(
      (family) => !compareFamilyEligibleForLeaders(family)
    );

  const compareBestLowestPrice = compareBestMetric(
    compareFamilies.map((family) =>
      compareFamilyEligibleForLeaders(family)
        ? family.lowestPrice
        : null
    ),
    "min"
  );

  const compareBestConfirmedTotal = compareBestMetric(
    compareFamilies.map(
      (family) => family.lowestConfirmedTotal
    ),
    "min"
  );

  const compareBestRating = compareBestMetric(
    compareFamilies.map((family) =>
      compareFamilyEligibleForLeaders(family)
        ? compareFamilyRating(family)
        : null
    ),
    "max"
  );

  const compareBestDealScore = compareBestMetric(
    compareFamilies.map((family) =>
      compareFamilyEligibleForLeaders(family)
        ? compareFamilyDealScore(family)
        : null
    ),
    "max"
  );

  const compareBestRiskScore = compareBestMetric(
    compareFamilies.map((family) =>
      compareFamilyEligibleForLeaders(family)
        ? compareFamilyRiskScore(family)
        : null
    ),
    "min"
  );

  const compareValuesDiffer = (
    values: Array<string | number | null>
  ): boolean => {
    if (compareFamilies.length < 2) {
      return false;
    }

    const normalized = values.map((value) => {
      if (value === null) {
        return "__ASARVO_NULL__";
      }

      return typeof value === "number"
        ? value.toFixed(4)
        : value.trim().toLowerCase();
    });

    return new Set(normalized).size > 1;
  };

  const comparePriceDiff = compareValuesDiffer(
    compareFamilies.map((family) =>
      compareFamilyEligibleForLeaders(family)
        ? family.lowestPrice
        : null
    )
  );

  const compareConfirmedTotalDiff = compareValuesDiffer(
    compareFamilies.map(
      (family) => family.lowestConfirmedTotal
    )
  );

  const compareRatingDiff = compareValuesDiffer(
    compareFamilies.map((family) =>
      compareFamilyEligibleForLeaders(family)
        ? compareFamilyRating(family)
        : null
    )
  );

  const compareDealScoreDiff = compareValuesDiffer(
    compareFamilies.map((family) =>
      compareFamilyEligibleForLeaders(family)
        ? compareFamilyDealScore(family)
        : null
    )
  );

  const compareConditionDiff = compareValuesDiffer(
    compareFamilies.map((family) =>
      productConditionLabel(family.representative)
    )
  );

  const compareRiskDiff = compareValuesDiffer(
    compareFamilies.map((family) =>
      compareFamilyEligibleForLeaders(family)
        ? compareFamilyRiskScore(family)
        : null
    )
  );

  const compareStoreCountDiff = compareValuesDiffer(
    compareFamilies.map((family) => family.storeCount)
  );

  const compareOfferCountDiff = compareValuesDiffer(
    compareFamilies.map((family) => family.offers.length)
  );

  const compareAnyDifference =
    comparePriceDiff ||
    compareConfirmedTotalDiff ||
    compareRatingDiff ||
    compareDealScoreDiff ||
    compareConditionDiff ||
    compareRiskDiff ||
    compareStoreCountDiff ||
    compareOfferCountDiff;

  // ASARVO_COMPARE_V4
  const compareLeaderFamilies = (
    valueForFamily: (
      family: ProductFamily
    ) => number | null,
    bestValue: number | null
  ): ProductFamily[] => {
    if (
      compareFamilies.length < 2 ||
      bestValue === null
    ) {
      return [];
    }

    return compareFamilies.filter((family) =>
        compareFamilyEligibleForLeaders(family) &&
        compareMetricMatches(
        valueForFamily(family),
        bestValue
      )
    );
  };

  const compareLeaderNames = (
    families: ProductFamily[]
  ): string =>
    families
      .map((family) => family.displayName)
      .join(" • ");

  // ASARVO_COMPARE_V24_SPEC_DIFFERENCE_FOCUS
  const compareExtractSpec = (
    name: string,
    kind:
      | "CPU"
      | "GPU"
      | "RAM"
      | "SSD"
      | "Ekran"
      | "Odświeżanie"
      | "System"
  ): string | null => {
    const text = name
      .replace(/[®™]/g, "")
      .replace(/\s+/g, " ")
      .trim();

    if (kind === "GPU") {
      const match = text.match(
        /\b(?:RTX\s*\d{4}|GTX\s*\d{3,4}|RX\s*\d{4}[A-Z]{0,3})\b/i
      );
      return match
        ? match[0]
            .replace(/\s+/g, "")
            .replace(/^(RTX|GTX|RX)(\d)/i, "$1 $2")
            .toUpperCase()
        : null;
    }

    if (kind === "CPU") {
      // ASARVO_COMPARE_V251_SPEC_PARSER_COVERAGE
      const patterns = [
        /\bIntel\s+Core\s+Ultra\s+\d(?:\s+\d{3}[A-Z]{0,2})?\b/i,
        /\bIntel\s+Core\s+[3579]\s+\d{3}[A-Z]{0,3}\b/i,
        /\bCore\s+i[3579]-?\d{4,5}[A-Z]{0,3}\b/i,
        /\bRyzen\s+AI\s+\d(?:\s+\d{3}[A-Z]{0,3})?\b/i,
        /\bRyzen\s+[3579]-?\d{4}[A-Z]{0,3}\b/i,
        /\bRyzen\s+[3579]\s+\d{3,4}[A-Z]{0,3}\b/i,
        /\bR[3579]-?\d{4}[A-Z]{0,3}\b/i,
      ];

      for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) {
          const raw = match[0].replace(/\s+/g, " ");
          const shorthand = raw.match(
            /^R([3579])-?(\d{4}[A-Z]{0,3})$/i
          );

          return shorthand
            ? `Ryzen ${shorthand[1]} ${shorthand[2].toUpperCase()}`
            : raw;
        }
      }

      return null;
    }

    if (kind === "RAM") {
      const matches = [
        ...text.matchAll(/\b(\d{1,3})\s*GB(?:\s*RAM)?\b/gi),
      ];

      const candidate = matches.find((match) => {
        const value = Number(match[1]);
        return value >= 4 && value <= 128;
      });

      return candidate ? `${candidate[1]} GB` : null;
    }

    if (kind === "SSD") {
      const tb = text.match(
        /\b(\d+(?:[.,]\d+)?)\s*TB(?:\s*(?:SSD|NVME))?\b/i
      );
      if (tb) {
        return `${tb[1].replace(",", ".")} TB`;
      }

      const matches = [
        ...text.matchAll(
          /\b(\d{3,4})\s*GB(?:\s*(?:SSD|NVME))?\b/gi
        ),
      ];

      const candidate = matches.find(
        (match) => Number(match[1]) >= 128
      );

      if (candidate) {
        return `${candidate[1]} GB`;
      }

      const compact = text.match(
        /(?:^|[\/\-])(128|256|512|1000|1024|2000|2048)(?=[\/\-]|\b)/i
      );

      if (compact) {
        const amount = Number(compact[1]);

        if (amount === 1000 || amount === 1024) {
          return "1 TB";
        }

        if (amount === 2000 || amount === 2048) {
          return "2 TB";
        }

        return `${amount} GB`;
      }

      return null;
    }

    if (kind === "Odświeżanie") {
      const match = text.match(/\b(\d{2,3})\s*HZ\b/i);
      return match ? `${match[1]} Hz` : null;
    }

    if (kind === "System") {
      const match = text.match(
        /\b(?:Windows\s*11(?:\s*(?:Home|Pro))?|Win11|Windows\s*10(?:\s*(?:Home|Pro))?|Win10)\b/i
      );

      if (!match) return null;

      return match[0]
        .replace(/^Win11$/i, "Windows 11")
        .replace(/^Win10$/i, "Windows 10");
    }

    if (kind === "Ekran") {
      const matches = [
        text.match(/\bWQXGA\b/i),
        text.match(/\bWUXGA\b/i),
        text.match(/\bQHD\+?\b/i),
        text.match(/\bFHD\+?\b/i),
        text.match(/\b(?:OLED|IPS|MINI\s*LED)\b/i),
        text.match(/\b\d{3,4}\s*[x×]\s*\d{3,4}\b/i),
      ].filter(Boolean);

      if (matches.length === 0) return null;

      return [...new Set(
        matches.map((match) =>
          match![0]
            .replace(/\s+/g, " ")
            .toUpperCase()
        )
      )].join(" / ");
    }

    return null;
  };

  const compareSpecRows = useMemo(() => {
    const labels = [
      "CPU",
      "GPU",
      "RAM",
      "SSD",
      "Ekran",
      "Odświeżanie",
      "System",
    ] as const;

    return labels.map((label) => {
      const values = compareFamilies.map((family) =>
        compareExtractSpec(
          family.representative.name,
          label
        )
      );

      // ASARVO_COMPARE_V241_SPEC_NORMALIZATION
      const presentValues = values.filter(
        (value): value is string => value !== null
      );

      const normalizedPresent = presentValues.map((value) =>
        value
          .toLowerCase()
          .replace(/\s+/g, " ")
          .replace(/rtx\s*(\d{4})/g, "rtx $1")
          .replace(/gtx\s*(\d{3,4})/g, "gtx $1")
          .replace(/rx\s*(\d{4}[a-z]{0,3})/g, "rx $1")
          .replace(/^win11$/g, "windows 11")
          .replace(/^win10$/g, "windows 10")
          .trim()
      );

      const knownDistinctCount =
        new Set(normalizedPresent).size;

      const incomplete =
        presentValues.length !== values.length;

      const differs =
        knownDistinctCount > 1;

      // ASARVO_COMPARE_V25_SPEC_ADVANTAGE_CLARITY
      const numericValues = values.map((value) => {
        if (value === null) return null;

        if (label === "RAM") {
          const match = value.match(/(\d+(?:[.,]\d+)?)\s*GB/i);
          return match ? Number(match[1].replace(",", ".")) : null;
        }

        if (label === "SSD") {
          const tb = value.match(/(\d+(?:[.,]\d+)?)\s*TB/i);
          if (tb) {
            return Number(tb[1].replace(",", ".")) * 1024;
          }

          const gb = value.match(/(\d+(?:[.,]\d+)?)\s*GB/i);
          return gb ? Number(gb[1].replace(",", ".")) : null;
        }

        if (label === "Odświeżanie") {
          const hz = value.match(/(\d+(?:[.,]\d+)?)\s*Hz/i);
          return hz ? Number(hz[1].replace(",", ".")) : null;
        }

        return null;
      });

      const finiteNumericValues = numericValues.filter(
        (value): value is number =>
          typeof value === "number" && Number.isFinite(value)
      );

      const bestNumeric =
        finiteNumericValues.length > 0
          ? Math.max(...finiteNumericValues)
          : null;

      return {
        label,
        values,
        differs,
        incomplete,
        numericValues,
        bestNumeric,
      };
    });
  }, [compareFamilies]);

  const visibleCompareSpecRows =
    compareDifferencesOnly
      ? compareSpecRows.filter((row) => row.differs)
      : compareSpecRows;

  // ASARVO_COMPARE_V26_KEY_DIFFERENCES_SUMMARY
  const compareKeyDifferences = useMemo(() => {
    return compareSpecRows
      .filter((row) => row.differs)
      .map((row) => {
        const distinctKnownValues = [
          ...new Set(
            row.values
              .filter((value): value is string => value !== null)
              .map((value) => value.trim())
          ),
        ];

        if (distinctKnownValues.length === 0) {
          return null;
        }

        return {
          label: row.label,
          values: distinctKnownValues,
          incomplete: row.incomplete,
        };
      })
      .filter(
        (
          item
        ): item is {
          label: (typeof compareSpecRows)[number]["label"];
          values: string[];
          incomplete: boolean;
        } => item !== null
      );
  }, [compareSpecRows]);

  // ASARVO_COMPARE_V27_SPEC_COMPLETENESS_CONFIDENCE
  const compareSpecCompleteness = useMemo(() => {
    return compareFamilies.map((family, familyIndex) => {
      const knownLabels = compareSpecRows
        .filter((row) => row.values[familyIndex] !== null)
        .map((row) => row.label);

      const missingLabels = compareSpecRows
        .filter((row) => row.values[familyIndex] === null)
        .map((row) => row.label);

      const known = knownLabels.length;
      const total = compareSpecRows.length;
      const ratio = total > 0 ? known / total : 0;

      return {
        key: family.key,
        known,
        total,
        ratio,
        missingLabels,
      };
    });
  }, [compareFamilies, compareSpecRows]);

  const compareSpecCompletenessByKey = useMemo(
    () =>
      new Map(
        compareSpecCompleteness.map((entry) => [
          entry.key,
          entry,
        ])
      ),
    [compareSpecCompleteness]
  );

  // ASARVO_COMPARE_V22_DECISION_CLARITY
  const compareMetricGap = (
    values: Array<number | null>,
    mode: "min" | "max"
  ): number | null => {
    const finite = values.filter(
      (value): value is number =>
        typeof value === "number" && Number.isFinite(value)
    );

    if (finite.length < 2) {
      return null;
    }

    const sorted = [...finite].sort(
      mode === "min"
        ? (a, b) => a - b
        : (a, b) => b - a
    );

    return Math.abs(sorted[0] - sorted[1]) < 0.0001
      ? 0
      : Math.abs(sorted[0] - sorted[1]);
  };

  const compareDecisionEligibleFamilies =
    compareFamilies.filter(compareFamilyEligibleForLeaders);

  const compareDecisionPriceGap = compareMetricGap(
    compareDecisionEligibleFamilies.map(
      (family) => family.lowestPrice
    ),
    "min"
  );

  const compareDecisionDealScoreGap = compareMetricGap(
    compareDecisionEligibleFamilies.map(
      compareFamilyDealScore
    ),
    "max"
  );

  const compareDecisionRiskGap = compareMetricGap(
    compareDecisionEligibleFamilies.map(
      compareFamilyRiskScore
    ),
    "min"
  );

  const comparePriceLeaders =
    compareLeaderFamilies(
      (family) => family.lowestPrice,
      compareBestLowestPrice
    );

  const compareConfirmedTotalLeaders =
    compareLeaderFamilies(
      (family) => family.lowestConfirmedTotal,
      compareBestConfirmedTotal
    );

  const compareRatingLeaders =
    compareLeaderFamilies(
      compareFamilyRating,
      compareBestRating
    );

  const compareDealScoreLeaders =
    compareLeaderFamilies(
      compareFamilyDealScore,
      compareBestDealScore
    );

  const compareRiskLeaders =
    compareLeaderFamilies(
      compareFamilyRiskScore,
      compareBestRiskScore
    );

  // ASARVO_COMPARE_V5
  const copyComparisonSummary = async () => {
    if (
      typeof window === "undefined" ||
      compareFamilies.length < 2
    ) {
      return;
    }

    const lines: string[] = [
      `ASARVO — Porównanie produktów (${compareFamilies.length}/3)`,
      query.trim()
        ? `Zapytanie: ${query.trim()}`
        : "Zapytanie: —",
      "",
    ];

    compareFamilies.forEach((family, index) => {
      const representative = family.representative;
      const rating = compareFamilyRating(family);
      const dealScore =
        compareFamilyDealScore(family);

      lines.push(
        `${index + 1}. ${family.displayName}`,
        `   Najniższa cena: ${formatPrice(family.lowestPrice)}`,
        `   Najlepszy znany koszt: ${
          family.lowestConfirmedTotal !== null
            ? formatPrice(family.lowestConfirmedTotal)
            : "Niepotwierdzony"
        }`,
        `   Ocena: ${
          rating !== null
            ? rating.toFixed(1)
            : "Brak"
        }`,
        `   ASARVO Score: ${
          dealScore !== null
            ? `${dealScore}/100`
            : "Brak"
        }`,
        `   Ryzyko: ${riskLabel(representative.riskLevel)}`,
        `   Stan: ${productConditionLabel(representative)}`,
        `   Sklepy / źródła: ${family.storeCount}`,
        `   Oferty: ${family.offers.length}`,
        ""
      );
    });

    lines.push(
      "Liderzy metryk:",
      comparePriceLeaders.length > 0
        ? `• Najniższa cena: ${compareLeaderNames(comparePriceLeaders)}`
        : "• Najniższa cena: brak danych",
      compareConfirmedTotalLeaders.length > 0
        ? `• Najniższy znany koszt: ${compareLeaderNames(compareConfirmedTotalLeaders)}`
        : "• Najniższy znany koszt: brak danych",
      compareRatingLeaders.length > 0
        ? `• Najwyższa ocena: ${compareLeaderNames(compareRatingLeaders)}`
        : "• Najwyższa ocena: brak danych",
      compareDealScoreLeaders.length > 0
        ? `• Najwyższy ASARVO Score: ${compareLeaderNames(compareDealScoreLeaders)}`
        : "• Najwyższy ASARVO Score: brak danych",
      compareRiskLeaders.length > 0
        ? `• Najniższe ryzyko: ${compareLeaderNames(compareRiskLeaders)}`
        : "• Najniższe ryzyko: brak danych",
      "",
      compareHasRelevanceExcludedFamily
        ? "Uwaga: podejrzane dopasowania z Relevance Shield są widoczne w porównaniu, ale wyłączone z liderów metryk."
        : "",
      "ASARVO nie wybiera jednego zwycięzcy całości — pokazuje liderów konkretnych metryk."
    );

    const text = lines.join("\n");

    setLibraryActionMessage(null);

    try {
      if (
        typeof navigator !== "undefined" &&
        navigator.clipboard?.writeText
      ) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea =
          document.createElement("textarea");
        textarea.value = text;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();

        const copied =
          document.execCommand("copy");
        document.body.removeChild(textarea);

        if (!copied) {
          throw new Error(
            "Nie udało się skopiować porównania."
          );
        }
      }

      setLibraryActionMessage(
        "Porównanie produktów skopiowano do schowka."
      );
    } catch (error) {
      console.error(
        "[ASARVO COMPARE COPY]",
        error
      );
      setLibraryActionMessage(
        "Nie udało się skopiować porównania."
      );
    }
  };

  const bestProductFamily = useMemo(
    () =>
      productFamilies.find((family) =>
        familyHasProduct(family, bestProduct)
      ) ?? null,
    [productFamilies, bestProduct]
  );

  const cheapestProductFamily = useMemo(
    () =>
      productFamilies.find((family) =>
        familyHasProduct(family, cheapestProduct)
      ) ?? null,
    [productFamilies, cheapestProduct]
  );

  const safestProductFamily = useMemo(
    () =>
      productFamilies.find((family) =>
        familyHasProduct(family, safestProduct)
      ) ?? null,
    [productFamilies, safestProduct]
  );


  const shortlistEntries = useMemo<ShortlistEntry[]>(() => {
    const candidates: Array<{
      role: ShortlistRole;
      product: Product | null;
      family: ProductFamily | null;
    }> = [
      { role: "best", product: bestProduct, family: bestProductFamily },
      { role: "cheapest", product: cheapestProduct, family: cheapestProductFamily },
      { role: "safest", product: safestProduct, family: safestProductFamily },
    ];

    const merged = new Map<string, ShortlistEntry>();

    for (const candidate of candidates) {
      if (!candidate.product) continue;

      const key =
        candidate.family?.key ??
        `${normalizeGroupingText(candidate.product.store)}::${candidate.product.id}`;

      const existing =
        merged.get(key) ??
        Array.from(merged.values()).find((entry) =>
          shortlistSameProductModel(
            entry.product,
            entry.family,
            candidate.product!,
            candidate.family
          )
        );

      if (existing) {
        if (!existing.roles.includes(candidate.role)) {
          existing.roles.push(candidate.role);
        }
        continue;
      }

      merged.set(key, {
        key,
        product: candidate.product,
        family: candidate.family,
        roles: [candidate.role],
      });
    }

    return Array.from(merged.values());
  }, [
    bestProduct,
    bestProductFamily,
    cheapestProduct,
    cheapestProductFamily,
    safestProduct,
    safestProductFamily,
  ]);

  const otherProductFamilies = useMemo(() => {
    const families = productFamilies.filter(
      (family) =>
        !familyHasProduct(family, bestProduct)
    );

    if (sortMode === "Cena: rosnąco") {
      return [...families].sort((a, b) => {
        const costA =
          a.lowestConfirmedTotal ?? a.lowestPrice ?? Infinity;
        const costB =
          b.lowestConfirmedTotal ?? b.lowestPrice ?? Infinity;

        return costA - costB;
      });
    }

    if (sortMode === "Cena: malejąco") {
      return [...families].sort((a, b) => {
        const costA =
          a.lowestConfirmedTotal ?? a.lowestPrice;
        const costB =
          b.lowestConfirmedTotal ?? b.lowestPrice;

        if (costA === null && costB === null) {
          return 0;
        }
        if (costA === null) {
          return 1;
        }
        if (costB === null) {
          return -1;
        }

        return costB - costA;
      });
    }

    if (sortMode === "Ocena: najwyższa") {
      const familyRating = (family: ProductFamily): number => {
        const ratings = family.offers
          .map((offer) => offer.rating)
          .filter(
            (rating): rating is number =>
              typeof rating === "number" &&
              Number.isFinite(rating)
          );

        return ratings.length > 0
          ? Math.max(...ratings)
          : -Infinity;
      };

      return [...families].sort(
        (a, b) => familyRating(b) - familyRating(a)
      );
    }

    if (sortMode === "Sklep: A-Z") {
      const familyStoreLabel = (
        family: ProductFamily
      ): string =>
        family.storeOffers
          .map((entry) => entry.store)
          .filter(Boolean)
          .sort((a, b) =>
            a.localeCompare(b, "pl", {
              sensitivity: "base",
            })
          )
          .join(" | ");

      return [...families].sort((a, b) =>
        familyStoreLabel(a).localeCompare(
          familyStoreLabel(b),
          "pl",
          {
            sensitivity: "base",
          }
        )
      );
    }

    // Domyślne sortowanie pozostaje identyczne z dotychczasowym ASARVO.
    return sortProductFamilies(families);
  }, [productFamilies, bestProduct, sortMode]);

  const totalStoreCount = useMemo(
    () =>
      new Set(
        filteredProducts.map((product) =>
          normalizeGroupingText(product.store)
        )
      ).size,
    [filteredProducts]
  );

  // KODY RABATOWE
  /*
   * Tavily nie jest już używany automatycznie.
   * Stary /api/coupons kończył się błędem limitu 432 i powodował
   * niepotrzebne requesty po każdym wyszukiwaniu.
   *
   * Do momentu podłączenia darmowego źródła kuponów wyłączamy ten etap.
   * Dzięki temu wyszukiwanie produktów działa niezależnie i bez płatnego API.
   */
  useEffect(() => {
    setCouponLoading(false);
    setBestDiscount(null);
  }, [bestProduct]);

  // CENA PO RABACIE
  const discountedPrice = useMemo(() => {
    if (
      !bestProduct ||
      !bestDiscount ||
      bestDiscount.discountPercent === null ||
      bestProduct.price === null
    ) {
      return null;
    }

    const discount =
      bestProduct.price *
      (bestDiscount.discountPercent / 100);

    return bestProduct.price - discount;
  }, [bestProduct, bestDiscount]);

  /*
   * KOPIOWANIE KODU
   */
  const handleCopyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);

      setCopiedCode(code);

      setTimeout(() => {
        setCopiedCode(null);
      }, 2000);
    } catch (error) {
      console.error("Nie udało się skopiować kodu:", error);
    }
  };
  if (loading) {
    return (
      <div className="min-h-[100dvh] bg-[#02060c] text-white">
        <AsarvoSearchLoader query={query} />

        <div className="fixed inset-x-0 bottom-6 z-[100] flex justify-center px-4 sm:bottom-8">
          <button
            type="button"
            onClick={handleCancelSearch}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-red-400/25 bg-[#0b0b0d]/95 px-4 py-2.5 text-xs font-semibold text-red-200 sm:min-h-12 sm:px-5 sm:py-3 sm:text-sm shadow-[0_12px_50px_rgba(0,0,0,0.45)] backdrop-blur transition hover:border-red-300/45 hover:bg-red-500/[0.10] hover:text-red-100 focus:outline-none focus:ring-2 focus:ring-red-400/40"
            aria-label="Anuluj wyszukiwanie"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
              className="h-4 w-4"
            >
              <path
                d="M6 6l12 12M18 6 6 18"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
            Anuluj wyszukiwanie
          </button>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-[#03060a] text-white">

      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_50%_-12%,rgba(37,99,235,0.30),transparent_35%),radial-gradient(circle_at_18%_35%,rgba(14,165,233,0.08),transparent_27%),radial-gradient(circle_at_82%_58%,rgba(16,185,129,0.05),transparent_24%)]" />
      <div className="pointer-events-none fixed inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-blue-400/35 to-transparent" />

      <div className="relative mx-auto min-h-screen max-w-[1480px] px-4 sm:px-8 lg:px-10">

        {/* HEADER */}
        <header className="flex items-center justify-between border-b border-blue-400/[0.08] py-4 sm:py-5">

          <a
            href="/"
            aria-label="ASARVO — strona główna"
            className="group inline-flex items-center gap-3"
          >
            <img
              src="/asarvo-mark.png"
              alt=""
              className="h-8 w-8 object-contain transition group-hover:scale-105 sm:h-9 sm:w-9"
            />
            <div>
              <div className="text-lg font-semibold tracking-[0.14em] text-white">
                ASARVO
              </div>
              <div className="mt-0.5 hidden text-[9px] uppercase tracking-[0.18em] text-gray-600 sm:block">
                Znajdź · Porównaj · Kup lepiej
              </div>
            </div>
          </a>

          <a
            href={isAuthenticated ? "/account" : "/login"}
            className="rounded-full border border-white/10 bg-white/[0.03] px-3.5 py-2 text-xs text-gray-300 transition hover:bg-white/[0.07] hover:text-white sm:px-5 sm:text-sm"
          >
            {!authReady
              ? "Konto"
              : isAuthenticated
                ? "Moje konto"
                : "Zaloguj się"}
          </a>

        </header>

        {/* WYSZUKIWARKA */}
        <div className="mt-6 sm:mt-7">

          <form
            action="/search"
            className="rounded-2xl border border-blue-400/[0.14] bg-[#07101d]/80 p-1.5 shadow-[0_18px_70px_rgba(16,61,153,0.12)] backdrop-blur-xl transition focus-within:border-blue-400/35 focus-within:shadow-[0_20px_90px_rgba(37,99,235,0.20)] sm:p-2"
          >
            <div className="flex items-center gap-2">
              <input
                name="q"
                value={searchInput}
                onChange={(event) => {
                  setSearchInput(event.target.value);
                  if (imageMessage) setImageMessage(null);
                }}
                placeholder="Czego szukasz?"
                className="min-h-12 min-w-0 flex-1 bg-transparent px-3 text-sm text-white outline-none placeholder:text-gray-600 sm:min-h-14 sm:px-4 sm:text-base"
              />

              <input
                ref={imageInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];

                  if (file) {
                    void handleImageSearch(file);
                  }
                }}
              />

              <button
                type="button"
                onClick={() => imageInputRef.current?.click()}
                disabled={imageAnalyzing}
                aria-label="Wyszukaj produktem ze zdjęcia"
                title="Dodaj zdjęcie produktu"
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition sm:h-12 sm:w-12 ${
                  imageAnalyzing
                    ? "cursor-wait border-violet-300/45 bg-violet-400/[0.12] text-violet-200"
                    : "border-white/10 bg-white/[0.03] text-gray-400 hover:border-violet-400/25 hover:bg-violet-500/[0.07] hover:text-violet-300"
                }`}
              >
                {imageAnalyzing ? (
                  <span className="h-5 w-5 animate-spin rounded-full border-2 border-violet-200/30 border-t-violet-200" />
                ) : (
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden="true"
                    className="h-5 w-5"
                  >
                    <path
                      d="M4 7.5h3l1.2-2h7.6l1.2 2h3a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9.5a2 2 0 0 1 2-2Z"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinejoin="round"
                    />
                    <circle
                      cx="12"
                      cy="13.5"
                      r="3.2"
                      stroke="currentColor"
                      strokeWidth="1.8"
                    />
                  </svg>
                )}
              </button>

              <button
                type="submit"
                disabled={!searchInput.trim()}
                className="min-h-11 shrink-0 rounded-xl bg-blue-600 px-4 text-sm font-semibold transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40 sm:min-h-12 sm:px-9 sm:text-base"
              >
                Szukaj
              </button>
            </div>

            {imageMessage && (
              <div
                className={`px-4 pb-2 pt-1 text-xs ${
                  imageAnalyzing ? "text-violet-300" : "text-gray-500"
                }`}
                aria-live="polite"
              >
                {imageAnalyzing ? "📷 " : ""}
                {imageMessage}
              </div>
            )}
          </form>

        </div>

        {/* WYNIKI */}
        <section className="pb-16 pt-6 sm:pb-20 sm:pt-8">

          <p className="text-xs text-gray-500 sm:text-sm">
            Wyniki wyszukiwania dla:
          </p>

          <h1 className="mt-2 text-2xl font-bold leading-tight sm:text-4xl">
            „{query}”
          </h1>

          {/* FILTRY */}
          <div className="-mx-1 mt-7 flex gap-2 overflow-x-auto px-1 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:flex-wrap sm:gap-3 sm:overflow-visible sm:px-0 sm:pb-0">

            <select
              value={conditionFilter}
              onChange={(e) =>
                setConditionFilter(e.target.value)
              }
              className="shrink-0 cursor-pointer appearance-none rounded-full border border-white/10 bg-[#0c0c0c] px-4 py-2.5 pr-8 text-sm text-gray-300 outline-none transition hover:border-blue-400/20 sm:px-5 sm:py-3"
            >
              <option value="Wszystkie">Stan: wszystkie</option>
              <option>Nowy</option>
              <option>Używany</option>
            </select>

            <select
              value={priceFilter}
              onChange={(e) =>
                setPriceFilter(e.target.value)
              }
              className="shrink-0 cursor-pointer appearance-none rounded-full border border-white/10 bg-[#0c0c0c] px-4 py-2.5 pr-8 text-sm text-gray-300 outline-none transition hover:border-blue-400/20 sm:px-5 sm:py-3"
            >
              <option value="Wszystkie">Cena: wszystkie</option>
              <option>Do 100 zł</option>
              <option>Do 200 zł</option>
              <option>Do 500 zł</option>
              <option>Do 1000 zł</option>
              <option>Do 2000 zł</option>
              <option>Do 4000 zł</option>
            </select>

            <select
              value={deliveryFilter}
              onChange={(e) =>
                setDeliveryFilter(e.target.value)
              }
              className="shrink-0 cursor-pointer appearance-none rounded-full border border-white/10 bg-[#0c0c0c] px-4 py-2.5 pr-8 text-sm text-gray-300 outline-none transition hover:border-blue-400/20 sm:px-5 sm:py-3"
            >
              <option value="Wszystkie">Dostawa: wszystkie</option>
              <option>Darmowa</option>
              <option>Płatna</option>
              <option>Niepotwierdzona</option>
            </select>

            <select
              value={storeFilter}
              onChange={(e) =>
                setStoreFilter(e.target.value)
              }
              className="shrink-0 cursor-pointer appearance-none rounded-full border border-white/10 bg-[#0c0c0c] px-4 py-2.5 pr-8 text-sm text-gray-300 outline-none transition hover:border-blue-400/20 sm:px-5 sm:py-3"
            >
              <option value="Wszystkie">Sklep: wszystkie</option>
              {Array.from(new Set(products.map((product) => product.store)))
                .filter(Boolean)
                .map((store) => (
                  <option key={store}>{store}</option>
                ))}
            </select>

            <select
              value={ratingFilter}
              onChange={(e) =>
                setRatingFilter(e.target.value)
              }
              className="shrink-0 cursor-pointer appearance-none rounded-full border border-white/10 bg-[#0c0c0c] px-4 py-2.5 pr-8 text-sm text-gray-300 outline-none transition hover:border-blue-400/20 sm:px-5 sm:py-3"
            >
              <option value="Wszystkie">Ocena: wszystkie</option>
              <option>4+</option>
              <option>4.5+</option>
              <option>4.8+</option>
            </select>

            <select
              value={sortMode}
              onChange={(e) =>
                setSortMode(e.target.value)
              }
              aria-label="Sortowanie wyników"
              className="shrink-0 cursor-pointer appearance-none rounded-full border border-white/10 bg-[#0c0c0c] px-4 py-2.5 pr-8 text-sm text-gray-300 outline-none transition hover:border-blue-400/20 sm:px-5 sm:py-3"
            >
              <option>ASARVO</option>
              <option>Cena: rosnąco</option>
              <option>Cena: malejąco</option>
              <option>Ocena: najwyższa</option>
              <option>Sklep: A-Z</option>
            </select>

            {/* ASARVO_SHARE_SEARCH_V1_FIX3 */}
            <button
              type="button"
              onPointerDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
              onMouseDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                void shareCurrentSearch();
              }}
              className="shrink-0 rounded-full border border-blue-500/20 bg-blue-500/[0.06] px-4 py-2.5 text-sm font-medium text-blue-200 transition hover:border-blue-400/35 hover:bg-blue-500/[0.10] hover:text-white sm:px-5 sm:py-3"
            >
              🔗 Kopiuj link wyszukiwania
            </button>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearResultFilters}
                className="shrink-0 rounded-full border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm text-gray-400 transition hover:border-blue-500/30 hover:bg-blue-500/[0.06] hover:text-white sm:px-5 sm:py-3"
              >
                Wyczyść filtry
              </button>
            )}

          </div>

          {/* INFORMACJA AI */}
          {interpretation && (
            <div className="mt-5 rounded-2xl border border-blue-500/10 bg-blue-500/[0.03] px-5 py-4 text-sm text-gray-400">

              <span className="text-blue-400">
                ASARVO rozpoznało:
              </span>{" "}

              {interpretation.category && (
                <span className="ml-2">
                  kategorię{" "}
                  <b className="text-gray-300">
                    {categoryLabel(interpretation.category)}
                  </b>
                </span>
              )}

              {interpretation.platform && (
                <span className="ml-2">
                  • platformę{" "}
                  <b className="text-gray-300">
                    {interpretation.platform}
                  </b>
                </span>
              )}

              {interpretation.brand && (
                <span className="ml-2">
                  • markę{" "}
                  <b className="text-gray-300">
                    {interpretation.brand}
                  </b>
                </span>
              )}

              {/* ASARVO_INTENT_CORE_V1_REQUIREMENTS_UI */}
              {interpretation.requirements?.map((requirement) => (
                <span
                  key={`requirement-${requirement.key}-${requirement.value}`}
                  className="ml-2"
                >
                  • {requirement.label}{" "}
                  <b className="text-gray-300">
                    {requirement.value}
                  </b>
                </span>
              ))}

              {interpretation.condition && (
                <span className="ml-2">
                  • stan{" "}
                  <b className="text-gray-300">
                    {interpretation.condition === "new"
                      ? "nowy"
                      : "używany"}
                  </b>
                </span>
              )}

              {interpretation.original === true && (
                <span className="ml-2">
                  •{" "}
                  <b className="text-gray-300">
                    oryginalny
                  </b>
                </span>
              )}

              {interpretation.maxPrice !== null && (
                <span className="ml-2">
                  • maks.{" "}
                  <b className="text-gray-300">
                    {interpretation.maxPrice} zł
                  </b>
                </span>
              )}

            </div>
          )}

          {searchError && (
            <div className="mt-5 rounded-2xl border border-amber-500/20 bg-amber-500/[0.04] px-5 py-4 text-sm text-amber-300">
              {searchError}
            </div>
          )}

          {libraryActionMessage && (
            <div className="mt-5 rounded-2xl border border-blue-500/20 bg-blue-500/[0.04] px-5 py-4 text-sm text-blue-200">
              {libraryActionMessage}
            </div>
          )}

          {suspiciousRelevanceCount > 0 && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-400/15 bg-amber-400/[0.035] px-4 py-2.5 text-xs">
              <div className="flex min-w-0 items-center gap-2 text-gray-400">
                <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border border-amber-400/15 bg-amber-400/[0.06] text-[11px] text-amber-300">
                  🛡
                </span>
                <span className="truncate">
                  {showSuspiciousMatches
                    ? `Relevance Shield: pokazujesz również ${countLabel(
                        suspiciousRelevanceCount,
                        "podejrzane dopasowanie",
                        "podejrzane dopasowania",
                        "podejrzanych dopasowań"
                      )}.`
                    : `Relevance Shield ukrył ${countLabel(
                        suspiciousRelevanceCount,
                        "akcesorium",
                        "akcesoria",
                        "akcesoriów"
                      )}, które nie wyglądały jak właściwy produkt.`}
                </span>
              </div>

              <button
                type="button"
                onClick={toggleSuspiciousMatches}
                className="inline-flex shrink-0 items-center justify-center rounded-lg border border-amber-400/18 bg-amber-400/[0.055] px-3 py-1.5 text-[10px] font-semibold text-amber-100 transition hover:border-amber-300/35 hover:bg-amber-400/[0.10] hover:text-white"
              >
                {showSuspiciousMatches ? "Ukryj" : "Pokaż mimo to"}
              </button>
            </div>
          )}

          {restoredFromSearchCache &&
            !loading &&
            interpretation && (
              <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-cyan-500/20 bg-cyan-500/[0.04] px-5 py-4 text-sm text-cyan-100 sm:flex-row sm:items-center sm:justify-between">
                <span>
                  ↺ Przywrócono świeże wyniki z pamięci
                  (maks. 3 min).
                </span>

                <button
                  type="button"
                  onClick={refreshSearchResults}
                  className="inline-flex shrink-0 items-center justify-center rounded-xl border border-cyan-400/25 bg-cyan-400/[0.08] px-4 py-2 font-semibold text-cyan-100 transition hover:border-cyan-300/40 hover:bg-cyan-400/[0.14] hover:text-white"
                >
                  ↻ Odśwież wyniki
                </button>
              </div>
            )}

          {/* ASARVO_RESULTS_UI_V5_9 — ADAPTIVE DECISION */}
          {bestProduct && shortlistEntries.length > 1 && (
            <div className="mt-7">
              <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <div className="inline-flex items-center gap-2 rounded-full border border-blue-400/20 bg-blue-500/[0.07] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-blue-300">
                    <span className="h-1.5 w-1.5 rounded-full bg-blue-300 shadow-[0_0_14px_rgba(96,165,250,0.9)]" />
                    ASARVO SHORTLIST
                  </div>

                  <h2 className="mt-3 text-xl font-bold tracking-tight sm:text-3xl">
                    {`${shortlistEntries.length} najważniejsze wybory od razu`}
                  </h2>

                  <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-500">
                    Różne odpowiedzi na najważniejsze pytania: dopasowanie, cena i bezpieczeństwo.
                  </p>
                </div>

                <div className="rounded-full border border-white/[0.06] bg-white/[0.018] px-3.5 py-2 text-[11px] text-gray-500">
                  {countLabel(filteredProducts.length, "oferta", "oferty", "ofert")} · {countLabel(productFamilies.length, "produkt", "produkty", "produktów")} · {countLabel(totalStoreCount, "źródło", "źródła", "źródeł")}
                </div>
              </div>

              <div
                className={`grid gap-4 ${
                  shortlistEntries.length === 2
                    ? "lg:grid-cols-2"
                    : "lg:grid-cols-3"
                }`}
              >
                {shortlistEntries.map((entry) => (
                  <ShortlistCard key={entry.key} entry={entry} />
                ))}
              </div>
            </div>
          )}

          {/* NAJLEPSZA OFERTA */}
          {bestProduct ? (
            <div className={`group relative ${productFamilies.length === 1 ? "mt-6" : "mt-4"} overflow-hidden rounded-[24px] border border-blue-400/25 sm:rounded-[30px] bg-[linear-gradient(135deg,rgba(9,20,37,0.985),rgba(5,9,15,0.985)_58%,rgba(4,7,12,0.995))] shadow-[0_32px_130px_rgba(37,99,235,0.14)] ring-1 ring-inset ring-white/[0.018] before:pointer-events-none before:absolute before:inset-x-12 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-blue-300/55 before:to-transparent`}>

              <div className="border-b border-white/[0.06] bg-[linear-gradient(90deg,rgba(37,99,235,0.09),rgba(37,99,235,0.025)_42%,transparent)] px-4 py-3 backdrop-blur-xl sm:px-7 sm:py-3.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex rounded-full border border-blue-500/20 bg-blue-500/[0.10] px-4 py-2 text-xs font-semibold text-blue-300">
                    ✦ WYBRANE PRZEZ ASARVO
                  </span>

                  {typeof bestProduct.dealScore === "number" && (
                    <span
                      className={`inline-flex rounded-full border px-4 py-2 text-xs font-semibold ${scoreChipTone(
                        bestProduct.dealScore
                      )}`}
                    >
                      ASARVO Score {bestProduct.dealScore}/100
                    </span>
                  )}

                  {productFamilies.length === 1 ? (
                    <span className="inline-flex rounded-full border border-violet-400/18 bg-violet-500/[0.06] px-4 py-2 text-xs font-semibold text-violet-200">
                      ✦ 1 ZWERYFIKOWANY MODEL
                    </span>
                  ) : (
                    <>
                      {bestProduct.id === cheapestProduct?.id && (
                        <span className="inline-flex rounded-full border border-amber-500/20 bg-amber-500/[0.08] px-4 py-2 text-xs font-semibold text-amber-300">
                          💰 {cheapestHasConfirmedTotal ? "NAJTAŃSZY Z WYNIKÓW" : "NAJNIŻSZA CENA W WYNIKACH"}
                        </span>
                      )}

                      {bestProduct.safestOffer && (
                        <span className="inline-flex rounded-full border border-cyan-500/20 bg-cyan-500/[0.08] px-4 py-2 text-xs font-semibold text-cyan-300">
                          🛡️ NAJBEZPIECZNIEJSZA
                        </span>
                      )}

                      {bestProduct.id === cheapestProduct?.id &&
                        typeof bestProduct.priceScore === "number" &&
                        bestProduct.priceScore < 45 && (
                          <span className="inline-flex rounded-full border border-amber-400/15 bg-amber-400/[0.045] px-3 py-2 text-[10px] font-medium text-amber-200/90">
                            najtańszy tutaj ≠ atrakcyjna cena
                          </span>
                        )}
                    </>
                  )}
                </div>
              </div>

              <div className="p-4 sm:p-7">
                {/* ASARVO_RESULT_HERO_LAYOUT_V1 */}
                <div className="grid items-start gap-5 sm:gap-6 lg:grid-cols-[minmax(0,1fr)_300px] xl:grid-cols-[minmax(0,1fr)_330px]">

                  <div className="flex min-w-0 flex-col gap-5 sm:gap-6 md:flex-row">
                    <ProductVisual
                      product={bestProduct}
                      label={
                        bestProductFamily
                          ? productFamilyUiIdentity(bestProductFamily)
                          : productUiIdentity(bestProduct)
                      }
                    />

                    <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-gray-500">
                      <span>🏪 {bestProduct.store}</span>
                      <span
                        className={`rounded-full border px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.08em] ${sourceKindChipTone(
                          bestProduct.store
                        )}`}
                      >
                        {sourceKindLabel(bestProduct.store)}
                      </span>
                    </div>

                    <h2
                      className="mt-2.5 line-clamp-3 break-words text-[24px] font-bold leading-[1.12] tracking-tight sm:mt-3 sm:text-3xl xl:text-[34px]"
                    >
                      {bestProductFamily
                        ? productFamilyUiIdentity(bestProductFamily)
                        : productUiIdentity(bestProduct)}
                    </h2>

                    {(bestProductFamily
                      ? productFamilyUiSpecs(bestProductFamily)
                      : productUiSpecs(bestProduct)
                    ).length > 0 && (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {(bestProductFamily
                          ? productFamilyUiSpecs(bestProductFamily)
                          : productUiSpecs(bestProduct)
                        ).map((spec) => (
                          <span
                            key={spec}
                            className="rounded-lg border border-blue-400/15 bg-blue-500/[0.055] px-2.5 py-1.5 text-[11px] font-semibold text-blue-100/85"
                          >
                            {spec}
                          </span>
                        ))}
                      </div>
                    )}

                    {familyVariantSummary(bestProductFamily) && (
                      <div className="mt-3 inline-flex rounded-full border border-violet-500/20 bg-violet-500/[0.07] px-3 py-1.5 text-xs font-medium text-violet-300">
                        ◈ {familyVariantSummary(bestProductFamily)}
                      </div>
                    )}

                    {marketplaceTrustNote(bestProduct.store) && (
                      <div className="mt-3 rounded-xl border border-amber-400/15 bg-amber-400/[0.045] px-3.5 py-2 text-[11px] leading-5 text-amber-100/85">
                        <span className="font-semibold text-amber-200">Oferta marketplace.</span>{" "}
                        Przed zakupem sprawdź stan urządzenia, sprzedawcę, dowód zakupu i gwarancję.
                      </div>
                    )}

                    <div className="mt-5 flex flex-wrap gap-2 text-xs">
                      {bestProduct.originalityConfidence &&
                        bestProduct.originalityConfidence !== "unknown" && (
                          <span
                            className={`rounded-full border px-3 py-1.5 ${originalityChipTone(
                              bestProduct.originalityConfidence
                            )}`}
                          >
                            {originalityChipIcon(bestProduct.originalityConfidence)}{" "}
                            {originalityUiLabel(bestProduct.originalityConfidence)}
                          </span>
                        )}

                      {(bestProduct.condition || bestProduct.assessedCondition === "new" || bestProduct.assessedCondition === "used") && (
                        <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-gray-300">
                          {productConditionLabel(bestProduct)}
                        </span>
                      )}

                      <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-gray-300">
                        {riskLabel(bestProduct.riskLevel)}
                      </span>

                      {bestProduct.priceVerified && (
                        <span className="rounded-full border border-blue-500/15 bg-blue-500/[0.06] px-3 py-1.5 text-blue-300">
                          ✓ Cena zweryfikowana
                        </span>
                      )}

                      {priceAttractivenessLabel(
                        bestProduct.priceAttractiveness
                      ) && (
                        <span className="rounded-full border border-amber-500/15 bg-amber-500/[0.06] px-3 py-1.5 text-amber-300">
                          {priceAttractivenessLabel(
                            bestProduct.priceAttractiveness
                          )}
                        </span>
                      )}
                    </div>

                    {(bestProduct.aiReason || productFamilies.length === 1) && (
                      <div className="mt-5 max-w-3xl rounded-2xl border border-white/[0.06] bg-[linear-gradient(145deg,rgba(0,0,0,0.26),rgba(255,255,255,0.012))] p-3.5">
                        <div className="text-xs font-semibold uppercase tracking-wide text-blue-400">
                          Dlaczego ASARVO wybrało tę ofertę?
                        </div>
                        <p className="mt-2 text-sm leading-6 text-gray-400">
                          {productFamilies.length === 1
                            ? singleModelReason(bestProduct)
                            : bestProduct.aiReason}
                        </p>
                      </div>
                    )}

                    <div className="mt-4 grid max-w-3xl grid-cols-2 gap-2 sm:mt-5 sm:gap-2.5 sm:grid-cols-4">
                      <MetricGauge label="Dopasowanie" value={bestProduct.matchScore} />
                      <MetricGauge label="Cena" value={bestProduct.priceScore} />
                      <MetricGauge label="Źródło" value={bestProduct.sourceConfidence} />
                      <MetricGauge label="Bezpieczeństwo" value={bestProduct.riskScore} inverse />
                    </div>
                    </div>
                  </div>

                  <div className="min-w-0 lg:w-full">
                    <div className="rounded-2xl border border-blue-300/[0.13] bg-[linear-gradient(145deg,rgba(37,99,235,0.09),rgba(0,0,0,0.30))] p-5 shadow-[0_18px_55px_rgba(37,99,235,0.08)] ring-1 ring-inset ring-white/[0.018]">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-blue-300">
                        Wybrana oferta
                      </div>

                      <div className="mt-3 flex items-center justify-between gap-6 text-sm">
                        <span className="text-gray-500">Cena produktu</span>
                        <span className="font-semibold text-white">
                          {formatPrice(bestProduct.price)}
                        </span>
                      </div>

                      <div className="mt-2.5 flex items-center justify-between gap-6 text-sm">
                        <span className="text-gray-500">Dostawa</span>
                        <span
                          className={
                            bestProduct.delivery === null
                              ? "font-medium text-amber-300"
                              : bestProduct.delivery === 0
                                ? "font-medium text-emerald-300"
                                : "font-medium text-gray-300"
                          }
                        >
                          {deliveryCostLabel(bestProduct.delivery)}
                        </span>
                      </div>

                      <div className="my-4 h-px bg-white/[0.07]" />

                      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3">
                        <div className="min-w-0">
                          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-blue-300">
                            {bestProduct.delivery === null ? "Cena produktu" : "Do zapłaty"}
                          </div>
                          <div className="mt-1 max-w-[120px] text-[10px] leading-4 text-gray-600 sm:max-w-none sm:text-xs">
                            {bestProduct.delivery === null
                              ? "dostawa do potwierdzenia"
                              : bestProduct.store}
                          </div>
                        </div>
                        <div className="whitespace-nowrap text-right text-[26px] font-bold leading-none tracking-tight text-white sm:text-[28px] xl:text-[30px]">
                          {bestProduct.delivery === null
                            ? formatPrice(bestProduct.price)
                            : purchaseTotalLabel(bestProduct)}
                        </div>
                      </div>
                    </div>

                    {bestProduct.url ? (
                      <a
                        href={bestProduct.url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-3 inline-flex w-full items-center justify-center rounded-xl bg-gradient-to-r from-blue-600 via-blue-500 to-cyan-500 px-6 py-3.5 text-sm font-bold text-white shadow-[0_14px_38px_rgba(37,99,235,0.24)] transition duration-300 hover:-translate-y-0.5 hover:brightness-110 hover:shadow-[0_20px_52px_rgba(37,99,235,0.30)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300/50 motion-reduce:transform-none"
                      >
                        {productFamilies.length === 1 ? "Zobacz ofertę →" : "Zobacz najlepszą ofertę →"}
                      </a>
                    ) : (
                      <button className="mt-3 w-full rounded-xl bg-blue-500 px-6 py-3.5 text-sm font-bold text-white">
                        {productFamilies.length === 1 ? "Zobacz ofertę" : "Zobacz najlepszą ofertę"}
                      </button>
                    )}

                    {bestProductFamily && bestProductFamily.storeOffers.length > 1 && (
                      <div className="mt-3 overflow-hidden rounded-2xl border border-white/[0.07] bg-black/20">
                        <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
                          <div>
                            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-500">
                              Inne oferty tego produktu
                            </div>
                            <div className="mt-0.5 text-xs text-gray-400">
                              {bestProductFamily.storeOffers.length} źródeł / sklepów
                            </div>
                          </div>
                          <span className="rounded-full border border-blue-400/15 bg-blue-500/[0.06] px-2.5 py-1 text-[10px] font-semibold text-blue-300">
                            porównaj
                          </span>
                        </div>

                        <div className="divide-y divide-white/[0.05]">
                          {bestProductFamily.storeOffers.slice(0, 4).map((storeOffer) => {
                            const offer = storeOffer.costRepresentative;
                            return (
                              <div key={storeOffer.key} className="flex items-center gap-3 px-4 py-3">
                                <div className="min-w-0 flex-1">
                                  <div className="truncate text-xs font-medium text-gray-300">
                                    {storeOffer.store}
                                  </div>
                                  <div className="mt-0.5 text-[10px] text-gray-600">
                                    {offer.delivery === 0 ? "Darmowa dostawa" : deliveryCostLabel(offer.delivery)}
                                  </div>
                                </div>
                                <div className="shrink-0 text-right">
                                  <div className="text-sm font-bold text-white">
                                    {purchaseTotalLabel(offer)}
                                  </div>
                                </div>
                                {offer.url && (
                                  <a
                                    href={offer.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    aria-label={`Zobacz ofertę ${storeOffer.store}`}
                                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.025] text-xs text-gray-300 transition hover:border-blue-400/30 hover:bg-blue-500/[0.08] hover:text-white"
                                  >
                                    ↗
                                  </a>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        {bestProductFamily.storeOffers.length > 4 && (
                          <div className="border-t border-white/[0.05] px-4 py-2.5 text-center text-[10px] text-gray-600">
                            + {bestProductFamily.storeOffers.length - 4} kolejne źródła
                          </div>
                        )}
                      </div>
                    )}

                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        disabled={libraryActionBusyKey === `favorite:${productStorageKey(bestProduct)}`}
                        onClick={() => void toggleFavorite(bestProduct)}
                        className={`rounded-xl border px-3 py-2.5 text-xs font-medium transition disabled:cursor-wait disabled:opacity-60 ${
                          isFavorite(bestProduct)
                            ? "border-rose-500/30 bg-rose-500/[0.10] text-rose-200"
                            : "border-white/[0.08] bg-white/[0.025] text-gray-400 hover:bg-white/[0.06] hover:text-white"
                        }`}
                      >
                        {isFavorite(bestProduct) ? "♥ Ulubione" : "♡ Ulubione"}
                      </button>

                      <button
                        type="button"
                        disabled={libraryActionBusyKey === `watch:${productStorageKey(bestProduct)}`}
                        onClick={() =>
                          getPriceWatch(bestProduct)
                            ? void removePriceWatch(bestProduct)
                            : openPriceWatchEditor(bestProduct)
                        }
                        className={`rounded-xl border px-3 py-2.5 text-xs font-medium transition disabled:cursor-wait disabled:opacity-60 ${
                          getPriceWatch(bestProduct)
                            ? "border-amber-500/30 bg-amber-500/[0.10] text-amber-200"
                            : "border-white/[0.08] bg-white/[0.025] text-gray-400 hover:bg-white/[0.06] hover:text-white"
                        }`}
                      >
                        🔔 {getPriceWatch(bestProduct) ? "Obserwujesz" : "Obserwuj"}
                      </button>

                      {bestProductFamily && (
                        <button
                          type="button"
                          onClick={() => toggleCompareFamily(bestProductFamily)}
                          className={`rounded-xl border px-3 py-2.5 text-xs font-medium transition ${
                            isFamilyCompared(bestProductFamily)
                              ? "border-blue-500/35 bg-blue-500/[0.12] text-blue-200"
                              : "border-white/[0.08] bg-white/[0.025] text-gray-400 hover:bg-white/[0.06] hover:text-white"
                          }`}
                        >
                          {isFamilyCompared(bestProductFamily) ? "✓ W porównaniu" : "⇄ Porównaj"}
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => void shareProduct(bestProduct, bestProductFamily?.displayName ?? bestProduct.name)}
                        className="rounded-xl border border-white/[0.08] bg-white/[0.025] px-3 py-2.5 text-xs font-medium text-gray-400 transition hover:bg-white/[0.06] hover:text-white"
                      >
                        ↗ Udostępnij
                      </button>
                    </div>
                  </div>

                </div>
              </div>
            </div>
          ) : searchWasCancelled ? null : (
            <div className="mt-6 overflow-hidden rounded-[26px] border border-blue-400/20 bg-[linear-gradient(145deg,rgba(10,20,36,0.96),rgba(3,7,12,0.995))] shadow-[0_24px_90px_rgba(37,99,235,0.08)] sm:mt-7 sm:rounded-[30px]">
              <div className="relative overflow-hidden border-b border-white/[0.06] px-5 py-6 sm:px-8 sm:py-7">
                <div className="pointer-events-none absolute -right-20 -top-24 h-56 w-56 rounded-full bg-blue-500/[0.08] blur-3xl" />
                <div className="relative flex items-start gap-4">
                  <div className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-blue-400/20 bg-blue-500/[0.08] text-lg text-blue-200 shadow-[0_0_34px_rgba(59,130,246,0.10)] sm:h-12 sm:w-12">
                    0
                  </div>

                  <div className="min-w-0">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.20em] text-blue-400">
                      ASARVO · wynik zweryfikowany
                    </div>
                    <h2 className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-[30px]">
                      0 pewnych dopasowań
                    </h2>
                    <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-400">
                      ASARVO nie znalazło oferty, którą mogłoby bezpiecznie uznać za zgodną z Twoimi wymaganiami.
                      Zamiast zgadywać, zatrzymaliśmy wynik tutaj.
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid gap-5 p-5 sm:p-7 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
                <div className="min-w-0">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-500">
                    ASARVO zrozumiało
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {interpretation?.product && (
                      <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-xs text-gray-300">
                        Produkt: {interpretation.product}
                      </span>
                    )}
                    {interpretation?.category && (
                      <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-xs text-gray-300">
                        Kategoria: {categoryLabel(interpretation.category)}
                      </span>
                    )}
                    {interpretation?.brand && (
                      <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-xs text-gray-300">
                        Marka: {interpretation.brand}
                      </span>
                    )}
                    {interpretation?.model && (
                      <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-xs text-gray-300">
                        Model: {interpretation.model}
                      </span>
                    )}
                    {interpretation?.condition && (
                      <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-xs text-gray-300">
                        Stan: {interpretation.condition === "new" ? "nowy" : "używany"}
                      </span>
                    )}
                    {interpretation?.original === true && (
                      <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-xs text-gray-300">
                        Oryginalny
                      </span>
                    )}
                    {interpretation?.maxPrice !== null && interpretation?.maxPrice !== undefined && (
                      <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-xs text-gray-300">
                        Budżet: do {interpretation.maxPrice} zł
                      </span>
                    )}
                    {!interpretation && (
                      <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-xs text-gray-500">
                        Nie udało się potwierdzić parametrów zapytania.
                      </span>
                    )}
                  </div>

                  <div className="mt-6 text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-500">
                    Najczęstsze powody
                  </div>

                  <div className="mt-3 divide-y divide-white/[0.055] overflow-hidden rounded-2xl border border-white/[0.07] bg-black/15">
                    <div className="flex gap-3 px-4 py-3.5">
                      <span className="mt-0.5 text-blue-300">01</span>
                      <div>
                        <div className="text-sm font-semibold text-gray-200">Za mało potwierdzonych danych</div>
                        <p className="mt-1 text-xs leading-5 text-gray-500">Sklep lub marketplace nie podał informacji potrzebnych do pewnego dopasowania.</p>
                      </div>
                    </div>
                    <div className="flex gap-3 px-4 py-3.5">
                      <span className="mt-0.5 text-blue-300">02</span>
                      <div>
                        <div className="text-sm font-semibold text-gray-200">Wymagania są bardzo precyzyjne</div>
                        <p className="mt-1 text-xs leading-5 text-gray-500">Model, stan, budżet lub inny warunek mógł wykluczyć wszystkie znalezione oferty.</p>
                      </div>
                    </div>
                    <div className="flex gap-3 px-4 py-3.5">
                      <span className="mt-0.5 text-blue-300">03</span>
                      <div>
                        <div className="text-sm font-semibold text-gray-200">Wynik wyglądał zbyt słabo lub podejrzanie</div>
                        <p className="mt-1 text-xs leading-5 text-gray-500">ASARVO woli pokazać zero wyników niż podsunąć przypadkowy produkt.</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="self-start rounded-2xl border border-blue-400/15 bg-blue-500/[0.035] p-4 sm:p-5">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-blue-400">
                    Zmień jedno wymaganie
                  </div>
                  <h3 className="mt-2 text-lg font-bold text-white">Popraw zapytanie i sprawdź ponownie</h3>
                  <p className="mt-2 text-xs leading-5 text-gray-500">
                    Najlepiej zmienić tylko jeden element — np. budżet, model albo stan produktu.
                  </p>

                  <form action="/search" className="mt-4">
                    <textarea
                      id="asarvo-zero-query"
                      name="q"
                      defaultValue={query}
                      rows={3}
                      className="w-full resize-none rounded-xl border border-white/10 bg-black/25 px-3.5 py-3 text-sm leading-6 text-white outline-none transition placeholder:text-gray-700 focus:border-blue-500/40 focus:ring-2 focus:ring-blue-500/10"
                      placeholder="Np. laptop gamingowy RTX 4050 do 4500 zł"
                    />

                    <button
                      type="submit"
                      className="mt-3 inline-flex w-full items-center justify-center rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 px-5 py-3 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(37,99,235,0.18)] transition hover:brightness-110"
                    >
                      Szukaj ponownie →
                    </button>
                  </form>

                  <a
                    href="/"
                    className="mt-2.5 inline-flex w-full items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.02] px-5 py-3 text-sm font-medium text-gray-400 transition hover:bg-white/[0.05] hover:text-white"
                  >
                    Nowe wyszukiwanie
                  </a>

                  <div className="mt-4 flex items-center gap-2 rounded-xl border border-emerald-400/10 bg-emerald-400/[0.025] px-3 py-2.5 text-[10px] leading-4 text-gray-500">
                    <span className="text-emerald-300">✓</span>
                    ASARVO nie rozluźnia Twoich wymagań bez Twojej decyzji.
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ASARVO_RESULTS_UI_V4_1: oferty tego produktu scalone z kartą główną */}

          {/* ASARVO_RESULTS_UI_V4_1: panel kuponów ukryty do czasu ponownego włączenia źródła */}

          {compareFamilies.length > 0 && (
            <div className="mt-8 overflow-hidden rounded-3xl border border-blue-500/20 bg-blue-500/[0.035]">
              <div className="flex flex-col gap-3 border-b border-white/[0.06] px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-blue-400">
                    ASARVO COMPARE
                  </div>
                  <h2 className="mt-1 text-xl font-bold">
                    Porównanie produktów
                  </h2>
                  <p className="mt-1 text-xs text-gray-500">
                    Wybrano {compareFamilies.length}/3. Porównujesz różne produkty, nie duplikaty ofert tego samego produktu.
                    {compareHasRelevanceExcludedFamily && (
                      <span className="mt-2 block rounded-xl border border-amber-500/20 bg-amber-500/[0.055] px-3 py-2 text-amber-200">
                        ⚠ Inny typ produktu — Relevance Shield wykrył co najmniej jedną podejrzaną pozycję. Nadal możesz ją porównać, ale nie bierze udziału w wyborze liderów metryk.
                      </span>
                    )}
                    {compareFamilies.length > 1 && (
                      <span className="mt-1 block text-emerald-300/80">
                        ★ Wyróżniamy najlepszą znaną wartość w każdej metryce. Remis może oznaczać kilka wyróżnień.
                      </span>
                    )}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {/* ASARVO_COMPARE_V5 */}
                  <button
                    type="button"
                    onClick={() =>
                      void copyComparisonSummary()
                    }
                    disabled={compareFamilies.length < 2}
                    className={
                      "w-fit rounded-xl border px-4 py-2 text-xs font-semibold transition " +
                      (compareFamilies.length < 2
                        ? "cursor-not-allowed border-white/[0.08] text-gray-500 opacity-40"
                        : "border-emerald-400/25 bg-emerald-500/[0.07] text-emerald-200 hover:border-emerald-300/40 hover:bg-emerald-500/[0.12] hover:text-white")
                    }
                  >
                    ⧉ Kopiuj porównanie
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setCompareDifferencesOnly(
                        (current) => !current
                      )
                    }
                    disabled={compareFamilies.length < 2}
                    aria-pressed={compareDifferencesOnly}
                    className={
                      "w-fit rounded-xl border px-4 py-2 text-xs font-semibold transition " +
                      (compareDifferencesOnly
                        ? "border-blue-400/35 bg-blue-500/[0.12] text-blue-100"
                        : "border-white/[0.08] text-gray-400 hover:bg-white/[0.05] hover:text-white") +
                      (compareFamilies.length < 2
                        ? " cursor-not-allowed opacity-40"
                        : "")
                    }
                  >
                    {compareDifferencesOnly
                      ? "✓ Tylko różnice"
                      : "Tylko różnice"}
                  </button>

                <button
                  type="button"
                  onClick={clearCompareFamilies}
                  className="w-fit rounded-xl border border-white/[0.08] px-4 py-2 text-xs font-medium text-gray-400 transition hover:bg-white/[0.05] hover:text-white"
                >
                  Wyczyść porównanie
                </button>
                </div>
              </div>

              {compareFamilies.length > 1 && (
                <div className="border-b border-white/[0.05] bg-black/10 px-6 py-5">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-blue-400">
                        Szybkie podsumowanie
                      </div>
                      <div className="mt-1 text-xs text-gray-500">
                        Liderzy poszczególnych metryk — bez wybierania jednego zwycięzcy całości.
                      </div>
                      <div className="mt-2 text-[11px] leading-relaxed text-gray-600">
                        Zielony lider oznacza najlepszą wartość tylko w danej metryce.
                        Remis pozostaje remisem, a pozycje oznaczone przez Relevance Shield nie wpływają na liderów.
                      </div>
                      <div className="mt-1 text-[11px] leading-relaxed text-gray-600">
                        Trade-off na kartach pokazuje, ile dany produkt traci względem lidera ceny, Score i ryzyka.
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                    {compareBestLowestPrice !== null &&
                      comparePriceLeaders.length > 0 && (
                        <div className="min-w-0 rounded-2xl border border-emerald-500/15 bg-emerald-500/[0.045] p-3">
                          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-300">
                            Najniższa cena
                          </div>
                          <div
                            title={compareLeaderNames(comparePriceLeaders)}
                            className="mt-2 line-clamp-2 text-xs font-semibold text-white"
                          >
                            {compareLeaderNames(comparePriceLeaders)}
                          </div>
                          <div className="mt-2 text-sm font-bold text-emerald-200">
                            {formatPrice(compareBestLowestPrice)}
                            {comparePriceLeaders.length > 1 && (
                              <span className="ml-2 text-[10px] font-semibold uppercase text-emerald-300">
                                remis
                              </span>
                            )}
                          </div>
                          <div className="mt-1 text-[10px] text-gray-500">
                            {comparePriceLeaders.length > 1
                              ? "Remis cenowy"
                              : compareDecisionPriceGap !== null
                                ? `Przewaga: ${formatPrice(compareDecisionPriceGap)}`
                                : "Brak pełnych danych do różnicy"}
                          </div>
                        </div>
                      )}

                    {compareBestConfirmedTotal !== null &&
                      compareConfirmedTotalLeaders.length > 0 && (
                        <div className="min-w-0 rounded-2xl border border-emerald-500/15 bg-emerald-500/[0.045] p-3">
                          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-300">
                            Najniższy znany koszt
                          </div>
                          <div
                            title={compareLeaderNames(compareConfirmedTotalLeaders)}
                            className="mt-2 line-clamp-2 text-xs font-semibold text-white"
                          >
                            {compareLeaderNames(compareConfirmedTotalLeaders)}
                          </div>
                          <div className="mt-2 text-sm font-bold text-emerald-200">
                            {formatPrice(compareBestConfirmedTotal)}
                            {compareConfirmedTotalLeaders.length > 1 && (
                              <span className="ml-2 text-[10px] font-semibold uppercase text-emerald-300">
                                remis
                              </span>
                            )}
                          </div>
                        </div>
                      )}

                    {compareBestRating !== null &&
                      compareRatingLeaders.length > 0 && (
                        <div className="min-w-0 rounded-2xl border border-emerald-500/15 bg-emerald-500/[0.045] p-3">
                          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-300">
                            Najwyższa ocena
                          </div>
                          <div
                            title={compareLeaderNames(compareRatingLeaders)}
                            className="mt-2 line-clamp-2 text-xs font-semibold text-white"
                          >
                            {compareLeaderNames(compareRatingLeaders)}
                          </div>
                          <div className="mt-2 text-sm font-bold text-emerald-200">
                            {compareBestRating.toFixed(1)}
                            {compareRatingLeaders.length > 1 && (
                              <span className="ml-2 text-[10px] font-semibold uppercase text-emerald-300">
                                remis
                              </span>
                            )}
                          </div>
                        </div>
                      )}

                    {compareBestDealScore !== null &&
                      compareDealScoreLeaders.length > 0 && (
                        <div className="min-w-0 rounded-2xl border border-emerald-500/15 bg-emerald-500/[0.045] p-3">
                          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-300">
                            Najwyższy ASARVO Score
                          </div>
                          <div
                            title={compareLeaderNames(compareDealScoreLeaders)}
                            className="mt-2 line-clamp-2 text-xs font-semibold text-white"
                          >
                            {compareLeaderNames(compareDealScoreLeaders)}
                          </div>
                          <div className="mt-2 text-sm font-bold text-emerald-200">
                            {compareBestDealScore}/100
                            {compareDealScoreLeaders.length > 1 && (
                              <span className="ml-2 text-[10px] font-semibold uppercase text-emerald-300">
                                remis
                              </span>
                            )}
                          </div>
                          <div className="mt-1 text-[10px] text-gray-500">
                            {compareDealScoreLeaders.length > 1
                              ? "Remis punktowy"
                              : compareDecisionDealScoreGap !== null
                                ? `Przewaga: ${compareDecisionDealScoreGap.toFixed(0)} pkt`
                                : "Brak pełnych danych do różnicy"}
                          </div>
                        </div>
                      )}

                    {compareBestRiskScore !== null &&
                      compareRiskLeaders.length > 0 && (
                        <div className="min-w-0 rounded-2xl border border-emerald-500/15 bg-emerald-500/[0.045] p-3">
                          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-300">
                            Najniższe ryzyko
                          </div>
                          <div
                            title={compareLeaderNames(compareRiskLeaders)}
                            className="mt-2 line-clamp-2 text-xs font-semibold text-white"
                          >
                            {compareLeaderNames(compareRiskLeaders)}
                          </div>
                          <div className="mt-2 text-sm font-bold text-emerald-200">
                            {riskLabel(
                              compareRiskLeaders[0].representative.riskLevel
                            )}
                            {compareRiskLeaders.length > 1 && (
                              <span className="ml-2 text-[10px] font-semibold uppercase text-emerald-300">
                                remis
                              </span>
                            )}
                          </div>
                          <div className="mt-1 text-[10px] text-gray-500">
                            {compareRiskLeaders.length > 1
                              ? "Remis ryzyka"
                              : compareDecisionRiskGap !== null
                                ? `Przewaga: ${compareDecisionRiskGap.toFixed(0)} pkt ryzyka`
                                : "Brak pełnych danych do różnicy"}
                          </div>
                        </div>
                      )}
                  </div>
                </div>
              )}

              {/* ASARVO_COMPARE_V24_SPEC_DIFFERENCE_FOCUS */}
              {compareFamilies.length > 1 && (
                <div className="border-b border-white/[0.05] px-6 py-5">
                  <div className="mb-4">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-blue-400">
                      Różnice specyfikacji
                    </div>
                    <div className="mt-1 text-xs text-gray-500">
                      Parametry są odczytywane z nazw produktów. „Różnica” oznacza różne rozpoznane wartości; „niepełne dane” oznacza, że przynajmniej jednej wartości nie udało się pewnie rozpoznać. Dla RAM, SSD i Hz wyróżniamy najwyższą rozpoznaną wartość tylko wtedy, gdy istnieje realna różnica — bez oceniania CPU ani GPU po samej nazwie. Nad tabelą pokazujemy skrót najważniejszych różnic.
                    </div>
                    {compareDifferencesOnly && (
                      <div className="mt-1 text-[11px] text-blue-300/70">
                        Tryb „Tylko różnice” ukrywa identyczne wiersze specyfikacji.
                      </div>
                    )}
                  </div>

                  {/* ASARVO_COMPARE_V26_KEY_DIFFERENCES_SUMMARY */}
                  {compareKeyDifferences.length > 0 && (
                    <div className="mb-4 rounded-2xl border border-blue-500/15 bg-blue-500/[0.03] px-4 py-4">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-blue-300">
                        Najważniejsze różnice
                      </div>

                      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                        {compareKeyDifferences.map((item) => (
                          <div
                            key={`key-diff-${item.label}`}
                            className="rounded-xl border border-white/[0.06] bg-white/[0.015] px-3.5 py-3"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                                {item.label}
                              </span>

                              {item.incomplete && (
                                <span className="text-[9px] font-semibold uppercase tracking-wide text-amber-300/80">
                                  niepełne dane
                                </span>
                              )}
                            </div>

                            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs font-semibold text-white">
                              {item.values.map((value, index) => (
                                <span
                                  key={`${item.label}-${value}`}
                                  className="inline-flex items-center gap-1.5"
                                >
                                  {index > 0 && (
                                    <span className="text-gray-600">
                                      ↔
                                    </span>
                                  )}
                                  <span>{value}</span>
                                </span>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="mt-3 text-[10px] leading-relaxed text-gray-600">
                        To skrót rozpoznanych różnic. Nie oznacza wyboru jednego najlepszego produktu ani rankingu CPU/GPU.
                      </div>
                    </div>
                  )}

                  <div className="overflow-x-auto rounded-2xl border border-white/[0.07]">
                    <div
                      className="grid min-w-[760px]"
                      style={{
                        gridTemplateColumns: `150px repeat(${compareFamilies.length}, minmax(190px, 1fr))`,
                      }}
                    >
                      <div className="border-b border-r border-white/[0.06] bg-white/[0.025] px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-500">
                        Parametr
                      </div>

                      {compareFamilies.map((family) => (
                        <div
                          key={`spec-head-${family.key}`}
                          className="border-b border-r border-white/[0.06] bg-white/[0.025] px-4 py-3 text-xs font-semibold text-white last:border-r-0"
                          title={family.representative.name}
                        >
                          <div className="line-clamp-2">
                            {family.representative.name}
                          </div>
                          {!compareFamilyEligibleForLeaders(family) && (
                            <div className="mt-1 text-[9px] font-semibold uppercase tracking-wide text-amber-300">
                              Inny typ produktu
                            </div>
                          )}
                        </div>
                      ))}

                      {visibleCompareSpecRows.map((row) => (
                        <div key={row.label} className="contents">
                          <div
                            className={
                              "border-b border-r border-white/[0.06] px-4 py-3 text-xs font-medium " +
                              (row.differs
                                ? "bg-blue-500/[0.035] text-blue-200"
                                : row.incomplete
                                  ? "bg-amber-500/[0.02] text-amber-200/80"
                                  : "text-gray-500")
                            }
                          >
                            {row.label}
                            {row.differs ? (
                              <span className="ml-2 text-[9px] font-semibold uppercase text-blue-400">
                                różnica
                              </span>
                            ) : row.incomplete ? (
                              <span className="ml-2 text-[9px] font-semibold uppercase text-amber-300/80">
                                niepełne dane
                              </span>
                            ) : (
                              <span className="ml-2 text-[9px] font-semibold uppercase text-gray-600">
                                zgodne
                              </span>
                            )}
                          </div>

                          {row.values.map((value, index) => {
                            const numericValue =
                              row.numericValues[index];

                            const isKnownNumericLeader =
                              row.differs &&
                              row.bestNumeric !== null &&
                              numericValue !== null &&
                              Math.abs(
                                numericValue - row.bestNumeric
                              ) < 0.0001;

                            return (
                              <div
                                key={`${row.label}-${compareFamilies[index]?.key ?? index}`}
                                className={
                                  "border-b border-r border-white/[0.06] px-4 py-3 text-xs last:border-r-0 " +
                                  (isKnownNumericLeader
                                    ? "bg-emerald-500/[0.045] font-semibold text-emerald-100"
                                    : row.differs
                                      ? "bg-blue-500/[0.02] font-semibold text-white"
                                      : row.incomplete
                                        ? "bg-amber-500/[0.015] text-gray-300"
                                        : "text-gray-400")
                                }
                              >
                                <div className="flex flex-wrap items-center gap-2">
                                  <span>{value ?? "Brak danych"}</span>
                                  {isKnownNumericLeader && (
                                    <span className="rounded-full border border-emerald-500/20 bg-emerald-500/[0.06] px-2 py-0.5 text-[8px] font-semibold uppercase tracking-wide text-emerald-300">
                                      najwyższa rozpoznana wartość
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ))}
                    </div>

                    {visibleCompareSpecRows.length === 0 && (
                      <div className="px-5 py-6 text-center text-xs text-gray-500">
                        Brak rozpoznanych różnic specyfikacji dla tych produktów.
                      </div>
                    )}
                  </div>
                </div>
              )}

              {compareFamilies.length === 1 && (
                <div className="border-b border-white/[0.05] px-6 py-4 text-sm text-gray-400">
                  Dodaj jeszcze co najmniej jeden produkt, aby porównać je obok siebie.
                </div>
              )}

              {compareDifferencesOnly &&
                compareFamilies.length > 1 &&
                !compareAnyDifference && (
                  <div className="border-b border-white/[0.05] px-6 py-4 text-sm text-gray-400">
                    Wybrane produkty mają identyczne wartości we wszystkich porównywanych metrykach.
                  </div>
                )}

              <div className="grid gap-px bg-white/[0.055] md:grid-cols-2 xl:grid-cols-3">
                {compareFamilies.map((family) => {
                  const rating = compareFamilyRating(family);
                  const representative = family.representative;
                  const dealScore =
                    compareFamilyDealScore(family);
                  const riskScore =
                    compareFamilyRiskScore(family);
                  const lowestPriceIsBest =
                    compareMetricMatches(
                      family.lowestPrice,
                      compareBestLowestPrice
                    );
                  const confirmedTotalIsBest =
                    compareMetricMatches(
                      family.lowestConfirmedTotal,
                      compareBestConfirmedTotal
                    );
                  const ratingIsBest =
                    compareMetricMatches(
                      rating,
                      compareBestRating
                    );
                  const dealScoreIsBest =
                    compareMetricMatches(
                      dealScore,
                      compareBestDealScore
                    );
                  const riskScoreIsBest =
                    compareMetricMatches(
                      riskScore,
                      compareBestRiskScore
                    );

                  return (
                    <div
                      key={family.key}
                      className="bg-[#080a0f] p-5"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-blue-400">
                            Produkt
                          </div>
                          <div className="mt-1 line-clamp-3 font-semibold text-white">
                            {family.displayName}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() =>
                            toggleCompareFamily(family)
                          }
                          aria-label="Usuń z porównania"
                          className="shrink-0 rounded-lg border border-white/[0.08] px-2.5 py-1.5 text-xs text-gray-500 transition hover:text-white"
                        >
                          ×
                        </button>
                      </div>

                      <div className="mt-5 space-y-3 text-xs">
                        {/* ASARVO_COMPARE_V22_DECISION_CLARITY */}
                        <div className="mb-3 flex flex-wrap gap-1.5">
                          {!compareFamilyEligibleForLeaders(family) ? (
                            <span className="rounded-full border border-amber-500/25 bg-amber-500/[0.07] px-2.5 py-1 text-[9px] font-semibold uppercase tracking-wide text-amber-200">
                              Poza liderami
                            </span>
                          ) : (
                            <>
                              {lowestPriceIsBest && (
                                <span className="rounded-full border border-emerald-500/20 bg-emerald-500/[0.055] px-2.5 py-1 text-[9px] font-semibold uppercase tracking-wide text-emerald-200">
                                  Lider ceny
                                </span>
                              )}
                              {dealScoreIsBest && (
                                <span className="rounded-full border border-emerald-500/20 bg-emerald-500/[0.055] px-2.5 py-1 text-[9px] font-semibold uppercase tracking-wide text-emerald-200">
                                  Lider Score
                                </span>
                              )}
                              {riskScoreIsBest && (
                                <span className="rounded-full border border-emerald-500/20 bg-emerald-500/[0.055] px-2.5 py-1 text-[9px] font-semibold uppercase tracking-wide text-emerald-200">
                                  Lider ryzyka
                                </span>
                              )}
                              {!lowestPriceIsBest &&
                                !dealScoreIsBest &&
                                !riskScoreIsBest && (
                                  <span className="rounded-full border border-white/[0.07] bg-white/[0.025] px-2.5 py-1 text-[9px] font-medium uppercase tracking-wide text-gray-500">
                                    Bez lidera głównych metryk
                                  </span>
                                )}
                            </>
                          )}
                        </div>

                        {/* ASARVO_COMPARE_V27_SPEC_COMPLETENESS_CONFIDENCE */}
                        {(() => {
                          const completeness =
                            compareSpecCompletenessByKey.get(
                              family.key
                            );

                          if (!completeness) {
                            return null;
                          }

                          const completenessLabel =
                            completeness.ratio >= 0.85
                              ? "Dane prawie kompletne"
                              : completeness.ratio >= 0.6
                                ? "Dane częściowe"
                                : "Dużo brakujących danych";

                          return (
                            <div className="mb-4 rounded-xl border border-white/[0.07] bg-white/[0.018] px-3.5 py-3">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-gray-500">
                                  Kompletność specyfikacji
                                </div>

                                <div className="text-xs font-semibold text-white">
                                  {completeness.known}/{completeness.total} rozpoznanych
                                </div>
                              </div>

                              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                                <div
                                  className="h-full rounded-full bg-emerald-400/70"
                                  style={{
                                    width: `${Math.round(
                                      completeness.ratio * 100
                                    )}%`,
                                  }}
                                />
                              </div>

                              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[10px]">
                                <span
                                  className={
                                    completeness.ratio >= 0.85
                                      ? "text-emerald-300"
                                      : completeness.ratio >= 0.6
                                        ? "text-amber-200"
                                        : "text-orange-300"
                                  }
                                >
                                  {completenessLabel}
                                </span>

                                {completeness.missingLabels.length > 0 && (
                                  <span
                                    className="text-gray-600"
                                    title={completeness.missingLabels.join(", ")}
                                  >
                                    Braki: {completeness.missingLabels.join(", ")}
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })()}

                        {/* ASARVO_COMPARE_V23_TRADEOFF_INSIGHT */}
                        <div className="mb-4 rounded-xl border border-blue-500/15 bg-blue-500/[0.035] px-3.5 py-3">
                          <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-blue-300">
                            Trade-off względem liderów
                          </div>

                          {!compareFamilyEligibleForLeaders(family) ? (
                            <div className="mt-2 text-[11px] leading-relaxed text-amber-200/80">
                              Pozycja jest poza analizą liderów przez Relevance Shield.
                            </div>
                          ) : (
                            <div className="mt-2 grid gap-1.5 text-[11px] text-gray-400">
                              <div className="flex items-center justify-between gap-3">
                                <span>Cena</span>
                                <span className={
                                  family.lowestPrice !== null &&
                                  compareBestLowestPrice !== null &&
                                  Math.abs(
                                    family.lowestPrice -
                                      compareBestLowestPrice
                                  ) < 0.0001
                                    ? "font-semibold text-emerald-300"
                                    : "font-medium text-gray-300"
                                }>
                                  {family.lowestPrice === null ||
                                  compareBestLowestPrice === null
                                    ? "brak porównania"
                                    : Math.abs(
                                          family.lowestPrice -
                                            compareBestLowestPrice
                                        ) < 0.0001
                                      ? "remis z liderem"
                                      : `+${formatPrice(
                                          Math.abs(
                                            family.lowestPrice -
                                              compareBestLowestPrice
                                          )
                                        )} vs lider`}
                                </span>
                              </div>

                              <div className="flex items-center justify-between gap-3">
                                <span>ASARVO Score</span>
                                <span className={
                                  dealScore !== null &&
                                  compareBestDealScore !== null &&
                                  Math.abs(
                                    dealScore -
                                      compareBestDealScore
                                  ) < 0.0001
                                    ? "font-semibold text-emerald-300"
                                    : "font-medium text-gray-300"
                                }>
                                  {dealScore === null ||
                                  compareBestDealScore === null
                                    ? "brak porównania"
                                    : Math.abs(
                                          dealScore -
                                            compareBestDealScore
                                        ) < 0.0001
                                      ? "remis z liderem"
                                      : `-${Math.abs(
                                          compareBestDealScore -
                                            dealScore
                                        ).toFixed(0)} pkt vs lider`}
                                </span>
                              </div>

                              <div className="flex items-center justify-between gap-3">
                                <span>Ryzyko</span>
                                <span className={
                                  riskScore !== null &&
                                  compareBestRiskScore !== null &&
                                  Math.abs(
                                    riskScore -
                                      compareBestRiskScore
                                  ) < 0.0001
                                    ? "font-semibold text-emerald-300"
                                    : "font-medium text-gray-300"
                                }>
                                  {riskScore === null ||
                                  compareBestRiskScore === null
                                    ? "brak porównania"
                                    : Math.abs(
                                          riskScore -
                                            compareBestRiskScore
                                        ) < 0.0001
                                      ? "remis z liderem"
                                      : `+${Math.abs(
                                          riskScore -
                                            compareBestRiskScore
                                        ).toFixed(0)} pkt ryzyka vs lider`}
                                </span>
                              </div>
                            </div>
                          )}
                        </div>

                        {(!compareDifferencesOnly || comparePriceDiff) && (
                          <div
                            className={
                              "flex items-center justify-between gap-4 rounded-lg px-2 py-1.5 " +
                              (lowestPriceIsBest
                                ? "bg-emerald-500/[0.10] ring-1 ring-inset ring-emerald-400/20"
                                : "")
                            }
                          >
                            <span className={lowestPriceIsBest ? "text-emerald-300" : "text-gray-600"}>
                              Najniższa cena
                            </span>
                            <span className={lowestPriceIsBest ? "font-bold text-emerald-200" : "font-semibold text-white"}>
                              {formatPrice(family.lowestPrice)}
                              {lowestPriceIsBest && (
                                <span className="ml-2 text-[10px] uppercase tracking-wide text-emerald-300">
                                  ★ najlepsza
                                </span>
                              )}
                            </span>
                          </div>
                        )}

                        {(!compareDifferencesOnly || compareConfirmedTotalDiff) && (
                          <div
                            className={
                              "flex items-center justify-between gap-4 rounded-lg px-2 py-1.5 " +
                              (confirmedTotalIsBest
                                ? "bg-emerald-500/[0.10] ring-1 ring-inset ring-emerald-400/20"
                                : "")
                            }
                          >
                            <span className={confirmedTotalIsBest ? "text-emerald-300" : "text-gray-600"}>
                              Najlepszy znany koszt
                            </span>
                            <span className={confirmedTotalIsBest ? "font-bold text-emerald-200" : "font-semibold text-white"}>
                              {family.lowestConfirmedTotal !== null
                                ? formatPrice(family.lowestConfirmedTotal)
                                : "Niepotwierdzony"}
                              {confirmedTotalIsBest && (
                                <span className="ml-2 text-[10px] uppercase tracking-wide text-emerald-300">
                                  ★ najlepszy
                                </span>
                              )}
                            </span>
                          </div>
                        )}

                        {(!compareDifferencesOnly || compareRatingDiff) && (
                          <div
                            className={
                              "flex items-center justify-between gap-4 rounded-lg px-2 py-1.5 " +
                              (ratingIsBest
                                ? "bg-emerald-500/[0.10] ring-1 ring-inset ring-emerald-400/20"
                                : "")
                            }
                          >
                            <span className={ratingIsBest ? "text-emerald-300" : "text-gray-600"}>
                              Ocena
                            </span>
                            <span className={ratingIsBest ? "font-bold text-emerald-200" : "font-semibold text-white"}>
                              {rating !== null ? rating.toFixed(1) : "Brak"}
                              {ratingIsBest && (
                                <span className="ml-2 text-[10px] uppercase tracking-wide text-emerald-300">
                                  ★ najwyższa
                                </span>
                              )}
                            </span>
                          </div>
                        )}

                        {(!compareDifferencesOnly || compareDealScoreDiff) && (
                          <div
                            className={
                              "flex items-center justify-between gap-4 rounded-lg px-2 py-1.5 " +
                              (dealScoreIsBest
                                ? "bg-emerald-500/[0.10] ring-1 ring-inset ring-emerald-400/20"
                                : "")
                            }
                          >
                            <span className={dealScoreIsBest ? "text-emerald-300" : "text-gray-600"}>
                              ASARVO Score
                            </span>
                            <span className={dealScoreIsBest ? "font-bold text-emerald-200" : "font-semibold text-white"}>
                              {dealScore !== null
                                ? `${dealScore}/100`
                                : "Brak"}
                              {dealScoreIsBest && (
                                <span className="ml-2 text-[10px] uppercase tracking-wide text-emerald-300">
                                  ★ najwyższy
                                </span>
                              )}
                            </span>
                          </div>
                        )}

                        {(!compareDifferencesOnly || compareConditionDiff) && (
                          <div className="flex items-center justify-between gap-4">
                            <span className="text-gray-600">Stan</span>
                            <span className="text-right font-medium text-gray-300">
                              {productConditionLabel(representative)}
                            </span>
                          </div>
                        )}

                        {(!compareDifferencesOnly || compareRiskDiff) && (
                          <div
                            className={
                              "flex items-center justify-between gap-4 rounded-lg px-2 py-1.5 " +
                              (riskScoreIsBest
                                ? "bg-emerald-500/[0.10] ring-1 ring-inset ring-emerald-400/20"
                                : "")
                            }
                          >
                            <span className={riskScoreIsBest ? "text-emerald-300" : "text-gray-600"}>
                              Ryzyko
                            </span>
                            <span className={riskScoreIsBest ? "text-right font-bold text-emerald-200" : "text-right font-medium text-gray-300"}>
                              {riskLabel(representative.riskLevel)}
                              {riskScoreIsBest && (
                                <span className="ml-2 text-[10px] uppercase tracking-wide text-emerald-300">
                                  ★ najniższe
                                </span>
                              )}
                            </span>
                          </div>
                        )}

                        {(!compareDifferencesOnly || compareStoreCountDiff) && (
                          <div className="flex items-center justify-between gap-4">
                            <span className="text-gray-600">Sklepy / źródła</span>
                            <span className="font-semibold text-white">
                              {family.storeCount}
                            </span>
                          </div>
                        )}

                        {(!compareDifferencesOnly || compareOfferCountDiff) && (
                          <div className="flex items-center justify-between gap-4">
                            <span className="text-gray-600">Oferty</span>
                            <span className="font-semibold text-white">
                              {family.offers.length}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ASARVO_RESULTS_UI_V4_7 — PREMIUM GRID + MODEL DEDUPE */}
          {otherProductFamilies.length > 0 && (
            <div className="mt-10 border-t border-white/[0.045] pt-8 sm:mt-12 sm:pt-10">
              <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-blue-400">
                    Więcej możliwości
                  </div>
                  <h2 className="mt-1 text-xl font-bold sm:text-2xl">
                    Inne pasujące produkty
                  </h2>
                  <p className="mt-1 text-xs text-gray-600">
                    Pozostałe modele pasujące do Twojego zapytania.
                  </p>
                </div>

                <div className="inline-flex w-fit rounded-full border border-blue-500/15 bg-blue-500/[0.04] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-blue-300">
                  {countLabel(otherProductFamilies.length, "produkt", "produkty", "produktów")}
                </div>
              </div>

              <div
                className={`grid gap-4 ${
                  otherProductFamilies.length === 1
                    ? "mx-auto max-w-4xl grid-cols-1"
                    : otherProductFamilies.length === 2
                      ? "md:grid-cols-2"
                      : "md:grid-cols-2 xl:grid-cols-6"
                }`}
              >
                {otherProductFamilies.map((family, familyIndex) => {
                  const representative = family.representative;
                  const familyCheapest = familyHasProduct(family, cheapestProduct);
                  const familySafest = familyHasProduct(family, safestProduct);
                  const displayCost =
                    family.lowestConfirmedTotal !== null
                      ? formatPrice(family.lowestConfirmedTotal)
                      : family.lowestPrice !== null
                        ? `od ${formatPrice(family.lowestPrice)}`
                        : "Cena nieznana";
                  const cardTitle = productFamilyUiIdentity(family);
                  const cardSpecs = productFamilyUiSpecs(family).slice(0, 4);

                  return (
                    <article
                      key={family.key}
                      className={`group relative flex h-full flex-col overflow-hidden rounded-[24px] border border-white/[0.08] bg-[linear-gradient(145deg,rgba(10,17,29,0.97),rgba(4,8,13,0.995))] p-5 shadow-[0_18px_58px_rgba(0,0,0,0.20)] ring-1 ring-inset ring-white/[0.016] transition duration-300 hover:-translate-y-1 hover:border-blue-400/35 hover:shadow-[0_30px_90px_rgba(37,99,235,0.13)] motion-reduce:transform-none motion-reduce:transition-none ${
                        otherProductFamilies.length === 1
                          ? "sm:p-6"
                          : otherProductFamilies.length > 2
                            ? `xl:col-span-2 ${
                                otherProductFamilies.length % 3 === 1 &&
                                familyIndex === otherProductFamilies.length - 1
                                  ? "xl:col-start-3"
                                  : otherProductFamilies.length % 3 === 2 &&
                                      familyIndex === otherProductFamilies.length - 2
                                    ? "xl:col-start-2"
                                    : ""
                              }`
                            : ""
                      }`}
                    >
                      <div className="pointer-events-none absolute -right-20 -top-20 h-48 w-48 rounded-full bg-blue-500/[0.055] blur-3xl" />

                      <div className="relative flex items-start gap-3 sm:gap-4">
                        <ProductVisual product={representative} label={cardTitle} compact />

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap gap-1.5">
                            {familyCheapest && (
                              <span className="rounded-full border border-amber-400/20 bg-amber-400/[0.07] px-2 py-1 text-[9px] font-semibold text-amber-300">
                                💰 NAJTAŃSZY Z WYNIKÓW
                              </span>
                            )}
                            {familySafest && (
                              <span className="rounded-full border border-cyan-400/20 bg-cyan-400/[0.07] px-2 py-1 text-[9px] font-semibold text-cyan-300">
                                🛡 BEZPIECZNY
                              </span>
                            )}
                            {typeof representative.dealScore === "number" && (
                              <span className="rounded-full border border-blue-400/15 bg-blue-500/[0.06] px-2 py-1 text-[9px] font-semibold text-blue-300">
                                ASARVO {representative.dealScore}/100
                              </span>
                            )}
                          </div>

                          {familyCheapest && productNeedsCaution(representative) && (
                            <div className="mt-2 inline-flex rounded-full border border-amber-400/15 bg-amber-400/[0.055] px-2 py-1 text-[9px] font-medium text-amber-200">
                              ⚠ sprawdź wiarygodność
                            </div>
                          )}

                          <h3
                            className="mt-2.5 line-clamp-2 min-h-[44px] text-[15px] font-bold leading-[1.32] tracking-[-0.01em] text-white sm:text-base"
                          >
                            {cardTitle}
                          </h3>

                          {cardSpecs.length > 0 && (
                            <div className="mt-2 flex max-h-[24px] flex-wrap gap-1 overflow-hidden">
                              {cardSpecs.map((spec) => (
                                <span
                                  key={spec}
                                  className="rounded-md border border-blue-400/12 bg-blue-500/[0.05] px-2 py-1 text-[9px] font-semibold leading-none text-blue-100/80"
                                >
                                  {spec}
                                </span>
                              ))}
                            </div>
                          )}

                          <div className="mt-2 flex min-w-0 flex-wrap items-center gap-1.5">
                            <span className="truncate text-[10px] font-medium text-blue-300/80">
                              {representative.store}
                            </span>
                            <span
                              className={`rounded-full border px-1.5 py-0.5 text-[7px] font-semibold uppercase tracking-[0.07em] ${sourceKindChipTone(
                                representative.store
                              )}`}
                            >
                              {sourceKindLabel(representative.store)}
                            </span>
                          </div>

                          <div className="mt-1.5 text-[22px] font-bold tracking-tight text-white sm:text-[26px]">
                            {displayCost}
                          </div>

                          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-gray-500">
                            {representative.delivery !== null && (
                              <>
                                <span className={representative.delivery === 0 ? "text-emerald-400" : "text-gray-500"}>
                                  {representative.delivery === 0 ? "Darmowa dostawa" : `Dostawa ${formatPrice(representative.delivery)}`}
                                </span>
                                <span>·</span>
                              </>
                            )}
                            <span>{countLabel(family.storeCount, "źródło", "źródła", "źródeł")}</span>
                            <span>·</span>
                            <span>{countLabel(family.offers.length, "oferta", "oferty", "ofert")}</span>
                            {family.colors.length > 0 && (
                              <>
                                <span>·</span>
                                <span>{countLabel(family.colors.length, "kolor", "kolory", "kolorów")}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="relative mt-4 flex flex-wrap gap-2 text-[10px]">
                        {(representative.condition || representative.assessedCondition === "new" || representative.assessedCondition === "used") && (
                          <span className="rounded-full border border-white/[0.07] bg-white/[0.025] px-2.5 py-1.5 text-gray-400">
                            {productConditionLabel(representative)}
                          </span>
                        )}
                        <span className="rounded-full border border-white/[0.07] bg-white/[0.025] px-2.5 py-1.5 text-gray-400">
                          {riskLabel(representative.riskLevel)}
                        </span>
                        {representative.originalityConfidence &&
                          representative.originalityConfidence !== "unknown" && (
                            <span className={`rounded-full border px-2.5 py-1.5 ${originalityChipTone(
                              representative.originalityConfidence
                            )}`}>
                              {originalityChipIcon(representative.originalityConfidence)}{" "}
                              {originalityUiLabel(representative.originalityConfidence)}
                            </span>
                          )}
                      </div>

                      <div className="relative mt-auto grid grid-cols-[minmax(0,1fr)_auto] gap-2 pt-4">
                        {representative.url ? (
                          <a
                            href={representative.url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-gradient-to-r from-blue-600 via-blue-500 to-cyan-500 px-4 py-2.5 text-xs font-bold text-white shadow-[0_10px_28px_rgba(37,99,235,0.18)] transition duration-300 hover:-translate-y-0.5 hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300/50 motion-reduce:transform-none"
                          >
                            Zobacz ofertę →
                          </a>
                        ) : (
                          <button className="min-h-10 rounded-xl bg-blue-500 px-4 py-2 text-xs font-bold text-white">
                            Zobacz produkt
                          </button>
                        )}

                        <button
                          type="button"
                          disabled={libraryActionBusyKey === `favorite:${productStorageKey(representative)}`}
                          onClick={() => void toggleFavorite(representative)}
                          aria-label={isFavorite(representative) ? "Usuń z ulubionych" : "Dodaj do ulubionych"}
                          className={`flex h-11 w-11 items-center justify-center rounded-xl border text-sm transition disabled:cursor-wait disabled:opacity-60 ${
                            isFavorite(representative)
                              ? "border-rose-500/30 bg-rose-500/[0.10] text-rose-200"
                              : "border-white/[0.08] bg-white/[0.025] text-gray-400 hover:bg-white/[0.06] hover:text-white"
                          }`}
                        >
                          {isFavorite(representative) ? "♥" : "♡"}
                        </button>
                      </div>

                      <div className="relative mt-2 grid grid-cols-1 gap-2 min-[420px]:grid-cols-2">
                        <button
                          type="button"
                          disabled={libraryActionBusyKey === `watch:${productStorageKey(representative)}`}
                          onClick={() =>
                            getPriceWatch(representative)
                              ? void removePriceWatch(representative)
                              : openPriceWatchEditor(representative)
                          }
                          className={`rounded-xl border px-3 py-2 text-[10px] font-medium transition disabled:cursor-wait disabled:opacity-60 ${
                            getPriceWatch(representative)
                              ? "border-amber-500/30 bg-amber-500/[0.10] text-amber-200"
                              : "border-white/[0.08] bg-white/[0.025] text-gray-400 hover:border-blue-300/[0.14] hover:bg-white/[0.055] hover:text-white"
                          }`}
                        >
                          🔔 {getPriceWatch(representative) ? "Obserwujesz" : "Obserwuj"}
                        </button>

                        <button
                          type="button"
                          onClick={() => toggleCompareFamily(family)}
                          className={`rounded-xl border px-3 py-2 text-[10px] font-medium transition ${
                            isFamilyCompared(family)
                              ? "border-blue-500/35 bg-blue-500/[0.12] text-blue-200"
                              : "border-white/[0.08] bg-white/[0.025] text-gray-400 hover:border-blue-300/[0.14] hover:bg-white/[0.055] hover:text-white"
                          }`}
                        >
                          {isFamilyCompared(family) ? "✓ W porównaniu" : "⇄ Porównaj"}
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          )}

          {/* LICZNIK */}
                    {/* ASARVO_SEARCH_CANCEL_V1_FIX2 */}
          {!searchWasCancelled && (
            productFamilies.length === 1 ? (
              <div
                data-asarvo-v6-single-copy="true"
                className="mx-auto mt-8 max-w-3xl rounded-2xl border border-blue-400/[0.08] bg-blue-500/[0.018] px-5 py-3.5 text-center"
              >
                <div className="text-sm font-semibold text-blue-100/90">
                  Nie znaleźliśmy drugiego modelu o porównywalnej jakości
                </div>
                <p className="mt-1 text-xs leading-5 text-gray-500">
                  ASARVO nie dodaje słabszych dopasowań tylko po to, żeby wydłużyć listę.
                  {filteredProducts.length > 1 && (
                    <> Ten model ma {countLabel(filteredProducts.length, "ofertę", "oferty", "ofert")} w aktualnych wynikach.</>
                  )}
                </p>
              </div>
            ) : (
              <div className="mt-8 flex justify-center">
                <div className="inline-flex flex-wrap items-center justify-center gap-x-2 gap-y-1 rounded-full border border-white/[0.06] bg-white/[0.018] px-4 py-2 text-xs text-gray-600">
                  <span>{countLabel(productFamilies.length, "produkt", "produkty", "produktów")}</span>
                  <span className="text-gray-800">·</span>
                  <span>{countLabel(filteredProducts.length, "oferta", "oferty", "ofert")}</span>
                  {totalStoreCount > 0 && (
                    <>
                      <span className="text-gray-800">·</span>
                      <span>{countLabel(totalStoreCount, "źródło", "źródła", "źródeł")}</span>
                    </>
                  )}
                </div>
              </div>
            )
          )}

        </section>

        {priceWatchEditor && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-5 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="price-watch-title"
          >
            <div className="w-full max-w-lg rounded-3xl border border-white/10 bg-[#0a0d14] p-6 shadow-2xl sm:p-7">
              <div className="flex items-start justify-between gap-5">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-300">
                    🔔 Monitoring ceny
                  </div>
                  <h2
                    id="price-watch-title"
                    className="mt-2 text-xl font-bold"
                  >
                    Ustaw cenę docelową
                  </h2>
                </div>

                <button
                  type="button"
                  onClick={closePriceWatchEditor}
                  className="rounded-lg border border-white/[0.08] px-3 py-2 text-sm text-gray-500 transition hover:text-white"
                >
                  ✕
                </button>
              </div>

              <div className="mt-5 rounded-2xl border border-white/[0.07] bg-black/20 p-4">
                <div className="line-clamp-2 font-medium text-gray-200">
                  {priceWatchEditor.product.name}
                </div>
                <div className="mt-2 text-sm text-gray-500">
                  {priceWatchEditor.product.store} · obecna cena{" "}
                  {formatPrice(priceWatchEditor.product.price)}
                </div>
              </div>

              <label className="mt-5 block">
                <span className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">
                  Powiadom mnie, gdy cena spadnie do
                </span>

                <div className="mt-2 flex items-center rounded-xl border border-white/10 bg-black/25 px-4 focus-within:border-amber-500/35">
                  <input
                    value={priceWatchEditor.targetPriceInput}
                    onChange={(event) => {
                      setPriceWatchError(null);
                      setPriceWatchEditor((current) =>
                        current
                          ? {
                              ...current,
                              targetPriceInput: event.target.value,
                            }
                          : null
                      );
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        void savePriceWatch();
                      }
                    }}
                    inputMode="decimal"
                    placeholder="Np. 2999"
                    className="min-h-14 min-w-0 flex-1 bg-transparent text-lg font-semibold outline-none placeholder:text-gray-700"
                  />
                  <span className="text-sm text-gray-500">zł</span>
                </div>
              </label>

              {priceWatchError && (
                <div className="mt-3 rounded-xl border border-red-500/20 bg-red-500/[0.06] px-4 py-3 text-sm text-red-200">
                  {priceWatchError}
                </div>
              )}

              <p className="mt-4 text-xs leading-5 text-gray-600">
                Obserwacja zapisze się na Twoim koncie ASARVO w Supabase.
                Automatyczne okresowe sprawdzanie i powiadomienia podłączymy
                w kolejnym etapie.
              </p>

              <div className="mt-6 flex gap-3">
                <button
                  type="button"
                  onClick={closePriceWatchEditor}
                  className="flex-1 rounded-xl border border-white/10 px-5 py-3 text-sm font-medium text-gray-400 transition hover:text-white"
                >
                  Anuluj
                </button>

                <button
                  type="button"
                  onClick={() => void savePriceWatch()}
                  disabled={
                    libraryActionBusyKey ===
                    `watch:${productStorageKey(priceWatchEditor.product)}`
                  }
                  className="flex-1 rounded-xl bg-amber-500 px-5 py-3 text-sm font-semibold text-black transition hover:bg-amber-400 disabled:cursor-wait disabled:opacity-60"
                >
                  Zapisz obserwację
                </button>
              </div>
            </div>
          </div>
        )}

        {/* STOPKA */}
        <footer className="border-t border-white/[0.06] py-7 text-center text-xs text-gray-600">
          ASARVO · Znajdź. Porównaj. Kup lepiej.
        </footer>

      </div>

    </main>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={null}>
      <SearchPageContent />
    </Suspense>
  );
}
