import type {
  Config,
  Context,
} from "@netlify/functions";

import { createAdminClient } from "../../lib/supabase/admin";
import {
  runPriceWatchCheck,
  type RunPriceWatchResult,
} from "../../lib/price-watch-runner-core";

declare const process: {
  env: Record<string, string | undefined>;
};

const STALE_AFTER_MS =
  25 * 60 * 1000;

const BATCH_LIMIT = 30;

const CONCURRENCY = 3;

type WatchReference = {
  id: string;
  user_id: string;
  last_checked_at: string | null;
};

function isStale(
  lastCheckedAt: string | null
): boolean {
  if (!lastCheckedAt) {
    return true;
  }

  const time =
    new Date(lastCheckedAt).getTime();

  if (!Number.isFinite(time)) {
    return true;
  }

  return (
    Date.now() - time >=
    STALE_AFTER_MS
  );
}

function getMonitorSecret(): string {
  return (
    process.env.ASARVO_MONITOR_SECRET ??
    ""
  ).trim();
}

function requestHasValidSecret(
  request: Request
): boolean {
  const expected =
    getMonitorSecret();

  if (!expected) {
    console.error(
      "[ASARVO CLOUD MONITOR] Brak ASARVO_MONITOR_SECRET."
    );

    return false;
  }

  const supplied =
    request.headers
      .get(
        "x-asarvo-monitor-secret"
      )
      ?.trim() ?? "";

  return (
    supplied.length > 0 &&
    supplied === expected
  );
}

async function runWithConcurrency<
  T,
  R
>(
  items: T[],
  concurrency: number,
  worker: (
    item: T
  ) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];

  let nextIndex = 0;

  async function runner() {
    while (true) {
      const index =
        nextIndex++;

      if (
        index >=
        items.length
      ) {
        return;
      }

      const result =
        await worker(
          items[index]
        );

      results[index] =
        result;
    }
  }

  const workerCount =
    Math.min(
      Math.max(
        1,
        concurrency
      ),
      items.length
    );

  await Promise.all(
    Array.from(
      {
        length:
          workerCount,
      },
      () => runner()
    )
  );

  return results;
}

export default async function handler(
  request: Request,
  _context: Context
): Promise<void> {
  const startedAt =
    new Date().toISOString();

  console.log(
    "[ASARVO CLOUD MONITOR] START",
    startedAt
  );

  if (
    !requestHasValidSecret(
      request
    )
  ) {
    console.error(
      "[ASARVO CLOUD MONITOR] Odrzucono wywołanie — zły lub brakujący sekret."
    );

    return;
  }

  let admin;

  try {
    admin =
      createAdminClient();
  } catch (error) {
    console.error(
      "[ASARVO CLOUD MONITOR] Nie udało się utworzyć klienta admin.",
      error
    );

    return;
  }

  const {
    data,
    error,
  } = await admin
    .from(
      "price_watches"
    )
    .select(
      "id,user_id,last_checked_at"
    )
    .eq(
      "active",
      true
    )
    .order(
      "last_checked_at",
      {
        ascending: true,
        nullsFirst: true,
      }
    )
    .limit(
      BATCH_LIMIT
    );

  if (error) {
    console.error(
      "[ASARVO CLOUD MONITOR] Nie udało się pobrać obserwacji.",
      error
    );

    return;
  }

  const watches =
    (
      data ??
      []
    ) as unknown as WatchReference[];

  const staleWatches =
    watches.filter(
      (watch) =>
        isStale(
          watch.last_checked_at
        )
    );

  console.log(
    "[ASARVO CLOUD MONITOR] Aktywne pobrane:",
    watches.length,
    "Do sprawdzenia:",
    staleWatches.length
  );

  if (
    staleWatches.length ===
    0
  ) {
    console.log(
      "[ASARVO CLOUD MONITOR] Nic do sprawdzenia."
    );

    return;
  }

  const results =
    await runWithConcurrency(
      staleWatches,
      CONCURRENCY,
      async (
        watch
      ): Promise<RunPriceWatchResult> => {
        try {
          const result =
            await runPriceWatchCheck(
              watch.id,
              watch.user_id,
              admin
            );

          console.log(
            "[ASARVO CLOUD MONITOR][WATCH]",
            {
              id:
                watch.id,

              ok:
                result.ok,

              skipped:
                result.skipped,

              price:
                result.price,

              targetReached:
                result.targetReached,

              emailSent:
                result.emailSent,

              reason:
                result.reason,
            }
          );

          return result;
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : "Nieznany błąd.";

          console.error(
            "[ASARVO CLOUD MONITOR][WATCH ERROR]",
            watch.id,
            error
          );

          return {
            id:
              watch.id,

            ok:
              false,

            skipped:
              false,

            price:
              null,

            available:
              null,

            targetReached:
              false,

            emailSent:
              false,

            reason:
              message,
          };
        }
      }
    );

  const summary = {
    total:
      results.length,

    ok:
      results.filter(
        (result) =>
          result.ok
      ).length,

    failed:
      results.filter(
        (result) =>
          !result.ok
      ).length,

    skipped:
      results.filter(
        (result) =>
          result.skipped
      ).length,

    targetReached:
      results.filter(
        (result) =>
          result.targetReached
      ).length,

    emailsSent:
      results.filter(
        (result) =>
          result.emailSent
      ).length,
  };

  console.log(
    "[ASARVO CLOUD MONITOR] KONIEC",
    summary
  );
}

export const config: Config = {
  background: true,
  method: "POST",
  path: "/api/internal/asarvo-price-monitor-worker",
};
