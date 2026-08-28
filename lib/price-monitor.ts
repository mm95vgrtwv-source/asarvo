type AvailabilityState = "available" | "unavailable" | "unknown";

export type PriceMonitorResult = {
  ok: boolean;
  price: number | null;
  currency: string | null;
  available: boolean | null;
  availability: AvailabilityState;
  source: "direct-jsonld" | "direct-html" | "jina" | null;
  checkedUrl: string;
  error: string | null;
};

type PriceCandidate = {
  price: number;
  currency: string | null;
  availability: AvailabilityState;
  score: number;
};

const MAX_HTML_CHARS = 2_000_000;
const MAX_JINA_CHARS = 160_000;
const DIRECT_TIMEOUT_MS = 12_000;
const JINA_TIMEOUT_MS = 15_000;

function normalizeText(value: string): string {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/\u202f/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeMatch(value: string): string {
  return normalizeText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function parsePriceNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) && value >= 0 ? value : null;
  }

  if (typeof value !== "string") {
    return null;
  }

  let cleaned = value
    .replace(/\u00a0/g, " ")
    .replace(/\u202f/g, " ")
    .trim()
    .replace(/[^\d,.\s-]/g, "")
    .replace(/\s+/g, "");

  if (!cleaned) {
    return null;
  }

  const comma = cleaned.lastIndexOf(",");
  const dot = cleaned.lastIndexOf(".");

  if (comma >= 0 && dot >= 0) {
    if (comma > dot) {
      cleaned = cleaned.replace(/\./g, "").replace(",", ".");
    } else {
      cleaned = cleaned.replace(/,/g, "");
    }
  } else if (comma >= 0) {
    const decimals = cleaned.length - comma - 1;
    cleaned =
      decimals === 2
        ? cleaned.replace(/\./g, "").replace(",", ".")
        : cleaned.replace(/,/g, "");
  } else if (dot >= 0) {
    const decimals = cleaned.length - dot - 1;

    if (decimals !== 2) {
      cleaned = cleaned.replace(/\./g, "");
    }
  }

  const parsed = Number(cleaned);

  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100_000_000) {
    return null;
  }

  return Math.round(parsed * 100) / 100;
}

function normalizeCurrency(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const currency = value.trim().toUpperCase();

  if (currency === "ZŁ" || currency === "ZL") {
    return "PLN";
  }

  return /^[A-Z]{3}$/.test(currency) ? currency : null;
}

function availabilityFromValue(value: unknown): AvailabilityState {
  if (typeof value !== "string") {
    return "unknown";
  }

  const text = value.toLowerCase();

  if (
    text.includes("instock") ||
    text.includes("in_stock") ||
    text.includes("available") ||
    text.includes("dostęp")
  ) {
    return "available";
  }

  if (
    text.includes("outofstock") ||
    text.includes("out_of_stock") ||
    text.includes("discontinued") ||
    text.includes("unavailable") ||
    text.includes("niedostęp") ||
    text.includes("wycofan")
  ) {
    return "unavailable";
  }

  return "unknown";
}

function availabilityFromText(textRaw: string): AvailabilityState {
  const text = normalizeMatch(textRaw).slice(0, 120_000);

  if (
    /\b(produkt wycofany|produkt niedostepny|niedostepny|brak w magazynie|brak produktu|wyprzedany|sold out|out of stock)\b/i.test(
      text
    )
  ) {
    return "unavailable";
  }

  if (
    /\b(dodaj do koszyka|dostepny|w magazynie|kup teraz|add to cart|in stock)\b/i.test(
      text
    )
  ) {
    return "available";
  }

  return "unknown";
}

function isBlockedHostname(hostname: string): boolean {
  const host = hostname.toLowerCase();

  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host === "0.0.0.0" ||
    host === "::1"
  ) {
    return true;
  }

  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);

  if (ipv4) {
    const parts = ipv4.slice(1).map(Number);

    if (parts.some((part) => part < 0 || part > 255)) {
      return true;
    }

    const [a, b] = parts;

    if (
      a === 10 ||
      a === 127 ||
      a === 0 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    ) {
      return true;
    }
  }

  return false;
}

