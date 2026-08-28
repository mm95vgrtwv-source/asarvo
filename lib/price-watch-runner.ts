import { createClient } from "@/lib/supabase/server";
import { checkProductPrice } from "@/lib/price-monitor";
import { sendPriceAlertEmail } from "@/lib/email";

const MIN_CHECK_GAP_MS = 20 * 1000;

type WatchRow = {
  id: string;
  user_id: string;
  product: unknown;
  target_price: number | string;
  current_price: number | string | null;
  last_checked_at: string | null;
  active: boolean;
  email_alert_armed: boolean;
};

type RunPriceWatchResult = {
  id: string;
  ok: boolean;
  skipped: boolean;
  price: number | null;
  available: boolean | null;
  targetReached: boolean;
  emailSent: boolean;
  reason: string | null;
};

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readString(
  object: Record<string, unknown>,
  key: string,
  fallback = ""
): string {
  const value = object[key];
  return typeof value === "string"
    ? value.trim()
    : fallback;
}

function toNumber(value: unknown): number | null {
  if (
    typeof value === "number" &&
    Number.isFinite(value)
  ) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value.replace(",", "."));
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function ageMs(value: string | null): number {
  if (!value) {
    return Number.POSITIVE_INFINITY;
  }

  const time = new Date(value).getTime();

  return Number.isFinite(time)
    ? Math.max(0, Date.now() - time)
    : Number.POSITIVE_INFINITY;
}

async function claimCheckSlot(
  watch: WatchRow,
  checkedAt: string
): Promise<boolean> {
  const supabase = await createClient();

  if (ageMs(watch.last_checked_at) < MIN_CHECK_GAP_MS) {
    return false;
  }

  let query = supabase
    .from("price_watches")
    .update({
      last_checked_at: checkedAt,
    })
    .eq("id", watch.id)
    .eq("user_id", watch.user_id);

  query =
    watch.last_checked_at === null
      ? query.is("last_checked_at", null)
      : query.eq(
          "last_checked_at",
          watch.last_checked_at
        );

  const { data, error } = await query
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("[ASARVO MONITOR][CLAIM]", error);
    return false;
  }

  return Boolean(data?.id);
}

async function maybeSendEmailAlert(params: {
  watch: WatchRow;
  productName: string;
  store: string;
  productUrl: string;
  price: number;
  targetPrice: number;
}): Promise<boolean> {
  if (!params.watch.email_alert_armed) {
    return false;
  }

  const supabase = await createClient();

  const { data: profile, error: profileError } =
    await supabase
      .from("profiles")
      .select(
        "email,display_name,email_price_alerts_enabled"
      )
      .eq("id", params.watch.user_id)
      .maybeSingle();

  if (profileError) {
    console.error(
      "[ASARVO EMAIL][PROFILE]",
      profileError
    );
    return false;
  }

  if (
    !profile?.email_price_alerts_enabled ||
    typeof profile.email !== "string" ||
    !profile.email.trim()
  ) {
    return false;
  }

  const result = await sendPriceAlertEmail({
    to: profile.email.trim(),
    displayName:
      typeof profile.display_name === "string"
        ? profile.display_name
        : null,
    productName: params.productName,
    store: params.store,
    currentPrice: params.price,
    targetPrice: params.targetPrice,
    productUrl: params.productUrl || null,
  });

  if (!result.ok) {
    console.error(
      "[ASARVO EMAIL][SEND]",
      result.error
    );
    return false;
  }

  const notifiedAt = new Date().toISOString();

  await supabase
    .from("price_watches")
    .update({
      email_alert_armed: false,
      last_email_notified_at: notifiedAt,
      last_email_notified_price: params.price,
      last_email_notified_target_price:
        params.targetPrice,
    })
    .eq("id", params.watch.id)
    .eq("user_id", params.watch.user_id);

  const { error: logError } = await supabase
    .from("price_email_notifications")
    .insert({
      price_watch_id: params.watch.id,
      user_id: params.watch.user_id,
      recipient: profile.email.trim(),
      price: params.price,
      target_price: params.targetPrice,
      provider: "brevo",
      provider_message_id: result.messageId,
      status: "sent",
      created_at: notifiedAt,
    });

  if (logError) {
    console.error(
      "[ASARVO EMAIL][LOG]",
      logError
    );
  }

  return true;
}

