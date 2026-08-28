import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PriceMonitorAutoRefresh from "./PriceMonitorAutoRefresh";
import {
  checkAllPriceWatchesNow,
  checkPriceWatchNow,
  clearSearchHistory,
  disablePriceEmailAlerts,
  enablePriceEmailAlerts,
  removeFavorite,
  removeHistoryEntry,
  removePriceWatch,
  sendTestPriceEmail,
  signout,
  updatePriceWatchTarget,
} from "./actions";

type JsonObject = Record<string, unknown>;

type SearchHistoryRow = {
  id: number;
  query: string;
  result_count: number | null;
  searched_at: string;
};

type FavoriteRow = {
  id: string;
  query: string;
  product: unknown;
  created_at: string;
};

type PriceWatchRow = {
  id: string;
  query: string;
  product: unknown;
  target_price: number | string;
  current_price: number | string | null;
  last_checked_price: number | string | null;
  last_checked_at: string | null;
  active: boolean;
  created_at: string;
};

type PriceWatchCheckRow = {
  id: number;
  price_watch_id: string;
  price: number | string | null;
  available: boolean | null;
  source_url: string | null;
  checked_at: string;
};

function asObject(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
}

function readString(
  object: JsonObject,
  key: string,
  fallback = ""
): string {
  const value = object[key];
  return typeof value === "string" ? value : fallback;
}

function readNumber(
  object: JsonObject,
  key: string
): number | null {
  const value = object[key];

  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value.replace(",", "."));
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function toNumber(value: number | string | null): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value.replace(",", "."));
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function formatPrice(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return "Cena nieznana";
  }

  return new Intl.NumberFormat("pl-PL", {
    style: "currency",
    currency: "PLN",
    minimumFractionDigits: 2,
  }).format(value);
}