function normalizePublicUrl(urlRaw: string): string | null {
  try {
    const url = new URL(urlRaw);

    if (!["http:", "https:"].includes(url.protocol)) {
      return null;
    }

    if (isBlockedHostname(url.hostname)) {
      return null;
    }

    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function decodeBasicHtml(value: string): string {
  return value
    .replace(/&quot;/gi, '"')
    .replace(/&#34;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&#39;/gi, "'")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&nbsp;/gi, " ");
}

function productNameScore(candidateName: unknown, expectedName: string): number {
  if (typeof candidateName !== "string" || !candidateName.trim()) {
    return 0;
  }

  const candidate = normalizeMatch(candidateName);
  const expected = normalizeMatch(expectedName);

  if (!candidate || !expected) {
    return 0;
  }

  if (candidate === expected) {
    return 100;
  }

  if (candidate.includes(expected) || expected.includes(candidate)) {
    return 70;
  }

  const expectedTokens = new Set(
    expected.split(" ").filter((token) => token.length >= 3)
  );
  const candidateTokens = new Set(
    candidate.split(" ").filter((token) => token.length >= 3)
  );

  if (!expectedTokens.size || !candidateTokens.size) {
    return 0;
  }

  let overlap = 0;

  for (const token of expectedTokens) {
    if (candidateTokens.has(token)) {
      overlap += 1;
    }
  }

  return Math.round((overlap / expectedTokens.size) * 50);
}

function collectOfferCandidates(
  value: unknown,
  expectedName: string,
  inheritedName = "",
  depth = 0
): PriceCandidate[] {
  if (depth > 12 || value === null || value === undefined) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) =>
      collectOfferCandidates(item, expectedName, inheritedName, depth + 1)
    );
  }

  if (typeof value !== "object") {
    return [];
  }

  const object = value as Record<string, unknown>;
  const rawType = object["@type"];
  const types = Array.isArray(rawType)
    ? rawType.filter((item): item is string => typeof item === "string")
    : typeof rawType === "string"
      ? [rawType]
      : [];

  const objectName =
    typeof object.name === "string" ? object.name : inheritedName;
  const nameScore = productNameScore(objectName, expectedName);

  const candidates: PriceCandidate[] = [];

  const typeText = types.join(" ").toLowerCase();
  const isOfferLike =
    typeText.includes("offer") ||
    "price" in object ||
    "lowPrice" in object ||
    "priceSpecification" in object;

  if (isOfferLike) {
    let price =
      parsePriceNumber(object.price) ??
      parsePriceNumber(object.lowPrice);

    let currency =
      normalizeCurrency(object.priceCurrency) ??
      normalizeCurrency(object.currency);

    if (price === null && object.priceSpecification) {
      const spec = object.priceSpecification;

      if (Array.isArray(spec)) {
        for (const item of spec) {
          if (item && typeof item === "object") {
            const specObject = item as Record<string, unknown>;
            const specPrice = parsePriceNumber(specObject.price);

            if (specPrice !== null) {
              price = specPrice;
              currency =
                normalizeCurrency(specObject.priceCurrency) ?? currency;
              break;
            }
          }
        }
      } else if (typeof spec === "object") {
        const specObject = spec as Record<string, unknown>;
        price = parsePriceNumber(specObject.price);
        currency =
          normalizeCurrency(specObject.priceCurrency) ?? currency;
      }
    }

    if (price !== null && price > 0) {
      const availability = availabilityFromValue(object.availability);

      candidates.push({
        price,
        currency,
        availability,
        score:
          100 +
          nameScore +
          (typeText.includes("offer") ? 20 : 0) +
          (availability === "available" ? 10 : 0),
      });
    }
  }

  const nextInheritedName = objectName || inheritedName;

  for (const [key, child] of Object.entries(object)) {
    if (
      [
        "offers",
        "offer",
        "itemOffered",
        "mainEntity",
        "mainEntityOfPage",
        "@graph",
        "priceSpecification",
      ].includes(key)
    ) {
      candidates.push(
        ...collectOfferCandidates(
          child,
          expectedName,
          nextInheritedName,
          depth + 1
        )
      );
    }
  }

  return candidates;
}

