import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { runPriceWatchCheck } from "@/lib/price-watch-runner";

const STALE_AFTER_MS = 30 * 60 * 1000;
const MAX_AUTOMATIC_CHECKS_PER_REQUEST = 5;

function isStale(value: string | null): boolean {
  if (!value) {
    return true;
  }

  const time = new Date(value).getTime();

  return (
    !Number.isFinite(time) ||
    Date.now() - time >= STALE_AFTER_MS
  );
}

export async function POST() {
  const supabase = await createClient();

  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();

  const userId = claimsData?.claims?.sub;

  if (claimsError || !userId) {
    return NextResponse.json(
      { error: "Musisz być zalogowany." },
      { status: 401 }
    );
  }

  const { data: watches, error } = await supabase
    .from("price_watches")
    .select("id,last_checked_at")
    .eq("user_id", userId)
    .eq("active", true)
    .order("updated_at", { ascending: false });

  if (error) {
    console.error(
      "[ASARVO MONITOR][LOAD]",
      error
    );

    return NextResponse.json(
      {
        error:
          "Nie udało się pobrać obserwowanych cen.",
      },
      { status: 500 }
    );
  }

  const staleWatches = (watches ?? [])
    .filter((watch) =>
      isStale(
        typeof watch.last_checked_at === "string"
          ? watch.last_checked_at
          : null
      )
    )
    .slice(0, MAX_AUTOMATIC_CHECKS_PER_REQUEST);

  const results = [];

  for (const watch of staleWatches) {
    if (typeof watch.id !== "string") {
      continue;
    }

    results.push(
      await runPriceWatchCheck(
        watch.id,
        userId
      )
    );
  }

  return NextResponse.json({
    ok: true,
    checked: results.filter(
      (result) => !result.skipped
    ).length,
    emailsSent: results.filter(
      (result) => result.emailSent
    ).length,
    results,
  });
}