function formatDate(value: string | null): string {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat("pl-PL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function productDetails(productValue: unknown) {
  const product = asObject(productValue);

  return {
    name: readString(product, "name", "Zapisana oferta"),
    store: readString(product, "store", "Nieznany sklep"),
    url: readString(product, "url"),
    price: readNumber(product, "price"),
  };
}

function sameNullableNumber(
  left: number | string | null,
  right: number | string | null
): boolean {
  return toNumber(left) === toNumber(right);
}

function dedupeVisibleChecks(
  checks: PriceWatchCheckRow[]
): PriceWatchCheckRow[] {
  const visible: PriceWatchCheckRow[] = [];

  for (const check of checks) {
    const checkTime = new Date(check.checked_at).getTime();

    const duplicate = visible.some((previous) => {
      const previousTime = new Date(previous.checked_at).getTime();

      return (
        Number.isFinite(checkTime) &&
        Number.isFinite(previousTime) &&
        Math.abs(previousTime - checkTime) <= 30_000 &&
        previous.available === check.available &&
        sameNullableNumber(previous.price, check.price) &&
        previous.source_url === check.source_url
      );
    });

    if (!duplicate) {
      visible.push(check);
    }
  }

  return visible;
}

export default async function AccountPage() {
  const supabase = await createClient();

  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();

  const userId = claimsData?.claims?.sub;

  if (claimsError || !userId) {
    redirect("/login");
  }

  const [
    userResult,
    profileResult,
    historyResult,
    favoritesResult,
    watchesResult,
    checksResult,
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from("profiles")
      .select(
        "display_name,email,email_price_alerts_enabled"
      )
      .eq("id", userId)
      .maybeSingle(),
    supabase
      .from("search_history")
      .select("id,query,result_count,searched_at")
      .eq("user_id", userId)
      .order("searched_at", { ascending: false })
      .limit(200),
    supabase
      .from("favorites")
      .select("id,query,product,created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
    supabase
      .from("price_watches")
      .select(
        "id,query,product,target_price,current_price,last_checked_price,last_checked_at,active,created_at"
      )
      .eq("user_id", userId)
      .order("updated_at", { ascending: false }),
    supabase
      .from("price_watch_checks")
      .select(
        "id,price_watch_id,price,available,source_url,checked_at"
      )
      .eq("user_id", userId)
      .order("checked_at", { ascending: false })
      .limit(100),
  ]);

  const history = (historyResult.data ?? []) as SearchHistoryRow[];
  const favorites = (favoritesResult.data ?? []) as FavoriteRow[];
  const watches = (watchesResult.data ?? []) as PriceWatchRow[];
  const checks = (checksResult.data ?? []) as PriceWatchCheckRow[];

  const checksByWatch = new Map<string, PriceWatchCheckRow[]>();

  for (const check of checks) {
    const list = checksByWatch.get(check.price_watch_id) ?? [];
    list.push(check);
    checksByWatch.set(check.price_watch_id, list);
  }

  const reachedWatches = watches.filter((watch) => {
    const target = toNumber(watch.target_price);
    const current =
      toNumber(watch.last_checked_price) ??
      toNumber(watch.current_price);

    return (
      target !== null &&
      current !== null &&
      current <= target
    );
  });

  const email =
    userResult.data.user?.email ??
    profileResult.data?.email ??
    "Brak e-maila";

  const displayName =
    profileResult.data?.display_name ||
    userResult.data.user?.user_metadata?.display_name ||
    email.split("@")[0];

  const emailPriceAlertsEnabled =
    profileResult.data?.email_price_alerts_enabled === true;

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#050505] px-5 py-8 text-white">
      <PriceMonitorAutoRefresh />
      <div className="pointer-events-none absolute left-1/2 top-[-260px] h-[680px] w-[940px] -translate-x-1/2 rounded-full bg-blue-600/10 blur-[155px]" />
      <div className="pointer-events-none absolute bottom-[-300px] right-[-180px] h-[600px] w-[600px] rounded-full bg-purple-600/[0.06] blur-[170px]" />

      <div className="relative mx-auto max-w-6xl">
        <header className="flex items-center justify-between gap-4">
          <Link href="/" className="text-xl font-bold tracking-tight">
            <span className="text-blue-400">A</span>SARVO
          </Link>

          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-gray-300 transition hover:bg-white/[0.07] hover:text-white"
            >
              Wyszukiwarka
            </Link>

            <form>
              <button
                formAction={signout}
                className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-gray-300 transition hover:bg-white/[0.07] hover:text-white"
              >
                Wyloguj się
              </button>
            </form>
          </div>
        </header>

        <section className="mt-14">
          <p className="text-sm font-medium text-blue-400">
            Twoje konto
          </p>

          <h1 className="mt-3 text-4xl font-bold tracking-tight sm:text-5xl">
            Cześć, {displayName}.
          </h1>

          <p className="mt-3 text-gray-500">{email}</p>

          <div className="mt-9 grid gap-4 sm:grid-cols-3">
            <a
              href="#historia"
              className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-5 transition hover:border-blue-500/25 hover:bg-blue-500/[0.035]"
            >
              <div className="text-3xl font-bold">{history.length}</div>
              <div className="mt-2 text-sm text-gray-500">
                Historia
              </div>
            </a>

            <a
              href="#ulubione"
              className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-5 transition hover:border-rose-500/25 hover:bg-rose-500/[0.035]"
            >
              <div className="text-3xl font-bold">{favorites.length}</div>
              <div className="mt-2 text-sm text-gray-500">
                Ulubione
              </div>
            </a>

            <a
              href="#obserwowane"
              className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-5 transition hover:border-amber-500/25 hover:bg-amber-500/[0.035]"
            >
              <div className="text-3xl font-bold">{watches.length}</div>
              <div className="mt-2 text-sm text-gray-500">
                Obserwowane
              </div>
            </a>
          </div>
        </section>

        {reachedWatches.length > 0 && (
          <a
            href="#obserwowane"
            className="mt-7 block rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.06] p-5 transition hover:bg-emerald-500/[0.09]"
          >
            <div className="text-sm font-semibold text-emerald-300">
              🎉 Cena osiągnęła Twój próg
            </div>
            <div className="mt-2 text-sm text-gray-300">
              {reachedWatches.length === 1
                ? "1 obserwowany produkt ma już cenę równą lub niższą od ustawionego progu."
                : `${reachedWatches.length} obserwowane produkty mają już cenę równą lub niższą od ustawionego progu.`}
            </div>
            <div className="mt-2 text-xs font-medium text-emerald-400">
              Zobacz obserwowane ceny ↓
            </div>
          </a>
        )}

        <section
          id="historia"
          className="mt-10 scroll-mt-6 rounded-3xl border border-white/[0.08] bg-white/[0.018]"
        >
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.06] px-5 py-5 sm:px-6">
            <div>
              <h2 className="text-xl font-bold">
                Historia wyszukiwań
              </h2>
              <p className="mt-1 text-sm text-gray-600">
                Ostatnie wyszukiwania zapisane na Twoim koncie.
              </p>
            </div>

            {history.length > 0 && (
              <form>
                <button
                  formAction={clearSearchHistory}
                  className="rounded-xl border border-white/10 px-4 py-2 text-xs text-gray-500 transition hover:border-red-500/25 hover:text-red-300"
                >
                  Wyczyść historię
                </button>
              </form>
            )}
          </div>

          {history.length === 0 ? (
            <div className="px-6 py-10 text-center text-sm text-gray-600">
              Nie masz jeszcze zapisanych wyszukiwań.
            </div>
          ) : (
            <div className="divide-y divide-white/[0.05]">
              {history.map((entry) => (
                <div
                  key={entry.id}
                  className="flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6"
                >
                  <div className="min-w-0">
                    <Link
                      href={`/search?q=${encodeURIComponent(entry.query)}`}
                      className="font-medium text-gray-200 transition hover:text-blue-300"
                    >
                      {entry.query}
                    </Link>

                    <div className="mt-1 text-xs text-gray-600">
                      {formatDate(entry.searched_at)}
                      {typeof entry.result_count === "number"
                        ? ` · ${entry.result_count} ofert`
                        : ""}
                    </div>
                  </div>

                  <div className="flex shrink-0 gap-2">
                    <Link
                      href={`/search?q=${encodeURIComponent(entry.query)}`}
                      className="rounded-xl border border-blue-500/20 bg-blue-500/[0.05] px-4 py-2 text-xs font-medium text-blue-300 transition hover:bg-blue-500/[0.10]"
                    >
                      Wyszukaj ponownie
                    </Link>

                    <form>
                      <input
                        type="hidden"
                        name="id"
                        value={String(entry.id)}
                      />
                      <button
                        formAction={removeHistoryEntry}
                        className="rounded-xl border border-white/[0.08] px-4 py-2 text-xs text-gray-500 transition hover:border-red-500/20 hover:text-red-300"
                      >
                        Usuń
                      </button>
                    </form>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section
          id="ulubione"
          className="mt-6 scroll-mt-6 rounded-3xl border border-white/[0.08] bg-white/[0.018]"
        >
          <div className="border-b border-white/[0.06] px-5 py-5 sm:px-6">
            <h2 className="text-xl font-bold">Ulubione</h2>
            <p className="mt-1 text-sm text-gray-600">
              Oferty zapisane na Twoim koncie.
            </p>
          </div>

          {favorites.length === 0 ? (
            <div className="px-6 py-10 text-center text-sm text-gray-600">
              Nie masz jeszcze żadnych ulubionych ofert.
            </div>
          ) : (
            <div className="grid gap-4 p-5 sm:p-6 lg:grid-cols-2">
              {favorites.map((favorite) => {
                const product = productDetails(favorite.product);

                return (
                  <article
                    key={favorite.id}
                    className="rounded-2xl border border-white/[0.07] bg-black/20 p-5"
                  >
                    <div className="text-xs font-medium text-rose-300">
                      ♥ Ulubione
                    </div>

                    <h3 className="mt-3 line-clamp-2 text-lg font-semibold">
                      {product.name}
                    </h3>

                    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-500">
                      <span>{product.store}</span>
                      <span>{formatPrice(product.price)}</span>
                    </div>

                    {favorite.query && (
                      <div className="mt-3 text-xs text-gray-600">
                        Wyszukiwanie: „{favorite.query}”
                      </div>
                    )}

                    <div className="mt-5 flex gap-2">
                      {product.url ? (
                        <a
                          href={product.url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex-1 rounded-xl bg-blue-600 px-4 py-2.5 text-center text-sm font-semibold transition hover:bg-blue-500"
                        >
                          Zobacz ofertę ↗
                        </a>
                      ) : (
                        <div className="flex-1 rounded-xl border border-white/[0.06] px-4 py-2.5 text-center text-sm text-gray-600">
                          Brak linku
                        </div>
                      )}

                      <form>
                        <input
                          type="hidden"
                          name="id"
                          value={favorite.id}
                        />
                        <button
                          formAction={removeFavorite}
                          className="rounded-xl border border-white/[0.08] px-4 py-2.5 text-sm text-gray-500 transition hover:border-red-500/20 hover:text-red-300"
                        >
                          Usuń
                        </button>
                      </form>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <section
          id="obserwowane"
          className="mb-16 mt-6 scroll-mt-6 rounded-3xl border border-white/[0.08] bg-white/[0.018]"
        >
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.06] px-5 py-5 sm:px-6">
            <div>
              <h2 className="text-xl font-bold">Obserwowane ceny</h2>
              <p className="mt-1 text-sm text-gray-600">
                ASARVO ponownie odczytuje cenę z zapisanej strony produktu.
              </p>
            </div>

            {watches.length > 0 && (
              <form>
                <button
                  formAction={checkAllPriceWatchesNow}
                  className="rounded-xl border border-blue-500/20 bg-blue-500/[0.05] px-4 py-2.5 text-xs font-medium text-blue-300 transition hover:bg-blue-500/[0.10]"
                >
                  Sprawdź wszystkie teraz
                </button>
              </form>
            )}
          </div>

          <div className="border-b border-white/[0.05] p-5 sm:p-6">
            <div className={`rounded-2xl border p-5 ${
              emailPriceAlertsEnabled
                ? "border-emerald-500/20 bg-emerald-500/[0.045]"
                : "border-white/[0.07] bg-white/[0.02]"
            }`}>
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className={`text-sm font-semibold ${
                    emailPriceAlertsEnabled
                      ? "text-emerald-300"
                      : "text-gray-200"
                  }`}>
                    ✉ Powiadomienia e-mail
                  </div>

                  <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600">
                    {emailPriceAlertsEnabled
                      ? `Włączone. Gdy cena osiągnie próg, ASARVO może wysłać wiadomość na ${email}.`
                      : `Wyłączone. Możesz włączyć alerty cenowe na adres ${email}.`}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  {emailPriceAlertsEnabled ? (
                    <>
                      <form>
                        <button
                          formAction={sendTestPriceEmail}
                          className="rounded-xl border border-blue-500/20 bg-blue-500/[0.05] px-4 py-2.5 text-xs font-medium text-blue-300 transition hover:bg-blue-500/[0.10]"
                        >
                          Wyślij testowy e-mail
                        </button>
                      </form>

                      <form>
                        <button
                          formAction={disablePriceEmailAlerts}
                          className="rounded-xl border border-white/[0.08] px-4 py-2.5 text-xs text-gray-500 transition hover:border-red-500/20 hover:text-red-300"
                        >
                          Wyłącz e-maile
                        </button>
                      </form>
                    </>
                  ) : (
                    <form>
                      <button
                        formAction={enablePriceEmailAlerts}
                        className="rounded-xl bg-emerald-500 px-4 py-2.5 text-xs font-bold text-black transition hover:bg-emerald-400"
                      >
                        Włącz e-maile
                      </button>
                    </form>
                  )}
                </div>
              </div>
            </div>
          </div>

          {watches.length === 0 ? (
            <div className="px-6 py-10 text-center text-sm text-gray-600">
              Nie obserwujesz jeszcze żadnych cen.
            </div>
          ) : (
            <div className="space-y-4 p-5 sm:p-6">
              {watches.map((watch) => {
                const product = productDetails(watch.product);
                const watchChecks = checksByWatch.get(watch.id) ?? [];
                const visibleWatchChecks =
                  dedupeVisibleChecks(watchChecks);
                const targetPrice = toNumber(watch.target_price);
                const currentPrice =
                  toNumber(watch.last_checked_price) ??
                  toNumber(watch.current_price) ??
                  product.price;

                const targetReached =
                  targetPrice !== null &&
                  currentPrice !== null &&
                  currentPrice <= targetPrice;

                return (
                  <article
                    key={watch.id}
                    className="rounded-2xl border border-white/[0.07] bg-black/20 p-5"
                  >
                    <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0 flex-1">
                        <div
                          className={`text-xs font-semibold ${
                            targetReached
                              ? "text-emerald-300"
                              : "text-amber-300"
                          }`}
                        >
                          {targetReached
                            ? "✓ Cena osiągnęła Twój próg"
                            : "🔔 Obserwowana cena"}
                        </div>

                        {targetReached &&
                          targetPrice !== null &&
                          currentPrice !== null && (
                            <div className="mt-2 inline-flex rounded-full border border-emerald-500/20 bg-emerald-500/[0.07] px-3 py-1 text-xs font-medium text-emerald-300">
                              {currentPrice < targetPrice
                                ? `${formatPrice(
                                    targetPrice - currentPrice
                                  )} poniżej Twojego progu`
                                : "Cena jest dokładnie na Twoim progu"}
                            </div>
                          )}

                        <h3 className="mt-3 line-clamp-2 text-lg font-semibold">
                          {product.name}
                        </h3>

                        <div className="mt-2 text-sm text-gray-500">
                          {product.store}
                        </div>

                        <div className="mt-4 grid gap-3 sm:grid-cols-3">
                          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                            <div className="text-[11px] uppercase tracking-wider text-gray-600">
                              Obecna cena
                            </div>
                            <div className="mt-1 font-semibold">
                              {formatPrice(currentPrice)}
                            </div>
                          </div>

                          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                            <div className="text-[11px] uppercase tracking-wider text-gray-600">
                              Twój próg
                            </div>
                            <div className="mt-1 font-semibold text-amber-200">
                              {formatPrice(targetPrice)}
                            </div>
                          </div>

                          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                            <div className="text-[11px] uppercase tracking-wider text-gray-600">
                              Ostatnie sprawdzenie
                            </div>
                            <div className="mt-1 text-sm font-medium">
                              {watch.last_checked_at
                                ? formatDate(watch.last_checked_at)
                                : "Jeszcze nie sprawdzano"}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="w-full shrink-0 lg:w-72">
                        <form className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
                          <input
                            type="hidden"
                            name="id"
                            value={watch.id}
                          />

                          <label className="block text-xs font-medium text-gray-500">
                            Zmień próg ceny
                          </label>

                          <div className="mt-2 flex items-center rounded-xl border border-white/10 bg-black/25 px-3">
                            <input
                              name="targetPrice"
                              defaultValue={
                                targetPrice !== null
                                  ? targetPrice
                                      .toFixed(2)
                                      .replace(".", ",")
                                  : ""
                              }
                              inputMode="decimal"
                              className="min-h-11 min-w-0 flex-1 bg-transparent text-sm outline-none"
                            />
                            <span className="text-xs text-gray-600">
                              zł
                            </span>
                          </div>

                          <button
                            formAction={updatePriceWatchTarget}
                            className="mt-2 w-full rounded-xl border border-amber-500/20 bg-amber-500/[0.06] px-4 py-2.5 text-xs font-medium text-amber-200 transition hover:bg-amber-500/[0.11]"
                          >
                            Zapisz nowy próg
                          </button>
                        </form>

                        <form className="mt-2">
                          <input
                            type="hidden"
                            name="id"
                            value={watch.id}
                          />
                          <button
                            formAction={checkPriceWatchNow}
                            className="w-full rounded-xl border border-blue-500/20 bg-blue-500/[0.05] px-4 py-2.5 text-xs font-medium text-blue-300 transition hover:bg-blue-500/[0.10]"
                          >
                            Sprawdź cenę teraz
                          </button>
                        </form>

                        <div className="mt-2 flex gap-2">
                          {product.url && (
                            <a
                              href={product.url}
                              target="_blank"
                              rel="noreferrer"
                              className="flex-1 rounded-xl border border-white/[0.08] px-4 py-2.5 text-center text-xs text-gray-300 transition hover:bg-white/[0.04]"
                            >
                              Zobacz ↗
                            </a>
                          )}

                          <form className="flex-1">
                            <input
                              type="hidden"
                              name="id"
                              value={watch.id}
                            />
                            <button
                              formAction={removePriceWatch}
                              className="w-full rounded-xl border border-white/[0.08] px-4 py-2.5 text-xs text-gray-500 transition hover:border-red-500/20 hover:text-red-300"
                            >
                              Wyłącz
                            </button>
                          </form>
                        </div>
                      </div>
                    </div>

                    <details className="mt-5 border-t border-white/[0.05] pt-4">
                      <summary className="cursor-pointer text-xs font-medium text-gray-500 transition hover:text-gray-300">
                        Historia sprawdzeń ({visibleWatchChecks.length})
                      </summary>

                      {visibleWatchChecks.length === 0 ? (
                        <div className="mt-3 text-xs text-gray-700">
                          Brak prawdziwych sprawdzeń ceny. Kliknij „Sprawdź cenę teraz”.
                        </div>
                      ) : (
                        <div className="mt-3 space-y-2">
                          {visibleWatchChecks.slice(0, 8).map((check) => (
                            <div
                              key={check.id}
                              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/[0.05] bg-white/[0.015] px-3 py-2.5 text-xs"
                            >
                              <span className="text-gray-500">
                                {formatDate(check.checked_at)}
                              </span>

                              <div className="flex items-center gap-3">
                                <span
                                  className={
                                    check.available === false
                                      ? "text-red-300"
                                      : check.available === true
                                        ? "text-emerald-300"
                                        : "text-gray-600"
                                  }
                                >
                                  {check.available === false
                                    ? "Niedostępny"
                                    : check.available === true
                                      ? "Dostępny"
                                      : "Dostępność nieznana"}
                                </span>

                                <span className="font-semibold text-gray-200">
                                  {formatPrice(toNumber(check.price))}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </details>
                  </article>
                );
              })}
            </div>
          )}

          <div className="border-t border-white/[0.05] px-5 py-4 text-xs leading-5 text-gray-700 sm:px-6">
            ASARVO sprawdza nieaktualne obserwacje automatycznie po wejściu na konto
            i ponawia sprawdzenie co około 30 minut, gdy panel konta pozostaje otwarty.
            Pełne sprawdzanie 24/7 po zamknięciu strony podłączymy po wdrożeniu ASARVO
            na stałym publicznym serwerze.
          </div>
        </section>
      </div>
    </main>
  );
}
