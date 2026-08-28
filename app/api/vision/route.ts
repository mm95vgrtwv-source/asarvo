import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_OLLAMA_URL = "http://127.0.0.1:11434";
const DEFAULT_VISION_MODEL = "qwen2.5vl:3b";
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const OLLAMA_TIMEOUT_MS = 90_000;

type VisionAnalysis = {
  searchQuery: string;
  productCategory: string | null;
  brand: string | null;
  model: string | null;
  color: string | null;
  visibleDetails: string[];
  confidence: number;
};

function cleanNullableString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function cleanStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 8);
}

function clampConfidence(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return Math.min(1, Math.max(0, parsed));
}

function extractJsonObject(raw: string): Record<string, unknown> | null {
  const trimmed = raw.trim();

  if (!trimmed) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed);
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    const firstBrace = trimmed.indexOf("{");
    const lastBrace = trimmed.lastIndexOf("}");

    if (firstBrace === -1 || lastBrace <= firstBrace) {
      return null;
    }

    try {
      const parsed = JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
      return parsed && typeof parsed === "object"
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }
}

function normalizeVisionAnalysis(raw: Record<string, unknown>): VisionAnalysis | null {
  const searchQuery =
    cleanNullableString(raw.searchQuery) ??
    cleanNullableString(raw.query);

  if (!searchQuery) {
    return null;
  }

  return {
    searchQuery,
    productCategory: cleanNullableString(raw.productCategory),
    brand: cleanNullableString(raw.brand),
    model: cleanNullableString(raw.model),
    color: cleanNullableString(raw.color),
    visibleDetails: cleanStringArray(raw.visibleDetails),
    confidence: clampConfidence(raw.confidence),
  };
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const image = formData.get("image");

    if (!(image instanceof File)) {
      return NextResponse.json(
        {
          ok: false,
          error: "Nie przesłano zdjęcia produktu.",
        },
        { status: 400 }
      );
    }

    if (!image.type.startsWith("image/")) {
      return NextResponse.json(
        {
          ok: false,
          error: "Przesłany plik nie jest obrazem.",
        },
        { status: 400 }
      );
    }

    if (image.size <= 0 || image.size > MAX_IMAGE_BYTES) {
      return NextResponse.json(
        {
          ok: false,
          error: "Zdjęcie musi mieć maksymalnie 12 MB.",
        },
        { status: 413 }
      );
    }

    const imageBuffer = Buffer.from(await image.arrayBuffer());
    const imageBase64 = imageBuffer.toString("base64");

    const ollamaUrl = (
      process.env.OLLAMA_URL?.trim() || DEFAULT_OLLAMA_URL
    ).replace(/\/+$/, "");

    const model =
      process.env.OLLAMA_VISION_MODEL?.trim() || DEFAULT_VISION_MODEL;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS);

    let ollamaResponse: Response;

    try {
      ollamaResponse = await fetch(`${ollamaUrl}/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        signal: controller.signal,
        body: JSON.stringify({
          model,
          stream: false,
          options: {
            temperature: 0.1,
          },
          format: {
            type: "object",
            properties: {
              searchQuery: { type: "string" },
              productCategory: {
                anyOf: [{ type: "string" }, { type: "null" }],
              },
              brand: {
                anyOf: [{ type: "string" }, { type: "null" }],
              },
              model: {
                anyOf: [{ type: "string" }, { type: "null" }],
              },
              color: {
                anyOf: [{ type: "string" }, { type: "null" }],
              },
              visibleDetails: {
                type: "array",
                items: { type: "string" },
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
          messages: [
            {
              role: "user",
              content:
                `Jesteś modułem rozpoznawania produktów ze zdjęć w polskiej wyszukiwarce zakupowej ASARVO.
Analizuj WYŁĄCZNIE to, co faktycznie widać na zdjęciu.
Rozpoznaj kategorię produktu oraz — tylko jeśli jest to wizualnie uzasadnione — markę, model, kolor i przydatne cechy zakupowe.
Nigdy nie zgaduj dokładnego modelu, pojemności, rozmiaru, wersji ani marki, jeśli nie masz pewności.
Jeśli dokładna identyfikacja jest niepewna, użyj szerszej kategorii produktu i widocznych cech.
BARDZO WAŻNE: wszystkie pola tekstowe w odpowiedzi mają być po polsku, w szczególności searchQuery, productCategory, color i visibleDetails.
Nazwy własne marek i modeli pozostaw w oryginalnej formie, np. Valentino, Nike, iPhone 15.
searchQuery ma być krótkim, naturalnym zapytaniem zakupowym po polsku, gotowym do przekazania bezpośrednio do wyszukiwarki produktów, np. portfel Valentino czarny skórzany, a nie black Valentino wallet.
Nie dodawaj ceny, chyba że jest ona częścią identyfikacji produktu widoczną na zdjęciu.
confidence ma określać pewność poprawności searchQuery w skali od 0 do 1.
Zwróć WYŁĄCZNIE poprawny JSON zgodny ze schematem.`,
              images: [imageBase64],
            },
          ],
        }),
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return NextResponse.json(
          {
            ok: false,
            error:
              "Analiza zdjęcia przekroczyła 90 sekund. Spróbuj mniejszego zdjęcia.",
          },
          { status: 504 }
        );
      }

      return NextResponse.json(
        {
          ok: false,
          error:
            "Nie mogę połączyć się z lokalnym AI obrazu. Uruchom Ollama i model qwen2.5vl:3b.",
        },
        { status: 503 }
      );
    } finally {
      clearTimeout(timeout);
    }

    const payload = (await ollamaResponse.json().catch(() => null)) as
      | {
          message?: {
            content?: string;
          };
          error?: string;
        }
      | null;

    if (!ollamaResponse.ok) {
      const ollamaError =
        typeof payload?.error === "string" ? payload.error : "";

      const modelMissing =
        /model.*not found|pull model|not found/i.test(ollamaError);

      return NextResponse.json(
        {
          ok: false,
          error: modelMissing
            ? `Model ${model} nie jest jeszcze pobrany. W terminalu uruchom: ollama pull ${model}`
            : ollamaError ||
              "Lokalny model obrazu zwrócił błąd.",
        },
        { status: 502 }
      );
    }

    const rawContent = payload?.message?.content;

    if (typeof rawContent !== "string") {
      return NextResponse.json(
        {
          ok: false,
          error: "Model nie zwrócił analizy zdjęcia.",
        },
        { status: 502 }
      );
    }

    const parsed = extractJsonObject(rawContent);
    const analysis = parsed ? normalizeVisionAnalysis(parsed) : null;

    if (!analysis) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Nie udało się bezpiecznie rozpoznać produktu na zdjęciu. Spróbuj wyraźniejszego zdjęcia.",
        },
        { status: 422 }
      );
    }

    return NextResponse.json({
      ok: true,
      query: analysis.searchQuery,
      confidence: analysis.confidence,
      detected: {
        category: analysis.productCategory,
        brand: analysis.brand,
        model: analysis.model,
        color: analysis.color,
        visibleDetails: analysis.visibleDetails,
      },
      visionModel: model,
    });
  } catch (error) {
    console.error("[ASARVO vision] Unexpected error:", error);

    return NextResponse.json(
      {
        ok: false,
        error: "Wystąpił błąd podczas analizy zdjęcia.",
      },
      { status: 500 }
    );
  }
}