function extractJsonLdCandidate(
  html: string,
  expectedName: string
): PriceCandidate | null {
  const scripts = Array.from(
    html.matchAll(
      /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
    )
  );

  const candidates: PriceCandidate[] = [];

  for (const match of scripts) {
    const raw = decodeBasicHtml(match[1] ?? "").trim();

    if (!raw) {
      continue;
    }

    try {
      const parsed = JSON.parse(raw);
      candidates.push(
        ...collectOfferCandidates(parsed, expectedName)
      );
    } catch {
      // Nieprawidłowy JSON-LD nie może przerwać monitoringu.
    }
  }

  candidates.sort((a, b) => b.score - a.score);

  return candidates[0] ?? null;
}

function extractMetaContent(
  html: string,
  keys: string[]
): string | null {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];

  for (const tag of tags) {
    const attrs = new Map<string, string>();

    for (const match of tag.matchAll(
      /([a-zA-Z_:.-]+)\s*=\s*["']([^"']*)["']/g
    )) {
      attrs.set(match[1].toLowerCase(), decodeBasicHtml(match[2]));
    }

    const marker = (
      attrs.get("property") ??
      attrs.get("name") ??
      attrs.get("itemprop") ??
      ""
    ).toLowerCase();

    if (keys.some((key) => marker === key.toLowerCase())) {
      const content = attrs.get("content");

      if (content) {
        return content;
      }
    }
  }

  return null;
}

