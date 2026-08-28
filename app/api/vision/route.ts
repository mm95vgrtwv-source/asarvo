import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash-lite";

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const GEMINI_TIMEOUT_MS = 45_000;

type VisionAnalysis = {
  searchQuery: string;
  productCategory: string | null;
  brand: string | null;
  model: string | null;
  color: string | null;
  visibleDetails: string[];
  confidence: number;
};

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
    finishReason?: string;
  }>;
  promptFeedback?: {
    blockReason?: string;
  };
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
};

function cleanNullableString(
  value: unknown
): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return trimmed ? trimmed : null;
}

function cleanStringArray(
  value: unknown
): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(
      (item): item is string =>
        typeof item === "string"
    )
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 8);
}

function clampConfidence(
  value: unknown
): number {
  const parsed =
    typeof value === "number"
      ? value
      : Number(value);

  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return Math.min(
    1,
    Math.max(0, parsed)
  );
}

function extractJsonObject(
  raw: string
): Record<string, unknown> | null {
  const trimmed = raw.trim();

  if (!trimmed) {
    return null;
  }

  try {
    const parsed =
      JSON.parse(trimmed);

    return parsed &&
      typeof parsed === "object"
      ? (parsed as Record<
          string,
          unknown
        >)
      : null;
  } catch {
    const firstBrace =
      trimmed.indexOf("{");

    const lastBrace =
      trimmed.lastIndexOf("}");

    if (
      firstBrace === -1 ||
      lastBrace <= firstBrace
    ) {
      return null;
    }

    try {
      const parsed =
        JSON.parse(
          trimmed.slice(
            firstBrace,
            lastBrace + 1
          )
        );

      return parsed &&
        typeof parsed === "object"
        ? (parsed as Record<
            string,
            unknown
          >)
        : null;
    } catch {
      return null;
    }
  }
}

function normalizeVisionAnalysis(
  raw: Record<string, unknown>
): VisionAnalysis | null {
  const searchQuery =
    cleanNullableString(
      raw.searchQuery
    ) ??
    cleanNullableString(
      raw.query
    );

  if (!searchQuery) {
    return null;
  }

  return {
    searchQuery,

    productCategory:
      cleanNullableString(
        raw.productCategory
      ),

    brand:
      cleanNullableString(
        raw.brand
      ),

    model:
      cleanNullableString(
        raw.model
      ),

    color:
      cleanNullableString(
        raw.color
      ),

    visibleDetails:
      cleanStringArray(
        raw.visibleDetails
      ),

    confidence:
      clampConfidence(
        raw.confidence
      ),
  };
}

function getGeminiText(
  payload: GeminiResponse
): string | null {
  const candidates =
    Array.isArray(payload.candidates)
      ? payload.candidates
      : [];

  for (const candidate of candidates) {
    const parts =
      candidate.content?.parts;

    if (!Array.isArray(parts)) {
      continue;
    }

    const text = parts
      .map((part) =>
        typeof part.text === "string"
          ? part.text
          : ""
      )
      .join("")
      .trim();

    if (text) {
      return text;
    }
  }

  return null;
}

