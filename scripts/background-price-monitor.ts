import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { checkProductPrice } from "../lib/price-monitor";
import { sendPriceAlertEmail } from "../lib/email";

const CHECK_INTERVAL_MS = 30 * 60 * 1000;
const MAX_CHECKS_PER_RUN = 20;
const MIN_CHECK_GAP_MS = 20 * 1000;

function loadEnvFile() {
  const file = path.join(process.cwd(), ".env.local");

  if (!fs.existsSync(file)) {
    throw new Error("Brakuje .env.local");
  }

  const content = fs.readFileSync(file, "utf8");

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const separator = line.indexOf("=");

    if (separator <= 0) {
      continue;
    }

    const key = line.slice(0, separator).trim();

    let value = line
      .slice(separator + 1)
      .trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadEnvFile();

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
  process.env.SUPABASE_URL?.trim();

const supabaseSecret =
  process.env.SUPABASE_SECRET_KEY?.trim() ||
  process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

if (!supabaseUrl) {
  throw new Error(
    "Brakuje NEXT_PUBLIC_SUPABASE_URL w .env.local."
  );
}

if (!supabaseSecret) {
  throw new Error(
    "Brakuje SUPABASE_SECRET_KEY w .env.local."
  );
}

const supabase = createClient(
  supabaseUrl,
  supabaseSecret,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);

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

function asObject(
  value: unknown
): Record<string, unknown> {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function str(
  object: Record<string, unknown>,
  key: string,
  fallback = ""
): string {
  const value = object[key];

  return typeof value === "string"
    ? value.trim()
    : fallback;
}

function num(value: unknown): number | null {
  if (
    typeof value === "number" &&
    Number.isFinite(value)
  ) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(
      value.replace(",", ".")
    );

    return Number.isFinite(parsed)
      ? parsed
      : null;
  }

  return null;
}

function ageMs(
  value: string | null
): number {
  if (!value) {
    return Number.POSITIVE_INFINITY;
  }

  const time = new Date(value).getTime();

  if (!Number.isFinite(time)) {
    return Number.POSITIVE_INFINITY;
  }

  return Date.now() - time;
}

async function claimWatch(
  watch: WatchRow,
  checkedAt: string
): Promise<boolean> {
  if (
    ageMs(watch.last_checked_at) <
    MIN_CHECK_GAP_MS
  ) {
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
      ? query.is(
          "last_checked_at",
          null
        )
      : query.eq(
          "last_checked_at",
          watch.last_checked_at
        );

  const { data, error } =
    await query
      .select("id")
      .maybeSingle();

  if (error) {
    console.error(
      "[CLAIM ERROR]",
      error.message
    );

    return false;
  }

  return Boolean(data?.id);
}

async function maybeSendEmail(
  watch: WatchRow,
  productName: string,
  store: string,
  productUrl: string,
  price: number,
  targetPrice: number
): Promise<boolean> {
  if (!watch.email_alert_armed) {
    return false;
  }

  const { data: profile, error } =
    await supabase
      .from("profiles")
      .select(
        "email,display_name,email_price_alerts_enabled"
      )
      .eq("id", watch.user_id)
      .maybeSingle();

  if (error || !profile) {
    return false;
  }

  if (
    profile.email_price_alerts_enabled !== true ||
    typeof profile.email !== "string" ||
    !profile.email.trim()
  ) {
    return false;
  }

  const emailResult =
    await sendPriceAlertEmail({
      to: profile.email.trim(),

      displayName:
        typeof profile.display_name ===
        "string"
          ? profile.display_name
          : null,

      productName,
      store,
      currentPrice: price,
      targetPrice,
      productUrl,
    });

  if (!emailResult.ok) {
    console.error(
      "[EMAIL ERROR]",
      emailResult.error
    );

    return false;
  }

  const notifiedAt =
    new Date().toISOString();

  await supabase
    .from("price_watches")
    .update({
      email_alert_armed: false,
      last_email_notified_at:
        notifiedAt,
      last_email_notified_price:
        price,
      last_email_notified_target_price:
        targetPrice,
    })
    .eq("id", watch.id)
    .eq("user_id", watch.user_id);

  await supabase
    .from("price_email_notifications")
    .insert({
      price_watch_id: watch.id,
      user_id: watch.user_id,
      recipient: profile.email.trim(),
      price,
      target_price: targetPrice,
      provider: "brevo",
      provider_message_id:
        emailResult.messageId,
      status: "sent",
      created_at: notifiedAt,
    });

  console.log(
    `[EMAIL] Wysłano alert: ${productName}`
  );

  return true;
}

async function checkWatch(
  watch: WatchRow
) {
  const checkedAt =
    new Date().toISOString();

  const claimed =
    await claimWatch(
      watch,
      checkedAt
    );

  if (!claimed) {
    return {
      checked: false,
      emailSent: false,
    };
  }

  const product =
    asObject(watch.product);

  const productUrl =
    str(product, "url");

  const productName =
    str(
      product,
      "name",
      "Obserwowany produkt"
    );

  const store =
    str(
      product,
      "store",
      "Nieznany sklep"
    );

  const targetPrice =
    num(watch.target_price);

  if (
    !productUrl ||
    targetPrice === null
  ) {
    console.log(
      `[SKIP] ${productName}: brak URL albo progu`
    );

    return {
      checked: false,
      emailSent: false,
    };
  }

  console.log(
    `[CHECK] ${productName}`
  );

  const result =
    await checkProductPrice(
      productUrl,
      productName
    );

  const update: Record<
    string,
    unknown
  > = {
    last_checked_at:
      checkedAt,

    last_checked_price:
      result.price,
  };

  if (result.price !== null) {
    update.current_price =
      result.price;
  }

  if (
    result.price !== null &&
    result.price > targetPrice
  ) {
    update.email_alert_armed = true;
  }

  await supabase
    .from("price_watches")
    .update(update)
    .eq("id", watch.id)
    .eq("user_id", watch.user_id);

  await supabase
    .from("price_watch_checks")
    .insert({
      price_watch_id:
        watch.id,

      user_id:
        watch.user_id,

      price:
        result.price,

      available:
        result.available,

      source_url:
        result.checkedUrl ||
        productUrl,

      checked_at:
        checkedAt,
    });

  console.log(
    `[PRICE] ${productName}: ${
      result.price ?? "brak"
    } zł | próg ${targetPrice} zł`
  );

  let emailSent = false;

  if (
    result.price !== null &&
    result.price <= targetPrice &&
    watch.email_alert_armed
  ) {
    emailSent =
      await maybeSendEmail(
        watch,
        productName,
        store,
        productUrl,
        result.price,
        targetPrice
      );
  }

  return {
    checked: true,
    emailSent,
  };
}

async function main() {
  console.log("");
  console.log(
    "============================="
  );
  console.log(
    `ASARVO monitor ${new Date().toLocaleString("pl-PL")}`
  );
  console.log(
    "============================="
  );

  const { data, error } =
    await supabase
      .from("price_watches")
      .select(
        "id,user_id,product,target_price,current_price,last_checked_at,active,email_alert_armed"
      )
      .eq("active", true)
      .order(
        "last_checked_at",
        {
          ascending: true,
          nullsFirst: true,
        }
      )
      .limit(100);

  if (error) {
    throw new Error(
      `Supabase: ${error.message}`
    );
  }

  const stale =
    (data ?? [])
      .filter(
        (watch) =>
          ageMs(
            typeof watch.last_checked_at ===
              "string"
              ? watch.last_checked_at
              : null
          ) >= CHECK_INTERVAL_MS
      )
      .slice(
        0,
        MAX_CHECKS_PER_RUN
      ) as WatchRow[];

  console.log(
    `Do sprawdzenia: ${stale.length}`
  );

  let checked = 0;
  let emails = 0;

  for (const watch of stale) {
    try {
      const result =
        await checkWatch(watch);

      if (result.checked) {
        checked++;
      }

      if (result.emailSent) {
        emails++;
      }
    } catch (error) {
      console.error(
        "[WATCH ERROR]",
        error
      );
    }
  }

  console.log(
    `Koniec: sprawdzono=${checked}, e-maile=${emails}`
  );
}

main().catch((error) => {
  console.error(
    "[FATAL]",
    error
  );

  process.exitCode = 1;
});