import { NextResponse } from "next/server";
import OpenAI from "openai";

type CouponResult = {
  code: string;
  discountPercent: number | null;
  store: string;
  title: string;
  url: string;
  description: string;
  verified: boolean;
};

function cleanText(text: string) {
  return text
    .replace(/\s+/g, " ")
    .replace(/\u00a0/g, " ")
    .trim();
}

function getStoreFromUrl(url: string) {
  try {
    const hostname = new URL(url).hostname
      .replace(/^www\./, "")
      .toLowerCase();

    const parts = hostname.split(".");

    if (parts.length < 2) {
      return "Sklep";
    }

    const name = parts[parts.length - 2];

    return name.charAt(0).toUpperCase() + name.slice(1);
  } catch {
    return "Sklep";
  }
}

function isSocialMediaUrl(url: string) {
  try {
    const hostname = new URL(url).hostname
      .replace(/^www\./, "")
      .toLowerCase();

    const blockedDomains = [
      "tiktok.com",
      "youtube.com",
      "youtu.be",
      "instagram.com",
      "facebook.com",
      "x.com",
      "twitter.com",
      "reddit.com",
      "pinterest.com",
    ];

    return blockedDomains.some(
      (domain) =>
        hostname === domain ||
        hostname.endsWith(`.${domain}`)
    );
  } catch {
    return true;
  }
}

function extractDiscount(text: string) {
  const patterns = [
    /(?:rabat|zniżka|obniżka|promocja)[^\d]{0,30}(\d{1,2})\s*%/i,
    /-(\d{1,2})\s*%/i,
    /(\d{1,2})\s*%\s*(?:rabatu|zniżki|taniej)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);

    if (!match) {
      continue;
    }

    const value = Number(match[1]);

    if (value >= 1 && value <= 90) {
      return value;
    }
  }

  return null;
}