export async function POST(
  request: Request
) {
  try {
    const apiKey =
      process.env.GEMINI_API_KEY?.trim();

    if (!apiKey) {
      console.error(
        "[ASARVO VISION] Missing GEMINI_API_KEY"
      );

      return NextResponse.json(
        {
          ok: false,
          error:
            "Moduł rozpoznawania zdjęć nie jest jeszcze skonfigurowany.",
        },
        {
          status: 503,
        }
      );
    }

    const model =
      process.env
        .GEMINI_VISION_MODEL
        ?.trim() ||
      DEFAULT_GEMINI_MODEL;

    const formData =
      await request.formData();

    const image =
      formData.get("image");

    if (!(image instanceof File)) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Nie przesłano zdjęcia produktu.",
        },
        {
          status: 400,
        }
      );
    }

    if (
      !image.type.startsWith(
        "image/"
      )
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Przesłany plik nie jest obrazem.",
        },
        {
          status: 400,
        }
      );
    }

    if (
      image.size <= 0 ||
      image.size >
        MAX_IMAGE_BYTES
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Zdjęcie musi mieć maksymalnie 4 MB.",
        },
        {
          status: 413,
        }
      );
    }

    const imageBuffer =
      Buffer.from(
        await image.arrayBuffer()
      );

    const imageBase64 =
      imageBuffer.toString(
        "base64"
      );

    const controller =
      new AbortController();

    const timeout =
      setTimeout(
        () =>
          controller.abort(),
        GEMINI_TIMEOUT_MS
      );

    let geminiResponse: Response;

    try {
      geminiResponse =
        await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
            model
          )}:generateContent`,
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",

              "x-goog-api-key":
                apiKey,
            },

            signal:
              controller.signal,

            cache:
              "no-store",

            body:
              JSON.stringify({
                contents: [
                  {
                    role: "user",

                    parts: [
                      {
                        inlineData: {
                          mimeType:
                            image.type,

                          data:
                            imageBase64,
                        },
                      },

                      {
                        text:
                          [
                            "Jesteś modułem rozpoznawania produktów ze zdjęć w polskiej wyszukiwarce zakupowej ASARVO.",

                            "Analizuj WYŁĄCZNIE to, co faktycznie widać na zdjęciu.",

                            "Twoim zadaniem jest utworzenie możliwie najlepszego zapytania zakupowego, które następnie zostanie przekazane do silnika wyszukiwania ASARVO.",

                            "Rozpoznaj kategorię produktu oraz, tylko jeśli zdjęcie daje wystarczające dowody, markę, model, kolor i przydatne cechy zakupowe.",

                            "Nigdy nie zgaduj dokładnego modelu, wariantu, pojemności, rozmiaru, generacji ani marki, jeżeli nie ma wystarczających dowodów wizualnych.",

                            "Jeżeli dokładna identyfikacja jest niepewna, użyj szerszej kategorii i widocznych cech zamiast wymyślonego modelu.",

                            "Jeżeli na produkcie widać logo, nazwę producenta, nazwę modelu albo inne oznaczenia, możesz wykorzystać je do identyfikacji.",

                            "Wszystkie opisy mają być po polsku. Nazwy własne marek i modeli pozostaw w ich oryginalnej formie.",

                            'searchQuery ma być krótkim, naturalnym zapytaniem zakupowym po polsku, np. "portfel Valentino czarny skórzany", "buty Nike Air Max czarne", "bezprzewodowe słuchawki nauszne czarne".',

                            "Nie dodawaj ceny, chyba że cena jest częścią identyfikacji widoczną bezpośrednio na produkcie lub opakowaniu.",

                            "productCategory ma zawierać krótką nazwę kategorii produktu po polsku.",

                            'Jeśli marka, model lub kolor są nieznane, zwróć dla danego pola pusty string "".',

                            "visibleDetails ma zawierać wyłącznie cechy naprawdę widoczne na zdjęciu.",

                            "confidence oznacza pewność poprawności searchQuery w skali od 0 do 1.",

                            "Nie opisuj zdjęcia ogólnie. Wynik ma służyć wyszukiwaniu produktu do kupienia.",
                          ].join(
                            "\n"
                          ),
                      },
                    ],
                  },
                ],

                generationConfig: {
                  temperature: 0.1,

                  maxOutputTokens:
                    512,

                  responseMimeType:
                    "application/json",

                  responseSchema: {
                    type: "OBJECT",

                    properties: {
                      searchQuery: {
                        type: "STRING",
                      },

                      productCategory:
                        {
                          type: "STRING",
                        },

                      brand: {
                        type: "STRING",
                      },

                      model: {
                        type: "STRING",
                      },

                      color: {
                        type: "STRING",
                      },

                      visibleDetails:
                        {
                          type: "ARRAY",

                          items: {
                            type: "STRING",
                          },
                        },

                      confidence: {
                        type: "NUMBER",
                        minimum: 0,
                        maximum: 1,
                      },
                    },

                    required: [
                      "searchQuery",
                      "productCategory",
                      "brand",
                      "model",
                      "color",
                      "visibleDetails",
                      "confidence",
                    ],
                  },
                },
              }),
          }
        );
    } catch (error) {
      if (
        error instanceof Error &&
        error.name ===
          "AbortError"
      ) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "Analiza zdjęcia trwała zbyt długo. Spróbuj ponownie.",
          },
          {
            status: 504,
          }
        );
      }

      console.error(
        "[ASARVO VISION] Gemini connection error:",
        error
      );

      return NextResponse.json(
        {
          ok: false,
          error:
            "Nie udało się połączyć z modułem AI rozpoznającym zdjęcie.",
        },
        {
          status: 503,
        }
      );
    } finally {
      clearTimeout(timeout);
    }

    const payload =
      (await geminiResponse
        .json()
        .catch(
          () => null
        )) as
        | GeminiResponse
        | null;

    if (
      !geminiResponse.ok
    ) {
      const providerError =
        payload?.error
          ?.message;

      console.error(
        "[ASARVO VISION] Gemini API error:",
        {
          status:
            geminiResponse.status,

          message:
            providerError ||
            "Unknown Gemini error",
        }
      );

      if (
        geminiResponse.status ===
        429
      ) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "Moduł rozpoznawania zdjęć jest chwilowo przeciążony. Spróbuj ponownie za moment.",
          },
          {
            status: 429,
          }
        );
      }

      if (
        geminiResponse.status ===
          401 ||
        geminiResponse.status ===
          403
      ) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "Moduł rozpoznawania zdjęć wymaga ponownej konfiguracji.",
          },
          {
            status: 503,
          }
        );
      }

      return NextResponse.json(
        {
          ok: false,
          error:
            "AI nie mogło przeanalizować tego zdjęcia. Spróbuj ponownie lub użyj innego zdjęcia.",
        },
        {
          status: 502,
        }
      );
    }

    if (!payload) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "AI zwróciło pustą odpowiedź.",
        },
        {
          status: 502,
        }
      );
    }

    if (
      payload.promptFeedback
        ?.blockReason
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "To zdjęcie nie mogło zostać przeanalizowane. Spróbuj innego zdjęcia produktu.",
        },
        {
          status: 422,
        }
      );
    }

    const rawContent =
      getGeminiText(payload);

    if (!rawContent) {
      console.error(
        "[ASARVO VISION] Gemini returned no text:",
        payload
      );

      return NextResponse.json(
        {
          ok: false,
          error:
            "AI nie zwróciło rozpoznania produktu.",
        },
        {
          status: 502,
        }
      );
    }

    const parsed =
      extractJsonObject(
        rawContent
      );

    const analysis =
      parsed
        ? normalizeVisionAnalysis(
            parsed
          )
        : null;

    if (!analysis) {
      console.error(
        "[ASARVO VISION] Invalid structured response:",
        rawContent
      );

      return NextResponse.json(
        {
          ok: false,
          error:
            "Nie udało się bezpiecznie rozpoznać produktu. Spróbuj wyraźniejszego zdjęcia.",
        },
        {
          status: 422,
        }
      );
    }

    return NextResponse.json({
      ok: true,

      query:
        analysis.searchQuery,

      confidence:
        analysis.confidence,

      detected: {
        category:
          analysis.productCategory,

        brand:
          analysis.brand,

        model:
          analysis.model,

        color:
          analysis.color,

        visibleDetails:
          analysis.visibleDetails,
      },

      visionProvider:
        "gemini",

      visionModel:
        model,
    });
  } catch (error) {
    console.error(
      "[ASARVO VISION] Unexpected error:",
      error
    );

    return NextResponse.json(
      {
        ok: false,
        error:
          "Wystąpił błąd podczas analizy zdjęcia.",
      },
      {
        status: 500,
      }
    );
  }
}