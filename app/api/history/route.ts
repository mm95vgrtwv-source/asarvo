import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const MAX_HISTORY_PER_USER = 200;
const DUPLICATE_WINDOW_MS = 10_000;

type HistoryBody = {
  query?: unknown;
  resultCount?: unknown;
  interpreted?: unknown;
};

function cleanQuery(value: unknown): string {
  return typeof value === "string" ? value.trim().slice(0, 500) : "";
}

function cleanResultCount(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return Math.max(0, Math.floor(value));
}

export async function POST(request: Request) {
  const supabase = await createClient();

  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();

  const userId = claimsData?.claims?.sub;

  // Gość może normalnie korzystać z ASARVO.
  // Po prostu nie zapisujemy mu historii w bazie.
  if (claimsError || !userId) {
    return new NextResponse(null, { status: 204 });
  }

  let body: HistoryBody;

  try {
    body = (await request.json()) as HistoryBody;
  } catch {
    return NextResponse.json(
      { error: "Nieprawidłowe dane historii." },
      { status: 400 }
    );
  }

  const query = cleanQuery(body.query);
  const resultCount = cleanResultCount(body.resultCount);

  if (!query) {
    return NextResponse.json(
      { error: "Brak zapytania." },
      { status: 400 }
    );
  }

  // Ochrona przed podwójnym wpisem w React Strict Mode / szybkim refreshem.
  const { data: latest } = await supabase
    .from("search_history")
    .select("id,searched_at")
    .eq("user_id", userId)
    .eq("query", query)
    .order("searched_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latest?.searched_at) {
    const latestTime = new Date(latest.searched_at).getTime();

    if (
      Number.isFinite(latestTime) &&
      Date.now() - latestTime < DUPLICATE_WINDOW_MS
    ) {
      return NextResponse.json({
        ok: true,
        duplicateIgnored: true,
      });
    }
  }

  const { error: insertError } = await supabase
    .from("search_history")
    .insert({
      user_id: userId,
      query,
      result_count: resultCount,
      interpreted:
        body.interpreted &&
        typeof body.interpreted === "object"
          ? body.interpreted
          : null,
    });

  if (insertError) {
    console.error("[ASARVO HISTORY][INSERT]", insertError);

    return NextResponse.json(
      { error: "Nie udało się zapisać historii." },
      { status: 500 }
    );
  }

  // Trzymamy maksymalnie 200 ostatnich wyszukiwań na konto,
  // żeby nie zapychać darmowej bazy niepotrzebnymi rekordami.
  const { data: oldRows } = await supabase
    .from("search_history")
    .select("id")
    .eq("user_id", userId)
    .order("searched_at", { ascending: false })
    .range(MAX_HISTORY_PER_USER, MAX_HISTORY_PER_USER + 499);

  if (oldRows?.length) {
    const ids = oldRows
      .map((row) => row.id)
      .filter((id): id is number => typeof id === "number");

    if (ids.length) {
      await supabase
        .from("search_history")
        .delete()
        .eq("user_id", userId)
        .in("id", ids);
    }
  }

  return NextResponse.json({ ok: true });
}

export async function GET() {
  const supabase = await createClient();

  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();

  const userId = claimsData?.claims?.sub;

  if (claimsError || !userId) {
    return NextResponse.json(
      { authenticated: false, history: [] },
      { status: 401 }
    );
  }

  const { data, error } = await supabase
    .from("search_history")
    .select("id,query,result_count,interpreted,searched_at")
    .eq("user_id", userId)
    .order("searched_at", { ascending: false })
    .limit(MAX_HISTORY_PER_USER);

  if (error) {
    console.error("[ASARVO HISTORY][GET]", error);

    return NextResponse.json(
      { error: "Nie udało się pobrać historii." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    authenticated: true,
    history: data ?? [],
  });
}
