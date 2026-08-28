"use client";

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
      displayName: cleanFamilyDisplayName(representative),
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

  if (family.colors.length > 1) {
    pieces.push(`${family.colors.length} kolory`);
  } else if (family.colors.length === 1) {
    pieces.push(`kolor: ${family.colors[0]}`);
  }

  if (family.storeCount > 1) {
    pieces.push(`${family.storeCount} sklepy / źródła`);
  } else if (family.storeCount === 1) {
    pieces.push("1 sklep / źródło");
  }

  pieces.push(
    `${family.offers.length} ${
      family.offers.length === 1 ? "oferta" : "ofert"
    }`
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

type CachedSearchRequest = {
  createdAt: number;
  promise: Promise<SearchApiResponse>;
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

  if (cached && now - cached.createdAt < SEARCH_REQUEST_TTL_MS) {
    return cached.promise;
  }

  const promise = fetch("/api/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
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
  });

  setTimeout(() => {
    const entry = SEARCH_REQUEST_CACHE.get(key);

    if (entry?.promise === promise) {
      SEARCH_REQUEST_CACHE.delete(key);
    }
  }, SEARCH_REQUEST_TTL_MS);

  return promise;
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

  const [conditionFilter, setConditionFilter] =
    useState("Wszystkie");

  const [priceFilter, setPriceFilter] =
    useState("Wszystkie");

  const [deliveryFilter, setDeliveryFilter] =
    useState("Wszystkie");

  const [storeFilter, setStoreFilter] =
    useState("Wszystkie");

  const [ratingFilter, setRatingFilter] =
    useState("Wszystkie");

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
          setLoading(false);
        }

        return;
      }

      try {
        if (searchId === activeSearchIdRef.current) {
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

          setProducts(liveOffers);
          setSearchError(data.error || null);
        } else {
          setInterpretation(null);
          setProducts([]);
          setSearchError(data.error || "Nie udało się wyszukać ofert.");
        }
      } catch (error) {
        if (cancelled || searchId !== activeSearchIdRef.current) {
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
      if (
        priceFilter === "Do 100 zł" &&
        product.price !== null &&
        product.price > 100
      ) {
        return false;
      }

      if (
        priceFilter === "Do 200 zł" &&
        product.price !== null &&
        product.price > 200
      ) {
        return false;
      }

      if (
        priceFilter === "Do 500 zł" &&
        product.price !== null &&
        product.price > 500
      ) {
        return false;
      }

      if (
        priceFilter === "Do 1000 zł" &&
        product.price !== null &&
        product.price > 1000
      ) {
        return false;
      }

      if (
        priceFilter === "Do 2000 zł" &&
        product.price !== null &&
        product.price > 2000
      ) {
        return false;
      }

      if (
        priceFilter === "Do 4000 zł" &&
        product.price !== null &&
        product.price > 4000
      ) {
        return false;
      }

      // DOSTAWA
      if (
        deliveryFilter === "Darmowa" &&
        product.delivery !== 0
      ) {
        return false;
      }

      if (
        deliveryFilter === "Płatna" &&
        product.delivery === 0
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

  const otherProductFamilies = useMemo(
    () =>
      sortProductFamilies(
        productFamilies.filter(
          (family) =>
            !familyHasProduct(family, bestProduct)
        )
      ),
    [productFamilies, bestProduct]
  );

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
    return <AsarvoSearchLoader query={query} />;
  }

  return (
    <main className="min-h-screen bg-[#050505] text-white">

      <div className="pointer-events-none fixed left-1/2 top-[-300px] h-[600px] w-[900px] -translate-x-1/2 rounded-full bg-blue-600/[0.08] blur-[150px]" />

      <div className="relative mx-auto min-h-screen max-w-6xl px-5 sm:px-8">

        {/* HEADER */}
        <header className="flex items-center justify-between border-b border-white/[0.06] py-5">

          <a
            href="/"
            aria-label="ASARVO — strona główna"
            className="group inline-flex items-center gap-3"
          >
            <img
              src="/asarvo-mark.png"
              alt=""
              className="h-9 w-9 object-contain transition group-hover:scale-105"
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
            className="rounded-full border border-white/10 bg-white/[0.03] px-5 py-2 text-sm text-gray-300 transition hover:bg-white/[0.07] hover:text-white"
          >
            {!authReady
              ? "Konto"
              : isAuthenticated
                ? "Moje konto"
                : "Zaloguj się"}
          </a>

        </header>

        {/* WYSZUKIWARKA */}
        <div className="mt-7">

          <form
            action="/search"
            className="rounded-2xl border border-white/10 bg-white/[0.035] p-2 transition focus-within:border-blue-500/25"
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
                className="min-h-14 min-w-0 flex-1 bg-transparent px-4 text-base text-white outline-none placeholder:text-gray-600"
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
                className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border transition ${
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
                className="min-h-12 shrink-0 rounded-xl bg-blue-600 px-5 font-semibold transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40 sm:px-9"
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
        <section className="pb-20 pt-8">

          <p className="text-sm text-gray-500">
            Wyniki wyszukiwania dla:
          </p>

          <h1 className="mt-2 text-3xl font-bold sm:text-4xl">
            „{query}”
          </h1>

          {/* FILTRY */}
          <div className="mt-7 flex flex-wrap gap-3">

            <select
              value={conditionFilter}
              onChange={(e) =>
                setConditionFilter(e.target.value)
              }
              className="cursor-pointer rounded-full border border-white/10 bg-[#0c0c0c] px-5 py-3 text-sm text-gray-300 outline-none"
            >
              <option>Wszystkie</option>
              <option>Nowy</option>
              <option>Używany</option>
            </select>

            <select
              value={priceFilter}
              onChange={(e) =>
                setPriceFilter(e.target.value)
              }
              className="cursor-pointer rounded-full border border-white/10 bg-[#0c0c0c] px-5 py-3 text-sm text-gray-300 outline-none"
            >
              <option>Wszystkie</option>
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
              className="cursor-pointer rounded-full border border-white/10 bg-[#0c0c0c] px-5 py-3 text-sm text-gray-300 outline-none"
            >
              <option>Wszystkie</option>
              <option>Darmowa</option>
              <option>Płatna</option>
            </select>

            <select
              value={storeFilter}
              onChange={(e) =>
                setStoreFilter(e.target.value)
              }
              className="cursor-pointer rounded-full border border-white/10 bg-[#0c0c0c] px-5 py-3 text-sm text-gray-300 outline-none"
            >
              <option>Wszystkie</option>
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
              className="cursor-pointer rounded-full border border-white/10 bg-[#0c0c0c] px-5 py-3 text-sm text-gray-300 outline-none"
            >
              <option>Wszystkie</option>
              <option>4+</option>
              <option>4.5+</option>
              <option>4.8+</option>
            </select>

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

          {/* NAJLEPSZA OFERTA */}
          {bestProduct ? (
            <div className="mt-7 overflow-hidden rounded-3xl border border-blue-500/40 bg-[#080d17] shadow-[0_20px_80px_rgba(37,99,235,0.08)]">

              <div className="border-b border-white/[0.06] bg-blue-500/[0.04] px-7 py-4 sm:px-8">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex rounded-full border border-blue-500/20 bg-blue-500/[0.10] px-4 py-2 text-xs font-semibold text-blue-300">
                    🏆 NAJLEPSZA OFERTA
                  </span>

                  {typeof bestProduct.dealScore === "number" && (
                    <span className="inline-flex rounded-full border border-emerald-500/20 bg-emerald-500/[0.08] px-4 py-2 text-xs font-semibold text-emerald-300">
                      ASARVO Score {bestProduct.dealScore}/100
                    </span>
                  )}

                  {bestProduct.id === cheapestProduct?.id && (
                    <span className="inline-flex rounded-full border border-amber-500/20 bg-amber-500/[0.08] px-4 py-2 text-xs font-semibold text-amber-300">
                      💰 {cheapestHasConfirmedTotal ? "NAJTAŃSZY KOSZT" : "NAJNIŻSZA CENA"}
                    </span>
                  )}

                  {bestProduct.safestOffer && (
                    <span className="inline-flex rounded-full border border-cyan-500/20 bg-cyan-500/[0.08] px-4 py-2 text-xs font-semibold text-cyan-300">
                      🛡️ NAJBEZPIECZNIEJSZA
                    </span>
                  )}
                </div>
              </div>

              <div className="p-7 sm:p-8">
                <div className="flex flex-col justify-between gap-8 lg:flex-row">

                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-gray-500">
                      🏪 {bestProduct.store}
                    </div>

                    <h2 className="mt-3 text-2xl font-bold leading-tight sm:text-3xl">
                      {bestProductFamily?.displayName ?? bestProduct.name}
                    </h2>

                    {familyVariantSummary(bestProductFamily) && (
                      <div className="mt-3 inline-flex rounded-full border border-violet-500/20 bg-violet-500/[0.07] px-3 py-1.5 text-xs font-medium text-violet-300">
                        ◈ {familyVariantSummary(bestProductFamily)}
                      </div>
                    )}

                    <div className="mt-5 flex flex-wrap gap-2 text-xs">
                      <span className="rounded-full border border-emerald-500/15 bg-emerald-500/[0.06] px-3 py-1.5 text-emerald-300">
                        ✓ {originalityLabel(
                          bestProduct.originalityConfidence ?? "unknown"
                        )}
                      </span>

                      <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-gray-300">
                        {productConditionLabel(bestProduct)}
                      </span>

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

                    {bestProduct.aiReason && (
                      <div className="mt-6 max-w-3xl rounded-2xl border border-white/[0.06] bg-black/20 p-4">
                        <div className="text-xs font-semibold uppercase tracking-wide text-blue-400">
                          Dlaczego ASARVO wybrało tę ofertę?
                        </div>
                        <p className="mt-2 text-sm leading-6 text-gray-400">
                          {bestProduct.aiReason}
                        </p>
                      </div>
                    )}

                    <div className="mt-6 grid max-w-3xl grid-cols-2 gap-3 sm:grid-cols-4">
                      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                        <div className="text-[11px] text-gray-600">
                          Dopasowanie
                        </div>
                        <div className="mt-1 font-semibold">
                          {typeof bestProduct.matchScore === "number"
                            ? `${bestProduct.matchScore}/100`
                            : "—"}
                        </div>
                      </div>

                      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                        <div className="text-[11px] text-gray-600">
                          Cena
                        </div>
                        <div className="mt-1 font-semibold">
                          {typeof bestProduct.priceScore === "number"
                            ? `${bestProduct.priceScore}/100`
                            : "—"}
                        </div>
                      </div>

                      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                        <div className="text-[11px] text-gray-600">
                          Źródło
                        </div>
                        <div className="mt-1 font-semibold">
                          {typeof bestProduct.sourceConfidence === "number"
                            ? `${bestProduct.sourceConfidence}/100`
                            : "—"}
                        </div>
                      </div>

                      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                        <div className="text-[11px] text-gray-600">
                          Ryzyko
                        </div>
                        <div className="mt-1 font-semibold">
                          {typeof bestProduct.riskScore === "number"
                            ? `${bestProduct.riskScore}/100`
                            : "—"}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="shrink-0 lg:min-w-[260px]">
                    <div className="rounded-2xl border border-white/[0.08] bg-black/20 p-5">
                      <div className="flex items-center justify-between gap-6 text-sm">
                        <span className="text-gray-500">Cena produktu</span>
                        <span className="font-semibold text-white">
                          {formatPrice(bestProduct.price)}
                        </span>
                      </div>

                      <div className="mt-3 flex items-center justify-between gap-6 text-sm">
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

                      <div className="flex items-end justify-between gap-6">
                        <div>
                          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-blue-400">
                            Razem
                          </div>
                          {getPurchaseTotal(bestProduct) === null && (
                            <div className="mt-1 text-[10px] text-gray-600">
                              bez potwierdzonej dostawy
                            </div>
                          )}
                        </div>
                        <div className="text-3xl font-bold tracking-tight text-white">
                          {purchaseTotalLabel(bestProduct)}
                        </div>
                      </div>
                    </div>

                    {bestProduct.url ? (
                      <a
                        href={bestProduct.url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-4 inline-flex w-full items-center justify-center rounded-xl bg-blue-600 px-6 py-3 font-semibold transition hover:bg-blue-500"
                      >
                        Zobacz ofertę ↗
                      </a>
                    ) : (
                      <button className="mt-4 w-full rounded-xl bg-blue-600 px-6 py-3 font-semibold">
                        Zobacz ofertę
                      </button>
                    )}

                    <button
                      type="button"
                      disabled={
                        libraryActionBusyKey ===
                        `favorite:${productStorageKey(bestProduct)}`
                      }
                      onClick={() => void toggleFavorite(bestProduct)}
                      className={`mt-2 inline-flex w-full items-center justify-center rounded-xl border px-6 py-3 text-sm font-medium transition disabled:cursor-wait disabled:opacity-60 ${
                        isFavorite(bestProduct)
                          ? "border-rose-500/30 bg-rose-500/[0.10] text-rose-200"
                          : "border-white/10 bg-white/[0.025] text-gray-300 hover:bg-white/[0.06] hover:text-white"
                      }`}
                    >
                      {isFavorite(bestProduct)
                        ? "♥ Zapisano w ulubionych"
                        : "♡ Dodaj do ulubionych"}
                    </button>

                    <button
                      type="button"
                      disabled={
                        libraryActionBusyKey ===
                        `watch:${productStorageKey(bestProduct)}`
                      }
                      onClick={() =>
                        getPriceWatch(bestProduct)
                          ? void removePriceWatch(bestProduct)
                          : openPriceWatchEditor(bestProduct)
                      }
                      className={`mt-2 inline-flex w-full items-center justify-center rounded-xl border px-6 py-3 text-sm font-medium transition disabled:cursor-wait disabled:opacity-60 ${
                        getPriceWatch(bestProduct)
                          ? "border-amber-500/30 bg-amber-500/[0.10] text-amber-200"
                          : "border-white/10 bg-white/[0.025] text-gray-300 hover:bg-white/[0.06] hover:text-white"
                      }`}
                    >
                      {getPriceWatch(bestProduct)
                        ? "🔔 Obserwowana — wyłącz"
                        : "🔔 Obserwuj cenę"}
                    </button>
                  </div>

                </div>
              </div>
            </div>
          ) : (
            <div className="mt-7 overflow-hidden rounded-3xl border border-blue-500/20 bg-gradient-to-b from-blue-500/[0.06] via-[#080c14] to-[#06080d] shadow-[0_24px_90px_rgba(37,99,235,0.08)]">
              <div className="border-b border-white/[0.06] px-6 py-7 sm:px-9 sm:py-8">
                <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-blue-400/20 bg-blue-500/[0.08] text-2xl shadow-[0_0_35px_rgba(59,130,246,0.10)]">
                    ✦
                  </div>

                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-blue-400">
                      ASARVO — wynik zweryfikowany
                    </div>

                    <h2 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
                      Nie znaleźliśmy oferty spełniającej wszystkie wymagania
                    </h2>

                    <p className="mt-3 max-w-3xl text-sm leading-6 text-gray-400">
                      Nie pokazujemy przypadkowych produktów tylko po to, żeby zapełnić wyniki.
                      Jeśli ASARVO nie może potwierdzić zgodności oferty z Twoim zapytaniem,
                      bezpieczniej jest jej nie pokazać.
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid gap-6 p-6 sm:p-9 lg:grid-cols-[1.1fr_0.9fr]">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
                    Rozpoznane wymagania
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {interpretation?.product && (
                      <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-xs text-gray-300">
                        Produkt: {interpretation.product}
                      </span>
                    )}

                    {interpretation?.brand && (
                      <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-xs text-gray-300">
                        Marka: {interpretation.brand}
                      </span>
                    )}

                    {interpretation?.model && (
                      <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-xs text-gray-300">
                        Model: {interpretation.model}
                      </span>
                    )}

                    {interpretation?.platform && (
                      <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-xs text-gray-300">
                        Platforma: {interpretation.platform}
                      </span>
                    )}

                    {interpretation?.condition && (
                      <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-xs text-gray-300">
                        Stan: {interpretation.condition === "new" ? "nowy" : "używany"}
                      </span>
                    )}

                    {interpretation?.original === true && (
                      <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-xs text-gray-300">
                        Oryginalny
                      </span>
                    )}

                    {interpretation?.maxPrice !== null &&
                      interpretation?.maxPrice !== undefined && (
                        <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-xs text-gray-300">
                          Budżet: do {interpretation.maxPrice} zł
                        </span>
                      )}

                    {!interpretation && (
                      <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-xs text-gray-500">
                        Nie udało się potwierdzić parametrów zapytania.
                      </span>
                    )}
                  </div>

                  <div className="mt-7 text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
                    Co możesz zrobić
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
                    <div className="rounded-2xl border border-white/[0.07] bg-black/20 p-4">
                      <div className="text-sm font-semibold text-white">
                        1. Doprecyzuj model
                      </div>
                      <p className="mt-2 text-xs leading-5 text-gray-500">
                        Dodaj dokładną markę, model lub wariant, jeśli ich brakuje.
                      </p>
                    </div>

                    <div className="rounded-2xl border border-white/[0.07] bg-black/20 p-4">
                      <div className="text-sm font-semibold text-white">
                        2. Sprawdź budżet
                      </div>
                      <p className="mt-2 text-xs leading-5 text-gray-500">
                        Jeśli cena jest bardzo ograniczona, spróbuj lekko zwiększyć maksymalny budżet.
                      </p>
                    </div>

                    <div className="rounded-2xl border border-white/[0.07] bg-black/20 p-4">
                      <div className="text-sm font-semibold text-white">
                        3. Zmień wymaganie
                      </div>
                      <p className="mt-2 text-xs leading-5 text-gray-500">
                        Zmień tylko parametr, z którego naprawdę możesz zrezygnować.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-blue-500/15 bg-blue-500/[0.035] p-5 sm:p-6">
                  <div className="text-sm font-semibold text-white">
                    Popraw wyszukiwanie
                  </div>

                  <p className="mt-2 text-xs leading-5 text-gray-500">
                    Zmień zapytanie poniżej i ASARVO ponownie sprawdzi rynek.
                  </p>

                  <form action="/search" className="mt-5">
                    <label
                      htmlFor="asarvo-zero-query"
                      className="text-[11px] font-medium uppercase tracking-[0.16em] text-gray-600"
                    >
                      Twoje zapytanie
                    </label>

                    <textarea
                      id="asarvo-zero-query"
                      name="q"
                      defaultValue={query}
                      rows={4}
                      className="mt-2 w-full resize-none rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm leading-6 text-white outline-none transition placeholder:text-gray-700 focus:border-blue-500/40 focus:ring-2 focus:ring-blue-500/10"
                      placeholder="Np. oryginalny pad do PS4, używany, do 250 zł"
                    />

                    <button
                      type="submit"
                      className="mt-3 inline-flex w-full items-center justify-center rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-500"
                    >
                      Szukaj ponownie
                    </button>
                  </form>

                  <a
                    href="/"
                    className="mt-3 inline-flex w-full items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.02] px-5 py-3 text-sm font-medium text-gray-400 transition hover:bg-white/[0.05] hover:text-white"
                  >
                    Zacznij nowe wyszukiwanie
                  </a>

                  <p className="mt-4 text-center text-[11px] leading-5 text-gray-600">
                    ASARVO nie osłabia Twoich wymagań automatycznie.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* PRODUCT → VARIANTS → OFFERS: OFERTY TEGO PRODUKTU */}
          {bestProduct && bestProductFamily && (
            <div className="mt-4 overflow-hidden rounded-3xl border border-white/[0.08] bg-white/[0.012]">
              <div className="flex flex-col gap-4 border-b border-white/[0.06] px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-400">
                    PRODUCT → VARIANTS → OFFERS
                  </div>
                  <h2 className="mt-1 text-lg font-bold">
                    Porównaj oferty tego produktu
                  </h2>
                  <p className="mt-1 text-xs text-gray-600">
                    Jeden produkt, warianty i oferty z różnych źródeł — bez powielania tych samych kart.
                  </p>
                </div>

                <div className="flex flex-wrap gap-2 sm:justify-end">
                  {bestProductFamily.colors.length > 0 && (
                    <span className="rounded-full border border-violet-500/20 bg-violet-500/[0.06] px-3 py-1.5 text-[10px] font-semibold text-violet-300">
                      ◈ {bestProductFamily.colors.length}{" "}
                      {bestProductFamily.colors.length === 1
                        ? "kolor"
                        : "kolory"}
                    </span>
                  )}

                  <span className="rounded-full border border-blue-500/15 bg-blue-500/[0.05] px-3 py-1.5 text-[10px] font-semibold text-blue-300">
                    🏪 {bestProductFamily.storeCount}{" "}
                    {bestProductFamily.storeCount === 1
                      ? "źródło"
                      : "źródła / sklepy"}
                  </span>

                  <span className="rounded-full border border-white/[0.08] bg-white/[0.025] px-3 py-1.5 text-[10px] text-gray-400">
                    {bestProductFamily.offers.length}{" "}
                    {bestProductFamily.offers.length === 1
                      ? "oferta"
                      : "ofert"}
                  </span>
                </div>
              </div>

              {bestProductFamily.colors.length > 0 && (
                <div className="border-b border-white/[0.05] px-6 py-4">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-600">
                    Rozpoznane warianty kolorystyczne
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {bestProductFamily.colors.map((color) => (
                      <span
                        key={color}
                        className="rounded-full border border-violet-500/15 bg-violet-500/[0.045] px-3 py-1.5 text-xs text-violet-200"
                      >
                        {color}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="divide-y divide-white/[0.055]">
                {bestProductFamily.storeOffers.map((storeOffer) => {
                  const offer = storeOffer.costRepresentative;
                  const isBest = storeOfferHasProduct(
                    storeOffer,
                    bestProduct
                  );
                  const isCheapest = storeOfferHasProduct(
                    storeOffer,
                    cheapestProduct
                  );
                  const isSafest = storeOfferHasProduct(
                    storeOffer,
                    safestProduct
                  );
                  const sourceKind = sourceKindLabel(storeOffer.store);

                  return (
                    <div key={storeOffer.key} className="px-5 py-5 sm:px-6">
                      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto_auto] lg:items-center">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-semibold text-white">
                              🏪 {storeOffer.store}
                            </span>

                            <span
                              className={`rounded-full border px-2.5 py-1 text-[9px] font-semibold ${
                                sourceKind === "Marketplace"
                                  ? "border-violet-500/20 bg-violet-500/[0.06] text-violet-300"
                                  : sourceKind === "Sklep"
                                    ? "border-emerald-500/15 bg-emerald-500/[0.05] text-emerald-300"
                                    : "border-white/[0.08] bg-white/[0.025] text-gray-500"
                              }`}
                            >
                              {sourceKind}
                            </span>

                            {isBest && (
                              <span className="rounded-full border border-blue-500/20 bg-blue-500/[0.08] px-2.5 py-1 text-[9px] font-semibold text-blue-300">
                                🏆 NAJLEPSZA
                              </span>
                            )}

                            {isCheapest && (
                              <span className="rounded-full border border-amber-500/20 bg-amber-500/[0.07] px-2.5 py-1 text-[9px] font-semibold text-amber-300">
                                💰 NAJTANIEJ
                              </span>
                            )}

                            {isSafest && (
                              <span className="rounded-full border border-cyan-500/20 bg-cyan-500/[0.07] px-2.5 py-1 text-[9px] font-semibold text-cyan-300">
                                🛡️ NAJBEZPIECZNIEJ
                              </span>
                            )}
                          </div>

                          <div className="mt-2 text-base font-medium text-gray-200">
                            {compactListingName(
                              offer,
                              bestProductFamily.displayName
                            )}
                          </div>

                          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
                            <span>{productConditionLabel(offer)}</span>
                            <span>{riskLabel(offer.riskLevel)}</span>

                            {storeOffer.colors.length > 0 && (
                              <span className="text-violet-300/70">
                                {storeOffer.colors.length === 1
                                  ? `Kolor: ${storeOffer.colors[0]}`
                                  : `Kolory: ${storeOffer.colors.join(" · ")}`}
                              </span>
                            )}

                            <span>
                              {storeOffer.offers.length}{" "}
                              {storeOffer.offers.length === 1
                                ? "oferta"
                                : "oferty"}{" "}
                              w tym źródle
                            </span>
                          </div>
                        </div>

                        <div className="min-w-[210px] rounded-2xl border border-white/[0.06] bg-black/15 px-4 py-3">
                          <div className="flex items-center justify-between gap-5 text-xs">
                            <span className="text-gray-600">Produkt</span>
                            <span className="font-medium text-gray-300">
                              {formatPrice(
                                storeOffer.lowestPrice ?? offer.price
                              )}
                            </span>
                          </div>

                          <div className="mt-2 flex items-center justify-between gap-5 text-xs">
                            <span className="text-gray-600">Dostawa</span>
                            <span
                              className={
                                offer.delivery === null
                                  ? "font-medium text-amber-300"
                                  : offer.delivery === 0
                                    ? "font-medium text-emerald-300"
                                    : "font-medium text-gray-300"
                              }
                            >
                              {deliveryCostLabel(offer.delivery)}
                            </span>
                          </div>

                          <div className="mt-3 border-t border-white/[0.06] pt-3">
                            <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-blue-400">
                              Razem
                            </div>
                            <div className="mt-1 text-lg font-bold">
                              {storeOffer.lowestConfirmedTotal !== null
                                ? formatPrice(
                                    storeOffer.lowestConfirmedTotal
                                  )
                                : storeOffer.lowestPrice !== null
                                  ? `od ${formatPrice(
                                      storeOffer.lowestPrice
                                    )}`
                                  : purchaseTotalLabel(offer)}
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-col gap-2 lg:items-end">
                          {offer.url ? (
                            <a
                              href={offer.url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex w-full items-center justify-center rounded-xl border border-white/10 px-5 py-3 text-sm font-medium transition hover:bg-white/[0.05] lg:w-auto"
                            >
                              Zobacz ↗
                            </a>
                          ) : (
                            <button className="inline-flex w-full items-center justify-center rounded-xl border border-white/10 px-5 py-3 text-sm font-medium transition hover:bg-white/[0.05] lg:w-auto">
                              Zobacz
                            </button>
                          )}

                          <div className="flex w-full gap-2 lg:w-auto">
                            <button
                              type="button"
                              onClick={() => void toggleFavorite(offer)}
                              className={`flex-1 rounded-xl border px-3 py-2 text-xs font-medium transition ${
                                isFavorite(offer)
                                  ? "border-rose-500/25 bg-rose-500/[0.09] text-rose-200"
                                  : "border-white/[0.08] bg-white/[0.02] text-gray-400 hover:text-white"
                              }`}
                            >
                              {isFavorite(offer) ? "♥" : "♡"} Ulubione
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                getPriceWatch(offer)
                                  ? void removePriceWatch(offer)
                                  : openPriceWatchEditor(offer)
                              }
                              className={`flex-1 rounded-xl border px-3 py-2 text-xs font-medium transition ${
                                getPriceWatch(offer)
                                  ? "border-amber-500/25 bg-amber-500/[0.09] text-amber-200"
                                  : "border-white/[0.08] bg-white/[0.02] text-gray-400 hover:text-white"
                              }`}
                            >
                              🔔 {getPriceWatch(offer) ? "Obserwujesz" : "Obserwuj"}
                            </button>
                          </div>
                        </div>
                      </div>

                      {storeOffer.offers.length > 1 && (
                        <details className="group mt-4 rounded-2xl border border-white/[0.055] bg-black/10">
                          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-3 text-xs font-medium text-gray-400 transition hover:text-white">
                            <span>
                              Pokaż wszystkie {storeOffer.offers.length} oferty z{" "}
                              {storeOffer.store}
                            </span>
                            <span className="text-gray-600 transition group-open:rotate-180">
                              ▾
                            </span>
                          </summary>

                          <div className="border-t border-white/[0.05]">
                            {storeOffer.offers
                              .slice()
                              .sort((a, b) => {
                                const totalA =
                                  getPurchaseTotal(a) ?? a.price ?? Infinity;
                                const totalB =
                                  getPurchaseTotal(b) ?? b.price ?? Infinity;
                                return totalA - totalB;
                              })
                              .map((listing, listingIndex) => (
                                <div
                                  key={`${storeOffer.key}-${listing.id}-${listingIndex}`}
                                  className="grid gap-3 border-b border-white/[0.045] px-4 py-4 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                                >
                                  <div className="min-w-0">
                                    <div className="text-sm font-medium text-gray-300">
                                      {compactListingName(
                                        listing,
                                        bestProductFamily.displayName
                                      )}
                                    </div>

                                    <div className="mt-1 line-clamp-2 text-xs leading-5 text-gray-600">
                                      Tytuł źródłowy: {listing.name}
                                    </div>

                                    <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-gray-500">
                                      {listingVariantLabel(listing) && (
                                        <span className="rounded-full border border-violet-500/15 bg-violet-500/[0.04] px-2 py-1 text-violet-300/80">
                                          {listingVariantLabel(listing)}
                                        </span>
                                      )}

                                      <span className="rounded-full border border-white/[0.06] bg-white/[0.02] px-2 py-1">
                                        {productConditionLabel(listing)}
                                      </span>

                                      <span className="rounded-full border border-white/[0.06] bg-white/[0.02] px-2 py-1">
                                        {deliveryCostLabel(listing.delivery)}
                                      </span>
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-3 sm:justify-end">
                                    <div className="text-right">
                                      <div className="text-sm font-bold text-white">
                                        {getPurchaseTotal(listing) !== null
                                          ? formatPrice(
                                              getPurchaseTotal(listing)
                                            )
                                          : listing.price !== null
                                            ? `od ${formatPrice(listing.price)}`
                                            : "Cena nieznana"}
                                      </div>
                                      <div className="mt-0.5 text-[10px] text-gray-600">
                                        {getPurchaseTotal(listing) !== null
                                          ? "łącznie"
                                          : "bez potwierdzonej dostawy"}
                                      </div>
                                    </div>

                                    {listing.url && (
                                      <a
                                        href={listing.url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="inline-flex shrink-0 items-center justify-center rounded-lg border border-white/[0.08] px-3 py-2 text-xs font-medium text-gray-300 transition hover:bg-white/[0.05] hover:text-white"
                                      >
                                        Otwórz ↗
                                      </a>
                                    )}

                                    <button
                                      type="button"
                                      onClick={() => void toggleFavorite(listing)}
                                      title={
                                        isFavorite(listing)
                                          ? "Usuń z ulubionych"
                                          : "Dodaj do ulubionych"
                                      }
                                      className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border text-sm transition ${
                                        isFavorite(listing)
                                          ? "border-rose-500/25 bg-rose-500/[0.09] text-rose-200"
                                          : "border-white/[0.08] text-gray-500 hover:text-white"
                                      }`}
                                    >
                                      {isFavorite(listing) ? "♥" : "♡"}
                                    </button>

                                    <button
                                      type="button"
                                      onClick={() =>
                                        getPriceWatch(listing)
                                          ? void removePriceWatch(listing)
                                          : openPriceWatchEditor(listing)
                                      }
                                      title={
                                        getPriceWatch(listing)
                                          ? "Wyłącz obserwowanie ceny"
                                          : "Obserwuj cenę"
                                      }
                                      className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border text-sm transition ${
                                        getPriceWatch(listing)
                                          ? "border-amber-500/25 bg-amber-500/[0.09] text-amber-200"
                                          : "border-white/[0.08] text-gray-500 hover:text-white"
                                      }`}
                                    >
                                      🔔
                                    </button>
                                  </div>
                                </div>
                              ))}
                          </div>
                        </details>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* SZYBKIE WYRÓŻNIENIA */}
          {bestProduct && (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">

              {cheapestProduct && (
                <div className="rounded-2xl border border-amber-500/15 bg-amber-500/[0.035] p-5">
                  <div className="text-xs font-semibold text-amber-300">
                    💰 {cheapestHasConfirmedTotal
                      ? "NAJTAŃSZY POTWIERDZONY KOSZT ZAKUPU"
                      : "NAJNIŻSZA CENA PRODUKTU"}
                  </div>
                  <div className="mt-2 line-clamp-1 font-medium">
                    {cheapestProductFamily?.displayName ?? cheapestProduct.name}
                  </div>

                  <div className="mt-4 grid grid-cols-3 gap-2">
                    <div className="rounded-xl border border-white/[0.06] bg-black/15 p-3">
                      <div className="text-[10px] uppercase tracking-wide text-gray-600">Produkt</div>
                      <div className="mt-1 text-sm font-semibold">
                        {formatPrice(cheapestProduct.price)}
                      </div>
                    </div>
                    <div className="rounded-xl border border-white/[0.06] bg-black/15 p-3">
                      <div className="text-[10px] uppercase tracking-wide text-gray-600">Dostawa</div>
                      <div className="mt-1 text-sm font-semibold">
                        {deliveryCostLabel(cheapestProduct.delivery)}
                      </div>
                    </div>
                    <div className="rounded-xl border border-amber-500/15 bg-amber-500/[0.05] p-3">
                      <div className="text-[10px] uppercase tracking-wide text-amber-400/70">Razem</div>
                      <div className="mt-1 text-sm font-bold text-amber-200">
                        {purchaseTotalLabel(cheapestProduct)}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 flex items-end justify-between gap-4">
                    <div className="text-xs text-gray-600">
                      {typeof cheapestProduct.dealScore === "number"
                        ? `ASARVO Score ${cheapestProduct.dealScore}/100`
                        : cheapestProduct.store}
                      {" • "}
                      {riskLabel(cheapestProduct.riskLevel)}
                    </div>
                    {cheapestProduct.url && (
                      <a
                        href={cheapestProduct.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm font-medium text-amber-300 hover:text-amber-200"
                      >
                        Zobacz ↗
                      </a>
                    )}
                  </div>
                </div>
              )}

              {safestProduct && (
                <div className="rounded-2xl border border-cyan-500/15 bg-cyan-500/[0.035] p-5">
                  <div className="text-xs font-semibold text-cyan-300">
                    🛡️ NAJBEZPIECZNIEJSZA
                  </div>
                  <div className="mt-2 line-clamp-1 font-medium">
                    {safestProductFamily?.displayName ?? safestProduct.name}
                  </div>
                  <div className="mt-3 flex items-end justify-between gap-4">
                    <div>
                      <div className="text-2xl font-bold">
                        {purchaseTotalLabel(safestProduct)}
                      </div>
                      <div className="mt-1 text-xs text-gray-600">
                        {getPurchaseTotal(safestProduct) !== null ? "łącznie z dostawą • " : "cena od • "}
                        {riskLabel(safestProduct.riskLevel)}
                      </div>
                    </div>
                    {safestProduct.url && (
                      <a
                        href={safestProduct.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm font-medium text-cyan-300 hover:text-cyan-200"
                      >
                        Zobacz ↗
                      </a>
                    )}
                  </div>
                </div>
              )}

            </div>
          )}

          {/* KOD RABATOWY */}
          {bestProduct && couponLoading && (
            <div className="mt-6 rounded-2xl border border-white/[0.06] bg-white/[0.015] p-5">
              <div className="flex items-center gap-3">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/10 border-t-emerald-400" />
                <div>
                  <div className="text-sm font-medium">
                    Szukamy aktualnych kodów rabatowych...
                  </div>
                  <div className="mt-1 text-xs text-gray-600">
                    Sprawdzamy internetowe źródła promocji.
                  </div>
                </div>
              </div>
            </div>
          )}

          {bestProduct && bestDiscount && discountedPrice !== null && (
            <div className="mt-6 overflow-hidden rounded-3xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/[0.08] to-transparent">

              <div className="p-6 sm:p-7">

                <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">

                  <div>

                    <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/[0.08] px-4 py-2 text-xs font-semibold text-emerald-400">
                      🏷️ ZNALEZIONO KOD RABATOWY
                    </div>

                    <h2 className="mt-4 text-xl font-bold sm:text-2xl">
                      Możesz zapłacić mniej
                    </h2>

                    <p className="mt-2 text-sm leading-6 text-gray-400">
                      Kod pasuje do sklepu{" "}
                      <span className="font-medium text-gray-300">
                        {bestDiscount.store}
                      </span>{" "}
                      i może obniżyć cenę tego zakupu.
                    </p>

                  </div>

                  <div className="shrink-0 text-left sm:text-right">

                    <div className="text-3xl font-bold text-emerald-400">
                      -{bestDiscount.discountPercent}%
                    </div>

                    <div className="mt-1 text-xs text-gray-500">
                      rabatu
                    </div>

                  </div>

                </div>

                {/* KOD */}
                <div className="mt-6 rounded-2xl border border-white/10 bg-black/20 p-4">

                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">

                    <div>

                      <div className="text-xs text-gray-500">
                        KOD RABATOWY
                      </div>

                      <div className="mt-1 font-mono text-2xl font-bold tracking-wider text-white">
                        {bestDiscount.code}
                      </div>

                    </div>

                    <button
                      onClick={() =>
                        handleCopyCode(bestDiscount.code)
                      }
                      className="rounded-xl bg-emerald-500 px-6 py-3 font-semibold text-black transition hover:bg-emerald-400 active:scale-[0.98]"
                    >
                      {copiedCode === bestDiscount.code
                        ? "✓ Skopiowano"
                        : "Kopiuj kod"}
                    </button>

                  </div>

                </div>

                {/* CENA PO RABACIE */}
                <div className="mt-5 grid gap-3 sm:grid-cols-3">

                  <div className="rounded-2xl border border-white/[0.06] bg-black/10 p-4">

                    <div className="text-xs text-gray-500">
                      Cena produktu
                    </div>

                    <div className="mt-1 text-lg font-semibold">
                      {formatPrice(bestProduct.price)}
                    </div>

                  </div>

                  <div className="rounded-2xl border border-white/[0.06] bg-black/10 p-4">

                    <div className="text-xs text-gray-500">
                      Oszczędzasz
                    </div>

                    <div className="mt-1 text-lg font-semibold text-emerald-400">
                      -
                      {(
                        (bestProduct.price ?? 0) -
                        discountedPrice
                      )
                        .toFixed(2)
                        .replace(".", ",")}{" "}
                      zł
                    </div>

                  </div>

                  <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.06] p-4">

                    <div className="text-xs text-emerald-400">
                      Cena po rabacie
                    </div>

                    <div className="mt-1 text-xl font-bold text-emerald-400">
                      {discountedPrice
                        .toFixed(2)
                        .replace(".", ",")}{" "}
                      zł
                    </div>

                  </div>

                </div>

                {/* WARUNKI */}
                <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-xs text-gray-500">

                  <span>
                    ✓ Min. zamówienie:{" "}
                    {bestDiscount.minPrice !== null ? `${bestDiscount.minPrice} zł` : "brak danych"}
                  </span>

                  <span>
                    ✓ Ważny do:{" "}
                    {bestDiscount.expires ?? "brak danych"}
                  </span>

                  <span>
                    ✓ {bestDiscount.description}
                  </span>

                  {bestDiscount.sourceUrl && (
                    <a
                      href={bestDiscount.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-emerald-400 hover:text-emerald-300"
                    >
                      ↗ {bestDiscount.sourceTitle}
                    </a>
                  )}

                </div>

              </div>

            </div>
          )}

          {/* BRAK KODU */}
          {bestProduct && !bestDiscount && !couponLoading && (
            <div className="mt-6 rounded-2xl border border-white/[0.06] bg-white/[0.015] p-5">

              <div className="flex items-center gap-3">

                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.04]">
                  🏷️
                </div>

                <div>

                  <div className="text-sm font-medium">
                    Nie znaleziono kodu rabatowego
                  </div>

                  <div className="mt-1 text-xs text-gray-600">
                    Automatyczne sprawdzanie kuponów jest obecnie
                    wyłączone, aby nie używać płatnego API.
                  </div>

                </div>

              </div>

            </div>
          )}

          {/* INNE DOPASOWANE PRODUKTY — PRODUCT → VARIANTS → OFFERS */}
          {otherProductFamilies.length > 0 && (
            <div className="mt-10">
              <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 className="text-xl font-bold">
                    Inne dopasowane produkty
                  </h2>
                  <p className="mt-1 text-xs text-gray-600">
                    Każda karta to jeden produkt. W środku ASARVO pokazuje warianty i oferty różnych sklepów.
                  </p>
                </div>

                <div className="inline-flex w-fit rounded-full border border-blue-500/15 bg-blue-500/[0.04] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-blue-300">
                  {otherProductFamilies.length}{" "}
                  {otherProductFamilies.length === 1
                    ? "produkt"
                    : "produkty"}
                </div>
              </div>

              <div className="space-y-4">
                {otherProductFamilies.map((family) => {
                  const familyCheapest = familyHasProduct(
                    family,
                    cheapestProduct
                  );
                  const familySafest = familyHasProduct(
                    family,
                    safestProduct
                  );

                  return (
                    <div
                      key={family.key}
                      className="overflow-hidden rounded-3xl border border-white/[0.08] bg-white/[0.012] transition hover:border-white/[0.14]"
                    >
                      <div className="flex flex-col gap-5 px-6 py-6 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            {familyCheapest && (
                              <span className="rounded-full border border-amber-500/20 bg-amber-500/[0.07] px-2.5 py-1 text-[10px] font-semibold text-amber-300">
                                💰 {cheapestHasConfirmedTotal
                                  ? "NAJTAŃSZY KOSZT"
                                  : "NAJNIŻSZA CENA"}
                              </span>
                            )}

                            {familySafest && (
                              <span className="rounded-full border border-cyan-500/20 bg-cyan-500/[0.07] px-2.5 py-1 text-[10px] font-semibold text-cyan-300">
                                🛡️ NAJBEZPIECZNIEJSZA
                              </span>
                            )}

                            {typeof family.representative.dealScore ===
                              "number" && (
                              <span className="rounded-full border border-blue-500/15 bg-blue-500/[0.06] px-2.5 py-1 text-[10px] font-semibold text-blue-300">
                                AI {family.representative.dealScore}/100
                              </span>
                            )}

                            {family.colors.length > 0 && (
                              <span className="rounded-full border border-violet-500/20 bg-violet-500/[0.06] px-2.5 py-1 text-[10px] font-semibold text-violet-300">
                                ◈ {family.colors.length}{" "}
                                {family.colors.length === 1
                                  ? "kolor"
                                  : "kolory"}
                              </span>
                            )}

                            <span className="rounded-full border border-white/[0.08] bg-white/[0.025] px-2.5 py-1 text-[10px] text-gray-400">
                              🏪 {family.storeCount}{" "}
                              {family.storeCount === 1
                                ? "źródło"
                                : "źródła"}
                            </span>

                            <span className="rounded-full border border-white/[0.08] bg-white/[0.025] px-2.5 py-1 text-[10px] text-gray-500">
                              {family.offers.length}{" "}
                              {family.offers.length === 1
                                ? "oferta"
                                : "ofert"}
                            </span>
                          </div>

                          <h3 className="mt-3 text-lg font-semibold leading-6">
                            {family.displayName}
                          </h3>

                          {family.colors.length > 0 && (
                            <div className="mt-2 text-xs text-violet-300/75">
                              Warianty: {family.colors.join(" · ")}
                            </div>
                          )}

                          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-gray-600">
                            <span>
                              {productConditionLabel(
                                family.representative
                              )}
                            </span>
                            <span>
                              {originalityLabel(
                                family.representative
                                  .originalityConfidence ?? "unknown"
                              )}
                            </span>
                            <span>
                              {riskLabel(
                                family.representative.riskLevel
                              )}
                            </span>
                          </div>
                        </div>

                        <div className="min-w-[210px] text-left sm:text-right">
                          <div className="text-xs text-gray-600">
                            Najniższa cena produktu
                          </div>
                          <div className="mt-1 text-sm font-medium text-gray-400">
                            {formatPrice(family.lowestPrice)}
                          </div>

                          <div className="mt-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-blue-400">
                            Najlepszy znany koszt
                          </div>
                          <div className="mt-1 text-2xl font-bold">
                            {family.lowestConfirmedTotal !== null
                              ? formatPrice(
                                  family.lowestConfirmedTotal
                                )
                              : family.lowestPrice !== null
                                ? `od ${formatPrice(
                                    family.lowestPrice
                                  )}`
                                : "Niepotwierdzony"}
                          </div>

                          <div className="mt-4 grid grid-cols-2 gap-2 sm:ml-auto sm:max-w-[240px]">
                            <button
                              type="button"
                              disabled={
                                libraryActionBusyKey ===
                                `favorite:${productStorageKey(
                                  family.representative
                                )}`
                              }
                              onClick={() =>
                                void toggleFavorite(
                                  family.representative
                                )
                              }
                              className={`rounded-xl border px-3 py-2.5 text-[11px] font-medium transition disabled:cursor-wait disabled:opacity-60 ${
                                isFavorite(family.representative)
                                  ? "border-rose-500/30 bg-rose-500/[0.10] text-rose-200"
                                  : "border-white/[0.08] bg-white/[0.02] text-gray-400 hover:bg-white/[0.05] hover:text-white"
                              }`}
                            >
                              {isFavorite(family.representative)
                                ? "♥ Ulubione"
                                : "♡ Ulubione"}
                            </button>

                            <button
                              type="button"
                              disabled={
                                libraryActionBusyKey ===
                                `watch:${productStorageKey(
                                  family.representative
                                )}`
                              }
                              onClick={() =>
                                getPriceWatch(
                                  family.representative
                                )
                                  ? void removePriceWatch(
                                      family.representative
                                    )
                                  : openPriceWatchEditor(
                                      family.representative
                                    )
                              }
                              className={`rounded-xl border px-3 py-2.5 text-[11px] font-medium transition disabled:cursor-wait disabled:opacity-60 ${
                                getPriceWatch(
                                  family.representative
                                )
                                  ? "border-amber-500/30 bg-amber-500/[0.10] text-amber-200"
                                  : "border-white/[0.08] bg-white/[0.02] text-gray-400 hover:bg-white/[0.05] hover:text-white"
                              }`}
                            >
                              🔔{" "}
                              {getPriceWatch(
                                family.representative
                              )
                                ? "Obserwujesz"
                                : "Obserwuj"}
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="border-t border-white/[0.055] bg-black/10">
                        {family.storeOffers
                          .slice(0, 4)
                          .map((storeOffer) => {
                            const offer =
                              storeOffer.costRepresentative;

                            return (
                              <div
                                key={storeOffer.key}
                                className="grid gap-3 border-b border-white/[0.045] px-6 py-4 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_auto_minmax(190px,auto)] sm:items-center"
                              >
                                <div className="min-w-0">
                                  <div className="text-sm font-medium text-gray-300">
                                    🏪 {storeOffer.store}
                                  </div>

                                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-gray-600">
                                    <span>
                                      {productConditionLabel(
                                        offer
                                      )}
                                    </span>

                                    {storeOffer.colors.length >
                                      0 && (
                                      <span className="text-violet-300/65">
                                        {storeOffer.colors.join(
                                          " · "
                                        )}
                                      </span>
                                    )}

                                    {storeOffer.offers.length >
                                      1 && (
                                      <span>
                                        {storeOffer.offers.length} ofert
                                      </span>
                                    )}
                                  </div>
                                </div>

                                <div className="text-left sm:min-w-[180px] sm:text-right">
                                  <div className="text-[10px] uppercase tracking-[0.12em] text-gray-700">
                                    Produkt + dostawa
                                  </div>
                                  <div className="mt-1 font-semibold">
                                    {storeOffer.lowestConfirmedTotal !==
                                    null
                                      ? formatPrice(
                                          storeOffer.lowestConfirmedTotal
                                        )
                                      : storeOffer.lowestPrice !==
                                          null
                                        ? `od ${formatPrice(
                                            storeOffer.lowestPrice
                                          )}`
                                        : purchaseTotalLabel(
                                            offer
                                          )}
                                  </div>
                                </div>

                                <div className="flex flex-col gap-2 sm:pl-2">
                                  {offer.url ? (
                                    <a
                                      href={offer.url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="inline-flex w-full items-center justify-center rounded-xl border border-white/10 px-4 py-2.5 text-xs transition hover:bg-white/[0.05]"
                                    >
                                      Zobacz ↗
                                    </a>
                                  ) : (
                                    <button className="inline-flex w-full items-center justify-center rounded-xl border border-white/10 px-4 py-2.5 text-xs transition hover:bg-white/[0.05]">
                                      Zobacz
                                    </button>
                                  )}

                                  <div className="grid grid-cols-2 gap-2">
                                    <button
                                      type="button"
                                      disabled={
                                        libraryActionBusyKey ===
                                        `favorite:${productStorageKey(offer)}`
                                      }
                                      onClick={() =>
                                        void toggleFavorite(offer)
                                      }
                                      className={`rounded-xl border px-3 py-2.5 text-[11px] font-medium transition disabled:cursor-wait disabled:opacity-60 ${
                                        isFavorite(offer)
                                          ? "border-rose-500/30 bg-rose-500/[0.10] text-rose-200"
                                          : "border-white/[0.08] bg-white/[0.02] text-gray-400 hover:bg-white/[0.05] hover:text-white"
                                      }`}
                                    >
                                      {isFavorite(offer) ? "♥ Ulubione" : "♡ Ulubione"}
                                    </button>

                                    <button
                                      type="button"
                                      disabled={
                                        libraryActionBusyKey ===
                                        `watch:${productStorageKey(offer)}`
                                      }
                                      onClick={() =>
                                        getPriceWatch(offer)
                                          ? void removePriceWatch(offer)
                                          : openPriceWatchEditor(offer)
                                      }
                                      className={`rounded-xl border px-3 py-2.5 text-[11px] font-medium transition disabled:cursor-wait disabled:opacity-60 ${
                                        getPriceWatch(offer)
                                          ? "border-amber-500/30 bg-amber-500/[0.10] text-amber-200"
                                          : "border-white/[0.08] bg-white/[0.02] text-gray-400 hover:bg-white/[0.05] hover:text-white"
                                      }`}
                                    >
                                      🔔 {getPriceWatch(offer) ? "Obserwujesz" : "Obserwuj"}
                                    </button>
                                  </div>
                                </div>
                              </div>
                            );
                          })}

                        {family.storeOffers.length > 4 && (
                          <div className="px-6 py-3 text-center text-[11px] text-gray-600">
                            + {family.storeOffers.length - 4} kolejne{" "}
                            {family.storeOffers.length - 4 === 1
                              ? "źródło"
                              : "źródła"}{" "}
                            tego produktu
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* LICZNIK */}
          <div className="mt-7 text-center text-sm text-gray-600">
            Znaleziono {productFamilies.length}{" "}
            {productFamilies.length === 1 ? "produkt" : "produktów"}
            {" "}w {filteredProducts.length}{" "}
            {filteredProducts.length === 1 ? "ofercie" : "ofertach"}
            {totalStoreCount > 0 && (
              <>
                {" "}z {totalStoreCount}{" "}
                {totalStoreCount === 1
                  ? "źródła"
                  : "źródeł / sklepów"}
              </>
            )}
          </div>

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
        <footer className="border-t border-white/[0.06] py-6 text-center text-xs text-gray-700">
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
