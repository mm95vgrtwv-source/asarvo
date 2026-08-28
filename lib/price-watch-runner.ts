import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import {
  runPriceWatchCheck as runPriceWatchCheckCore,
  type RunPriceWatchResult,
} from "@/lib/price-watch-runner-core";

export type { RunPriceWatchResult } from "@/lib/price-watch-runner-core";

export async function runPriceWatchCheck(
  watchId: string,
  userId: string,
  suppliedClient?: SupabaseClient
): Promise<RunPriceWatchResult> {
  const supabase =
    suppliedClient ??
    (await createClient());

  return await runPriceWatchCheckCore(
    watchId,
    userId,
    supabase
  );
}