export async function runPriceWatchCheck(
  watchId: string,
  userId: string
): Promise<RunPriceWatchResult> {
  const supabase = await createClient();

  const { data: watchData, error } = await supabase
    .from("price_watches")
    .select(
      "id,user_id,product,target_price,current_price,last_checked_at,active,email_alert_armed"
    )
    .eq("id", watchId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !watchData) {
    return {
      id: watchId,
      ok: false,
      skipped: false,
      price: null,
      available: null,
      targetReached: false,
      emailSent: false,
      reason: "Nie znaleziono obserwacji.",
    };
  }

  const watch = watchData as WatchRow;

  if (!watch.active) {
    return {
      id: watch.id,
      ok: true,
      skipped: true,
      price: null,
      available: null,
      targetReached: false,
      emailSent: false,
      reason: "Obserwacja jest wyłączona.",
    };
  }

  const checkedAt = new Date().toISOString();
  const claimed = await claimCheckSlot(
    watch,
    checkedAt
  );

  if (!claimed) {
    return {
      id: watch.id,
      ok: true,
      skipped: true,
      price: null,
      available: null,
      targetReached: false,
      emailSent: false,
      reason:
        "Pominięto zbyt szybkie ponowne sprawdzenie.",
    };
  }

  const product = asObject(watch.product);
  const url = readString(product, "url");
  const name = readString(
    product,
    "name",
    "Obserwowany produkt"
  );
  const store = readString(
    product,
    "store",
    "Nieznany sklep"
  );
  const targetPrice = toNumber(
    watch.target_price
  );
  const previousPrice = toNumber(
    watch.current_price
  );

  if (!url || targetPrice === null) {
    await supabase.from("price_watch_checks").insert({
      price_watch_id: watch.id,
      user_id: userId,
      price: null,
      available: null,
      source_url: url || null,
      checked_at: checkedAt,
    });

    return {
      id: watch.id,
      ok: false,
      skipped: false,
      price: null,
      available: null,
      targetReached: false,
      emailSent: false,
      reason:
        !url
          ? "Brak adresu oferty."
          : "Nieprawidłowy próg ceny.",
    };
  }

  const result = await checkProductPrice(
    url,
    name
  );

  const updatePayload: Record<string, unknown> = {
    last_checked_at: checkedAt,
    last_checked_price: result.price,
  };

  if (result.price !== null) {
    updatePayload.current_price = result.price;
  }

  const targetReached =
    result.price !== null &&
    result.price <= targetPrice;

  // Jeżeli cena znowu wyszła ponad próg, uzbrajamy
  // możliwość wysłania kolejnego e-maila przy przyszłym spadku.
  if (
    result.price !== null &&
    result.price > targetPrice
  ) {
    updatePayload.email_alert_armed = true;
  }

  await supabase
    .from("price_watches")
    .update(updatePayload)
    .eq("id", watch.id)
    .eq("user_id", userId);

  await supabase.from("price_watch_checks").insert({
    price_watch_id: watch.id,
    user_id: userId,
    price: result.price,
    available: result.available,
    source_url: result.checkedUrl || url,
    checked_at: checkedAt,
  });

  let emailSent = false;

  // Wysyłka tylko po wejściu w strefę celu.
  // Dzięki email_alert_armed nie spamujemy przy każdym checku.
  if (
    targetReached &&
    result.price !== null &&
    watch.email_alert_armed
  ) {
    emailSent = await maybeSendEmailAlert({
      watch,
      productName: name,
      store,
      productUrl: url,
      price: result.price,
      targetPrice,
    });
  }

  return {
    id: watch.id,
    ok: result.ok,
    skipped: false,
    price: result.price,
    available: result.available,
    targetReached,
    emailSent,
    reason: result.error,
  };
}