function normalizeCode(code: string) {
  return code
    .trim()
    .replace(/[`"'“”‘’]/g, "")
    .replace(/\s+/g, "")
    .toUpperCase();
}

function looksLikeValidCode(code: string) {
  if (!code) {
    return false;
  }

  if (code.length < 4 || code.length > 30) {
    return false;
  }

  if (/\s/.test(code)) {
    return false;
  }

  if (
    code.includes("HTTP") ||
    code.includes("WWW.") ||
    code.includes(".COM") ||
    code.includes(".PL")
  ) {
    return false;
  }

  if (/^\d+$/.test(code)) {
    return false;
  }

  if (!/^[A-Z0-9_-]+$/.test(code)) {
    return false;
  }

  const blockedWords = [
    "SONY",
    "APPLE",
    "SAMSUNG",
    "PLAYSTATION",
    "XBOX",
    "NINTENDO",
    "NACON",
    "LOGITECH",
    "KARTA",
    "RABAT",
    "RABATOWY",
    "PROMOCJA",
    "PROMO",
    "COUPON",
    "DISCOUNT",
    "KOD",
    "KODRABATOWY",
    "KODPROMOCYJNY",
    "WILL",
    "SAVE",
    "CODE",
  ];

  if (blockedWords.includes(code)) {
    return false;
  }

  return true;
}

function hasExplicitCodeEvidence(
  text: string,
  code: string
) {
  const normalizedText = cleanText(text).toLowerCase();
  const normalizedCode = code.toLowerCase();

  const codePosition =
    normalizedText.indexOf(normalizedCode);

  if (codePosition === -1) {
    return false;
  }

  const start = Math.max(0, codePosition - 300);
  const end = Math.min(
    normalizedText.length,
    codePosition + normalizedCode.length + 300
  );

  const context = normalizedText.slice(start, end);

  const explicitPhrases = [
    "kod rabatowy",
    "kod promocyjny",
    "kod promocji",
    "kod zniżkowy",
    "kod kuponu",
    "kod rabat",
    "użyj kodu",
    "uzyj kodu",
    "wpisz kod",
    "wprowadź kod",
    "wprowadz kod",
    "zastosuj kod",
    "promo code",
    "coupon code",
    "discount code",
    "promotional code",
    "enter code",
    "use code",
    "apply code",
  ];

  return explicitPhrases.some((phrase) =>
    context.includes(phrase)
  );
}

function getCodeContext(text: string, code: string) {
  const normalizedText = cleanText(text);
  const lowerText = normalizedText.toLowerCase();
  const lowerCode = code.toLowerCase();

  const position = lowerText.indexOf(lowerCode);

  if (position === -1) {
    return "";
  }

  const start = Math.max(0, position - 160);
  const end = Math.min(
    normalizedText.length,
    position + code.length + 220
  );

  return normalizedText.slice(start, end);
}

function cleanSearchQuery(query: string) {
  return cleanText(
    query
      .replace(/(?:kod rabatowy|kod promocyjny|kod zniżkowy|coupon code|promo code)/gi, "")
  );
}

function getLikelyStore(query: string) {
  const lower = query.toLowerCase();

  const knownStores = [
    "allegro",
    "amazon",
    "mediamarkt",
    "media markt",
    "morele",
    "x-kom",
    "xkom",
    "komputronik",
    "rtv euro agd",
    "euro.com.pl",
    "neonet",
    "empik",
    "oleole",
    "pepper",
    "gameexpert",
    "gamestore",
    "techmarket",
    "electroshop",
    "game store",
    "ultima",
    "eobuwie",
    "reserved",
    "zalando",
    "decathlon",
    "nike",
    "adidas",
  ];

  return (
    knownStores.find((store) =>
      lower.includes(store)
    ) ?? null
  );
}

function isProbablyCouponPage(url: string, title: string) {
  const text = `${url} ${title}`.toLowerCase();

  const couponWords = [
    "kod-rabat",
    "kod-rabatowy",
    "kod-promocyj",
    "kupon",
    "coupon",
    "promo-code",
    "promocj",
    "rabat",
    "zniżk",
    "discount",
    "kody",
  ];

  return couponWords.some((word) =>
    text.includes(word)
  );
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const query = body?.query;

    if (!query || typeof query !== "string") {
      return NextResponse.json(
        {
          error: "Brak zapytania.",
        },
        {
          status: 400,
        }
      );
    }

    const tavilyKey = process.env.TAVILY_API_KEY;
    const openaiKey = process.env.OPENAI_API_KEY;

    if (!tavilyKey) {
      return NextResponse.json(
        {
          error:
            "Brak TAVILY_API_KEY w .env.local.",
        },
        {
          status: 500,
        }
      );
    }

    if (!openaiKey) {
      return NextResponse.json(
        {
          error:
            "Brak OPENAI_API_KEY w .env.local.",
        },
        {
          status: 500,
        }
      );
    }

    const openai = new OpenAI({
      apiKey: openaiKey,
    });

    // ==================================================
    // 1. PRZYGOTOWANIE LEPSZYCH ZAPYTAŃ
    // ==================================================

    const productQuery = cleanSearchQuery(query);
    const storeHint = getLikelyStore(query);

    // Maksymalnie 3 wyszukiwania Tavily na jedno żądanie.
    // To mocno ogranicza czas i koszty całego procesu.
    const searchQueries = storeHint
      ? [
          `"${storeHint}" "kod rabatowy"`,
          `"${storeHint}" "kod promocyjny"`,
          `"${storeHint}" kupon rabat promocja`,
        ]
      : [
          `"${productQuery}" "kod rabatowy"`,
          `"${productQuery}" "kod promocyjny"`,
          `"${productQuery}" kupon rabat promocja`,
        ];

    const allResults: any[] = [];

    // ==================================================
    // 2. TAVILY - SZUKANIE
    // ==================================================

    for (const searchQuery of searchQueries) {
      try {
        const response = await fetch(
          "https://api.tavily.com/search",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              api_key: tavilyKey,
              query: searchQuery,
              search_depth: "advanced",
              max_results: 5,
              include_answer: false,
              include_raw_content: false,
            }),
          }
        );

        if (!response.ok) {
          console.error(
            "Tavily error:",
            response.status,
            await response.text()
          );
          continue;
        }

        const data = await response.json();

        if (Array.isArray(data.results)) {
          allResults.push(...data.results);
        }
      } catch (error) {
        console.error(
          "Błąd pojedynczego wyszukiwania Tavily:",
          error
        );
      }
    }

    // ==================================================
    // 3. USUWAMY DUPLIKATY I SOCIAL MEDIA
    // ==================================================

    const uniqueResults = allResults.filter(
      (result, index, array) =>
        index ===
        array.findIndex(
          (item) => item.url === result.url
        )
    );

    const usableResults = uniqueResults
      .filter((result) => {
        const url = String(result.url ?? "");

        return (
          url &&
          !isSocialMediaUrl(url)
        );
      })
      .sort((a, b) => {
        const aCoupon = isProbablyCouponPage(
          String(a.url ?? ""),
          String(a.title ?? "")
        );

        const bCoupon = isProbablyCouponPage(
          String(b.url ?? ""),
          String(b.title ?? "")
        );

        if (aCoupon && !bCoupon) return -1;
        if (!aCoupon && bCoupon) return 1;

        return 0;
      });

    if (usableResults.length === 0) {
      return NextResponse.json({
        success: true,
        query,
        found: 0,
        coupons: [],
        message:
          "Nie znaleziono wiarygodnych stron z kodami.",
      });
    }

    // ==================================================
    // 4. PRZYGOTOWUJEMY DANE DLA OPENAI
    // ==================================================

    const sources = usableResults
      .slice(0, 8)
      .map((result, index) => {
        const title = cleanText(
          result.title ?? ""
        );

        const content = cleanText(
          result.raw_content ||
            result.content ||
            ""
        );

        const url = result.url ?? "";

        return `
ŹRÓDŁO ${index + 1}

TYTUŁ:
${title}

URL:
${url}

TREŚĆ:
${content.slice(0, 1600)}
`;
      })
      .join("\n\n");

    // ==================================================
    // 5. OPENAI - ANALIZA
    // ==================================================

    const prompt = `
Jesteś modułem AI wyszukującym PRAWDZIWE kody rabatowe.

Zapytanie: "${query}"
Produkt: "${productQuery}"
Sklep: "${storeHint ?? "nieustalony"}"

Źródła:
${sources}

Zwróć tylko konkretne kody, które są wyraźnie podane w źródle jako kod rabatowy/promocyjny i dotyczą wskazanego sklepu. Nie zgaduj. Nie bierz nazw produktów, marek, numerów modeli, ID filmów, hashtagów ani przypadkowych ciągów. Jeśli nie ma mocnego dowodu, zwróć pustą tablicę. Odrzuć kody oznaczone jako wygasłe.

Zwróć maksymalnie 3 wyniki. sourceIndex to numer źródła. discountPercent tylko gdy źródło jasno podaje procent dla tego kodu, inaczej null.

Odpowiedz WYŁĄCZNIE JSON-em:
{"coupons":[{"code":"SAVE10","discountPercent":10,"sourceIndex":1,"reason":"Źródło wyraźnie podaje kod."}]}
Jeśli brak wiarygodnego kodu: {"coupons":[]}
`;

    const aiResponse = await openai.responses.create({
      model: "gpt-5.6-luna",
      reasoning: { effort: "low" },
      text: { verbosity: "low" },
      max_output_tokens: 500,
      input: prompt,
    });

    const aiText =
      aiResponse.output_text.trim();

    // ==================================================
    // 6. ODCZYT JSON
    // ==================================================

    let aiData: {
      coupons?: {
        code: string;
        discountPercent: number | null;
        sourceIndex: number;
        reason: string;
      }[];
    };

    try {
      aiData = JSON.parse(aiText);
    } catch {
      console.error(
        "OpenAI zwróciło niepoprawny JSON:",
        aiText
      );

      return NextResponse.json({
        success: true,
        query,
        found: 0,
        coupons: [],
        message:
          "AI nie znalazło wiarygodnego kodu.",
      });
    }

    // ==================================================
    // 7. DODATKOWA WERYFIKACJA SERWEROWA
    // ==================================================

    const coupons: CouponResult[] = [];

    for (const aiCoupon of aiData.coupons ?? []) {
      const sourceIndex =
        Number(aiCoupon.sourceIndex) - 1;

      const source =
        usableResults[sourceIndex];

      if (!source) {
        continue;
      }

      const code = normalizeCode(
        String(aiCoupon.code ?? "")
      );

      if (!looksLikeValidCode(code)) {
        console.log(
          "Odrzucono podejrzany kod:",
          code
        );

        continue;
      }

      const sourceText = cleanText(
        `${source.title ?? ""} ${
          source.content || ""
        }`
      );

      if (
        !sourceText
          .toLowerCase()
          .includes(code.toLowerCase())
      ) {
        console.log(
          "Odrzucono kod, którego nie ma w źródle:",
          code
        );

        continue;
      }

      if (
        !hasExplicitCodeEvidence(
          sourceText,
          code
        )
      ) {
        console.log(
          "Odrzucono kod bez wyraźnego potwierdzenia:",
          code
        );

        continue;
      }

      const codeContext =
        getCodeContext(
          sourceText,
          code
        );

      const discount =
        typeof aiCoupon.discountPercent ===
        "number"
          ? aiCoupon.discountPercent
          : extractDiscount(
              sourceText
            );

      coupons.push({
        code,
        discountPercent: discount,
        store: getStoreFromUrl(
          source.url
        ),
        title: cleanText(
          source.title ?? ""
        ),
        url: source.url,
        description:
          codeContext ||
          cleanText(
            source.content ?? ""
          ).slice(0, 300),
        verified: false,
      });
    }

    // ==================================================
    // 8. USUWAMY DUPLIKATY
    // ==================================================

    const uniqueCoupons =
      coupons.filter(
        (coupon, index, array) =>
          index ===
          array.findIndex(
            (item) =>
              item.code.toLowerCase() ===
              coupon.code.toLowerCase()
          )
      );

    // ==================================================
    // 9. ODPOWIEDŹ
    // ==================================================

    return NextResponse.json({
      success: true,
      query,
      found: uniqueCoupons.length,
      coupons: uniqueCoupons.slice(0, 3),
      message:
        uniqueCoupons.length > 0
          ? "AI znalazło potencjalne kody rabatowe."
          : "Nie znaleziono wiarygodnego kodu rabatowego.",
    });
  } catch (error) {
    console.error(
      "Błąd wyszukiwania kodów:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Nie udało się wyszukać kodów rabatowych.",
      },
      {
        status: 500,
      }
    );
  }
}