function extractDirectHtmlCandidate(
  html: string
): PriceCandidate | null {
  const amount =
    extractMetaContent(html, [
      "product:price:amount",
      "og:price:amount",
      "price",
    ]) ??
    html.match(
      /itemprop=["']price["'][^>]*(?:content|value)=["']([^"']+)["']/i
    )?.[1] ??
    html.match(
      /(?:content|value)=["']([^"']+)["'][^>]*itemprop=["']price["']/i
    )?.[1] ??
    "";

  const price = parsePriceNumber(amount);

  if (price === null || price <= 0) {
    return null;
  }

  const currency =
    normalizeCurrency(
      extractMetaContent(html, [
        "product:price:currency",
        "og:price:currency",
        "pricecurrency",
      ])
    ) ?? "PLN";

  return {
    price,
    currency,
    availability: availabilityFromText(html),
    score: 40,
  };
}

function extractJinaCandidate(
  textRaw: string
): PriceCandidate | null {
  const text = textRaw.slice(0, MAX_JINA_CHARS);

  const explicitPatterns = [
    /(?:^|\n)\s*(?:Cena|Cena produktu|Aktualna cena)\s*:\s*([0-9][0-9\s\u00a0\u202f.,]{0,24})\s*(zł|PLN)\b/iu,
    /(?:^|\n)\s*(?:Razem|Do zapłaty)\s*:\s*([0-9][0-9\s\u00a0\u202f.,]{0,24})\s*(zł|PLN)\b/iu,
  ];

  for (const pattern of explicitPatterns) {
    const match = text.match(pattern);
    const price = parsePriceNumber(match?.[1]);

    if (price !== null && price > 0) {
      return {
        price,
        currency: "PLN",
        availability: availabilityFromText(text),
        score: 80,
      };
    }
  }

  // Ostrożny fallback: szukamy ceny tylko blisko frazy zakupowej.
  const lines = text.split(/\r?\n/).slice(0, 1400);

  for (let index = 0; index < lines.length; index += 1) {
    const line = normalizeText(lines[index]);

    if (
      !/\b(dodaj do koszyka|kup teraz|dostepny|dostępny|cena)\b/iu.test(line)
    ) {
      continue;
    }

    const scope = normalizeText(
      lines.slice(Math.max(0, index - 2), index + 4).join(" ")
    );

    const match = scope.match(
      /([0-9][0-9\s\u00a0\u202f.,]{0,20})\s*(zł|PLN)\b/iu
    );
    const price = parsePriceNumber(match?.[1]);

    if (price !== null && price > 0) {
      return {
        price,
        currency: "PLN",
        availability: availabilityFromText(text),
        score: 45,
      };
    }
  }

  return null;
}

async function fetchText(
  url: string,
  timeoutMs: number,
  headers: HeadersInit
): Promise<{ ok: boolean; status: number; text: string }> {
  try {
    const response = await fetch(url, {
      cache: "no-store",
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
      headers,
    });

    const text = (await response.text()).slice(0, MAX_HTML_CHARS);

    return {
      ok: response.ok,
      status: response.status,
      text,
    };
  } catch {
    return {
      ok: false,
      status: 0,
      text: "",
    };
  }
}

export async function checkProductPrice(
  urlRaw: string,
  expectedProductName: string
): Promise<PriceMonitorResult> {
  const checkedUrl = normalizePublicUrl(urlRaw);

  if (!checkedUrl) {
    return {
      ok: false,
      price: null,
      currency: null,
      available: null,
      availability: "unknown",
      source: null,
      checkedUrl: urlRaw,
      error: "Nieprawidłowy albo lokalny adres oferty.",
    };
  }

  const direct = await fetchText(checkedUrl, DIRECT_TIMEOUT_MS, {
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "pl-PL,pl;q=0.9,en;q=0.6",
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/150 Safari/537.36 ASARVO-PriceMonitor/1.0",
  });

  if (direct.text) {
    const jsonLd = extractJsonLdCandidate(
      direct.text,
      expectedProductName
    );

    if (
      jsonLd &&
      jsonLd.price > 0 &&
      (!jsonLd.currency || jsonLd.currency === "PLN")
    ) {
      return {
        ok: true,
        price: jsonLd.price,
        currency: jsonLd.currency ?? "PLN",
        available:
          jsonLd.availability === "available"
            ? true
            : jsonLd.availability === "unavailable"
              ? false
              : null,
        availability: jsonLd.availability,
        source: "direct-jsonld",
        checkedUrl,
        error: null,
      };
    }

    const directHtml = extractDirectHtmlCandidate(direct.text);

    if (
      directHtml &&
      directHtml.price > 0 &&
      (!directHtml.currency || directHtml.currency === "PLN")
    ) {
      return {
        ok: true,
        price: directHtml.price,
        currency: directHtml.currency ?? "PLN",
        available:
          directHtml.availability === "available"
            ? true
            : directHtml.availability === "unavailable"
              ? false
              : null,
        availability: directHtml.availability,
        source: "direct-html",
        checkedUrl,
        error: null,
      };
    }
  }

  // Darmowy reader jako fallback dla sklepów blokujących zwykły fetch.
  const jinaUrl = `https://r.jina.ai/${checkedUrl}`;
  const jina = await fetchText(jinaUrl, JINA_TIMEOUT_MS, {
    Accept: "text/plain,text/markdown,*/*",
    "User-Agent": "ASARVO-PriceMonitor/1.0",
  });

  if (jina.ok && jina.text) {
    const jinaCandidate = extractJinaCandidate(jina.text);

    if (jinaCandidate) {
      return {
        ok: true,
        price: jinaCandidate.price,
        currency: "PLN",
        available:
          jinaCandidate.availability === "available"
            ? true
            : jinaCandidate.availability === "unavailable"
              ? false
              : null,
        availability: jinaCandidate.availability,
        source: "jina",
        checkedUrl,
        error: null,
      };
    }

    const availability = availabilityFromText(jina.text);

    if (availability === "unavailable") {
      return {
        ok: true,
        price: null,
        currency: "PLN",
        available: false,
        availability,
        source: "jina",
        checkedUrl,
        error: null,
      };
    }
  }

  return {
    ok: false,
    price: null,
    currency: null,
    available: null,
    availability: "unknown",
    source: null,
    checkedUrl,
    error:
      direct.status === 403 || direct.status === 429
        ? "Sklep zablokował automatyczne odczytanie ceny."
        : "Nie udało się wiarygodnie odczytać aktualnej ceny.",
  };
}
