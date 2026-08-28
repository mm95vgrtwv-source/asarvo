"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { runPriceWatchCheck } from "@/lib/price-watch-runner";
import { sendPriceAlertTestEmail } from "@/lib/email";

async function requireUser() {
  const supabase = await createClient();

  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();

  const userId = claimsData?.claims?.sub;

  if (claimsError || !userId) {
    redirect("/login");
  }

  return { supabase, userId };
}

function readId(formData: FormData): string {
  const value = formData.get("id");
  return typeof value === "string"
    ? value.trim()
    : "";
}

function readPositivePrice(
  formData: FormData
): number | null {
  const raw = formData.get("targetPrice");

  if (typeof raw !== "string") {
    return null;
  }

  const normalized = raw
    .trim()
    .replace(/\s+/g, "")
    .replace(",", ".");

  const value = Number(normalized);

  if (
    !Number.isFinite(value) ||
    value <= 0
  ) {
    return null;
  }

  return Math.round(value * 100) / 100;
}

export async function signout() {
  const supabase = await createClient();

  await supabase.auth.signOut();

  revalidatePath("/", "layout");
  redirect("/");
}

export async function removeHistoryEntry(
  formData: FormData
) {
  const id = readId(formData);

  if (!id) {
    return;
  }

  const { supabase, userId } =
    await requireUser();

  await supabase
    .from("search_history")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);

  revalidatePath("/account");
}

export async function clearSearchHistory() {
  const { supabase, userId } =
    await requireUser();

  await supabase
    .from("search_history")
    .delete()
    .eq("user_id", userId);

  revalidatePath("/account");
}

export async function removeFavorite(
  formData: FormData
) {
  const id = readId(formData);

  if (!id) {
    return;
  }

  const { supabase, userId } =
    await requireUser();

  await supabase
    .from("favorites")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);

  revalidatePath("/account");
}

export async function removePriceWatch(
  formData: FormData
) {
  const id = readId(formData);

  if (!id) {
    return;
  }

  const { supabase, userId } =
    await requireUser();

  await supabase
    .from("price_watches")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);

  revalidatePath("/account");
}

export async function updatePriceWatchTarget(
  formData: FormData
) {
  const id = readId(formData);
  const targetPrice =
    readPositivePrice(formData);

  if (
    !id ||
    targetPrice === null
  ) {
    return;
  }

  const { supabase, userId } =
    await requireUser();

  await supabase
    .from("price_watches")
    .update({
      target_price: targetPrice,
      active: true,
      // Zmiana progu oznacza nową intencję użytkownika,
      // więc kolejny check może ponownie wygenerować alert e-mail.
      email_alert_armed: true,
    })
    .eq("id", id)
    .eq("user_id", userId);

  revalidatePath("/account");
}

export async function checkPriceWatchNow(
  formData: FormData
) {
  const id = readId(formData);

  if (!id) {
    return;
  }

  const { userId } = await requireUser();

  await runPriceWatchCheck(
    id,
    userId
  );

  revalidatePath("/account");
}

export async function checkAllPriceWatchesNow() {
  const { supabase, userId } =
    await requireUser();

  const { data: watches } = await supabase
    .from("price_watches")
    .select("id")
    .eq("user_id", userId)
    .eq("active", true)
    .order("updated_at", {
      ascending: false,
    })
    .limit(10);

  for (const watch of watches ?? []) {
    if (typeof watch.id === "string") {
      await runPriceWatchCheck(
        watch.id,
        userId
      );
    }
  }

  revalidatePath("/account");
}

export async function enablePriceEmailAlerts() {
  const { supabase, userId } =
    await requireUser();

  await supabase
    .from("profiles")
    .update({
      email_price_alerts_enabled: true,
    })
    .eq("id", userId);

  // Jeżeli jakiś watch był wcześniej nieuzbrojony,
  // nie zmieniamy go. Nowy alert nastąpi przy kolejnym
  // wejściu w strefę celu lub po zmianie progu.
  revalidatePath("/account");
}

export async function disablePriceEmailAlerts() {
  const { supabase, userId } =
    await requireUser();

  await supabase
    .from("profiles")
    .update({
      email_price_alerts_enabled: false,
    })
    .eq("id", userId);

  revalidatePath("/account");
}

export async function sendTestPriceEmail() {
  const { supabase, userId } =
    await requireUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("email,display_name")
    .eq("id", userId)
    .maybeSingle();

  if (
    !profile ||
    typeof profile.email !== "string" ||
    !profile.email.trim()
  ) {
    return;
  }

  const result =
    await sendPriceAlertTestEmail({
      to: profile.email.trim(),
      displayName:
        typeof profile.display_name === "string"
          ? profile.display_name
          : null,
    });

  if (!result.ok) {
    console.error(
      "[ASARVO EMAIL][TEST]",
      result.error
    );
  }

  revalidatePath("/account");
}
