import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash-lite";
const GEMINI_INTERACTIONS_URL =
  "https://generativelanguage.googleapis.com/v1beta/interactions";

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

type GeminiInteractionResponse = {
  id?: string;
  model?: string;
  status?: string;

  steps?: Array<{
    type?: string;

    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;

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

  return trimmed
    ? trimmed
    : null;
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

function getInteractionText(
  payload: GeminiInteractionResponse
): string | null {
  const steps =
    Array.isArray(payload.steps)
      ? payload.steps
      : [];

  for (
    let i = steps.length - 1;
    i >= 0;
    i -= 1
  ) {
    const step = steps[i];

    if (
      step?.type !== "model_output" ||
      !Array.isArray(step.content)
    ) {
      continue;
    }

    const text = step.content
      .filter(
        (part) =>
          part?.type === "text" &&
          typeof part.text === "string"
      )
      .map(
        (part) =>
          part.text ?? ""
      )
      .join("")
      .trim();

    if (text) {
      return text;
    }
  }

  return null;
}

const VISION_PROMPT = [
  "Jesteś modułem rozpoznawania produktów ze zdjęć w polskiej wyszukiwarce zakupowej ASARVO.",

  "Analizuj WYŁĄCZNIE to, co faktycznie widać na zdjęciu.",

  "Twoim zadaniem jest zbudowanie możliwie najlepszego zapytania zakupowego, które zostanie przekazane do silnika wyszukiwania ASARVO.",

  "Rozpoznaj kategorię produktu oraz tylko wtedy, gdy istnieją wystarczające dowody wizualne: markę, model, kolor oraz istotne cechy zakupowe.",

  "Nigdy nie zgaduj marki, modelu, wariantu, generacji, pojemności, rozmiaru ani innych parametrów, których nie można wiarygodnie ustalić ze zdjęcia.",

  "Jeżeli dokładny model jest niepewny, użyj szerszej kategorii produktu i cech widocznych na zdjęciu.",

  "Jeżeli na produkcie lub opakowaniu widoczne są logo, nazwa marki, model, oznaczenie produktu lub napis, możesz wykorzystać je do identyfikacji.",

  "Wszystkie opisy mają być po polsku. Nazwy własne marek i modeli pozostaw w oryginalnej formie.",

  'searchQuery ma być krótkim i naturalnym zapytaniem zakupowym po polsku, np. "portfel Valentino czarny skórzany", "buty Nike Air Max czarne", "słuchawki bezprzewodowe nauszne czarne".',

  "Nie dodawaj ceny, chyba że cena jest istotną częścią identyfikacji widoczną bezpośrednio na produkcie lub opakowaniu.",

  "productCategory ma zawierać krótką nazwę kategorii po polsku.",

  "Jeśli marka, model lub kolor są nieznane, zwróć dla danego pola pusty string.",

  "visibleDetails ma zawierać maksymalnie 8 krótkich cech rzeczywiście widocznych na zdjęciu.",

  "confidence oznacza pewność poprawności searchQuery od 0 do 1.",

  "Nie twórz ogólnego opisu zdjęcia. Odpowiedź służy wyłącznie do znalezienia produktu do kupienia.",
].join("\n");

export async function POST(
  request: Request
) {
  try {
    const apiKey =
      process.env
        .GEMINI_API_KEY
        ?.trim();

    if (!apiKey) {
      console.error(
        "[ASARVO VISION] Missing GEMINI_API_KEY"
      );

      return NextResponse.json(
        {
          ok: false,
          error:
            "Moduł rozpoznawania zdjęć nie jest skonfigurowany.",
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
          GEMINI_INTERACTIONS_URL,
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json",

              "x-goog-api-key":
                apiKey,
            },

            cache:
              "no-store",

            signal:
              controller.signal,

            body:
              JSON.stringify({
                model,

                input: [
                  {
                    type: "image",

                    mime_type:
                      image.type,

                    data:
                      imageBase64,
                  },

                  {
                    type: "text",

                    text:
                      VISION_PROMPT,
                  },
                ],

                response_format: {
                  type: "text",

                  mime_type:
                    "application/json",

                  schema: {
                    type: "object",

                    additionalProperties:
                      false,

                    properties: {
                      searchQuery: {
                        type: "string",

                        description:
                          "Krótkie naturalne zapytanie zakupowe po polsku.",
                      },

                      productCategory:
                        {
                          type: "string",

                          description:
                            "Kategoria produktu po polsku.",
                        },

                      brand: {
                        type: "string",

                        description:
                          "Marka tylko jeśli jest wiarygodnie rozpoznana, inaczej pusty string.",
                      },

                      model: {
                        type: "string",

                        description:
                          "Model tylko jeśli jest wiarygodnie rozpoznany, inaczej pusty string.",
                      },

                      color: {
                        type: "string",

                        description:
                          "Widoczny kolor produktu po polsku lub pusty string.",
                      },

                      visibleDetails:
                        {
                          type: "array",

                          items: {
                            type: "string",
                          },
                        },

                      confidence: {
                        type: "number",

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

                generation_config: {
                  max_output_tokens:
                    512,

                  thinking_level:
                    "minimal",
                },

                store: false,
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
      clearTimeout(
        timeout
      );
    }

    const payload =
      (await geminiResponse
        .json()
        .catch(
          () => null
        )) as
        | GeminiInteractionResponse
        | null;

    if (
      !geminiResponse.ok
    ) {
      const providerError =
        payload?.error
          ?.message;

      console.error(
        "[ASARVO VISION] Gemini Interactions API error:",
        {
          status:
            geminiResponse.status,

          providerStatus:
            payload?.error
              ?.status,

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

      if (
        geminiResponse.status ===
        404
      ) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "Model AI rozpoznawania zdjęć jest niedostępny.",
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
      payload.status &&
      payload.status !==
        "completed"
    ) {
      console.error(
        "[ASARVO VISION] Interaction not completed:",
        {
          id:
            payload.id,
          status:
            payload.status,
        }
      );

      return NextResponse.json(
        {
          ok: false,
          error:
            "AI nie zakończyło analizy zdjęcia. Spróbuj ponownie.",
        },
        {
          status: 502,
        }
      );
    }

    const rawContent =
      getInteractionText(
        payload
      );

    if (!rawContent) {
      console.error(
        "[ASARVO VISION] Interaction returned no model text:",
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
        "gemini-interactions",

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