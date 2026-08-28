"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type SpeechRecognitionAlternativeLike = {
  transcript: string;
  confidence?: number;
};

type SpeechRecognitionResultLike = {
  readonly isFinal: boolean;
  readonly length: number;
  [index: number]: SpeechRecognitionAlternativeLike;
};

type SpeechRecognitionResultListLike = {
  readonly length: number;
  [index: number]: SpeechRecognitionResultLike;
};

type SpeechRecognitionEventLike = Event & {
  readonly results: SpeechRecognitionResultListLike;
};

type SpeechRecognitionErrorEventLike = Event & {
  readonly error: string;
  readonly message?: string;
};

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type SpeechRecognitionConstructorLike = new () => SpeechRecognitionLike;

type WindowWithSpeechRecognition = Window & {
  SpeechRecognition?: SpeechRecognitionConstructorLike;
  webkitSpeechRecognition?: SpeechRecognitionConstructorLike;
};

const examples = [
  "🎮 Pad do PS4 do 200 zł",
  "💻 Laptop gamingowy do 4000 zł",
  "📱 iPhone do 3000 zł",
];

type SearchHistoryEntry = {
  id?: number;
  query: string;
  searchedAt: number;
  resultCount?: number | null;
};

type StoredFavoriteProduct = {
  name: string;
  store: string;
  price: number | null;
  url?: string;
};

type SavedFavorite = {
  key: string;
  query: string;
  savedAt: number;
  product: StoredFavoriteProduct;
};

type PriceWatch = {
  key: string;
  query: string;
  createdAt: number;
  updatedAt: number;
  active: boolean;
  targetPrice: number;
  currentPrice: number | null;
  lastCheckedPrice: number | null;
  lastCheckedAt: number | null;
  product: StoredFavoriteProduct;
};

type PriceWatchEditor = {
  key: string;
  targetPriceInput: string;
};

type LibraryPanel = "history" | "favorites" | "watches" | null;

const SEARCH_HISTORY_STORAGE_KEY = "aishopping.searchHistory.v1";
const FAVORITES_STORAGE_KEY = "aishopping.favorites.v1";
const PRICE_WATCHES_STORAGE_KEY = "aishopping.priceWatches.v1";
const MAX_SEARCH_HISTORY_ITEMS = 12;
const MAX_FAVORITES = 80;
const MAX_PRICE_WATCHES = 80;

function readStoredArray<T>(key: string): T[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(key);

    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch (error) {
    console.warn(`[AIShopping] Nie udało się odczytać ${key}:`, error);
    return [];
  }
}

function writeStoredArray<T>(key: string, value: T[]): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn(`[AIShopping] Nie udało się zapisać ${key}:`, error);
  }
}

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
  return typeof value === "string" ? value : fallback;
}

function readNullableNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value.replace(",", "."));
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function readStoredProduct(value: unknown): StoredFavoriteProduct {
  const product = asObject(value);

  return {
    name: readString(product, "name", "Zapisana oferta"),
    store: readString(product, "store", "Nieznany sklep"),
    price: readNullableNumber(product.price),
    url: readString(product, "url") || undefined,
  };
}

function formatPrice(price: number | null): string {
  if (price === null || !Number.isFinite(price)) {
    return "Cena nieznana";
  }

  return `${price.toFixed(2).replace(".", ",")} zł`;
}

function parsePriceInput(value: string): number | null {
  const normalized = value
    .trim()
    .replace(/\s+/g, "")
    .replace(",", ".");

  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized);

  return Number.isFinite(parsed) && parsed > 0
    ? Math.round(parsed * 100) / 100
    : null;
}

function loadSearchHistory(): SearchHistoryEntry[] {
  return readStoredArray<SearchHistoryEntry>(SEARCH_HISTORY_STORAGE_KEY)
    .filter(
      (entry) =>
        entry &&
        typeof entry.query === "string" &&
        typeof entry.searchedAt === "number"
    )
    .slice(0, MAX_SEARCH_HISTORY_ITEMS);
}

function loadFavorites(): SavedFavorite[] {
  return readStoredArray<SavedFavorite>(FAVORITES_STORAGE_KEY)
    .filter(
      (entry) =>
        entry &&
        typeof entry.key === "string" &&
        entry.product &&
        typeof entry.product.name === "string" &&
        typeof entry.product.store === "string"
    )
    .slice(0, MAX_FAVORITES);
}

function loadPriceWatches(): PriceWatch[] {
  return readStoredArray<PriceWatch>(PRICE_WATCHES_STORAGE_KEY)
    .filter(
      (entry) =>
        entry &&
        typeof entry.key === "string" &&
        typeof entry.targetPrice === "number" &&
        Number.isFinite(entry.targetPrice) &&
        entry.targetPrice > 0 &&
        entry.product &&
        typeof entry.product.name === "string" &&
        typeof entry.product.store === "string"
    )
    .slice(0, MAX_PRICE_WATCHES);
}

export default function Home() {
  const [query, setQuery] = useState("");
  const speechRecognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const [voiceListening, setVoiceListening] = useState(false);
  const [voiceMessage, setVoiceMessage] = useState<string | null>(null);
  const [imageAnalyzing, setImageAnalyzing] = useState(false);
  const [imageMessage, setImageMessage] = useState<string | null>(null);
  const [searchHistory, setSearchHistory] = useState<SearchHistoryEntry[]>([]);
  const [favorites, setFavorites] = useState<SavedFavorite[]>([]);
  const [priceWatches, setPriceWatches] = useState<PriceWatch[]>([]);
  const [priceWatchEditor, setPriceWatchEditor] =
    useState<PriceWatchEditor | null>(null);
  const [priceWatchError, setPriceWatchError] = useState<string | null>(null);
  const [libraryPanel, setLibraryPanel] = useState<LibraryPanel>(null);
  const [priceMonitorRunning, setPriceMonitorRunning] = useState(false);
  const priceMonitorRunningRef = useRef(false);
  const [dismissedPriceAlertKey, setDismissedPriceAlertKey] =
    useState<string | null>(null);
  const [browserNotificationsSupported, setBrowserNotificationsSupported] =
    useState(false);
  const [browserNotificationPermission, setBrowserNotificationPermission] =
    useState<NotificationPermission>("default");
  const [authReady, setAuthReady] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  const refreshSupabaseLibrary = async () => {
    const supabase = createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return false;
    }

    const [historyResult, favoritesResult, watchesResult] =
      await Promise.all([
        supabase
          .from("search_history")
          .select("id,query,result_count,searched_at")
          .eq("user_id", user.id)
          .order("searched_at", { ascending: false })
          .limit(MAX_SEARCH_HISTORY_ITEMS),
        supabase
          .from("favorites")
          .select("id,query,product,created_at")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(MAX_FAVORITES),
        supabase
          .from("price_watches")
          .select(
            "id,query,product,target_price,current_price,last_checked_price,last_checked_at,active,created_at,updated_at"
          )
          .eq("user_id", user.id)
          .order("updated_at", { ascending: false })
          .limit(MAX_PRICE_WATCHES),
      ]);

    if (historyResult.error) {
      console.error(
        "[ASARVO HOME][HISTORY]",
        historyResult.error
      );
    } else {
      setSearchHistory(
        (historyResult.data ?? []).map((row) => ({
          id:
            typeof row.id === "number"
              ? row.id
              : Number(row.id),
          query:
            typeof row.query === "string"
              ? row.query
              : "",
          searchedAt:
            typeof row.searched_at === "string"
              ? new Date(row.searched_at).getTime()
              : Date.now(),
          resultCount:
            typeof row.result_count === "number"
              ? row.result_count
              : null,
        }))
      );
    }

    if (favoritesResult.error) {
      console.error(
        "[ASARVO HOME][FAVORITES]",
        favoritesResult.error
      );
    } else {
      setFavorites(
        (favoritesResult.data ?? []).map((row) => ({
          key: String(row.id),
          query:
            typeof row.query === "string"
              ? row.query
              : "",
          savedAt:
            typeof row.created_at === "string"
              ? new Date(row.created_at).getTime()
              : Date.now(),
          product: readStoredProduct(row.product),
        }))
      );
    }

    if (watchesResult.error) {
      console.error(
        "[ASARVO HOME][WATCHES]",
        watchesResult.error
      );
    } else {
      setPriceWatches(
        (watchesResult.data ?? []).map((row) => ({
          key: String(row.id),
          query:
            typeof row.query === "string"
              ? row.query
              : "",
          createdAt:
            typeof row.created_at === "string"
              ? new Date(row.created_at).getTime()
              : Date.now(),
          updatedAt:
            typeof row.updated_at === "string"
              ? new Date(row.updated_at).getTime()
              : Date.now(),
          active: row.active !== false,
          targetPrice:
            readNullableNumber(row.target_price) ?? 0,
          currentPrice:
            readNullableNumber(row.current_price),
          lastCheckedPrice:
            readNullableNumber(row.last_checked_price),
          lastCheckedAt:
            typeof row.last_checked_at === "string"
              ? new Date(row.last_checked_at).getTime()
              : null,
          product: readStoredProduct(row.product),
        }))
      );
    }

    return true;
  };

  const refreshGuestLibrary = () => {
    setSearchHistory(loadSearchHistory());
    setFavorites(loadFavorites());
    setPriceWatches(loadPriceWatches());
  };

  useEffect(() => {
    const supabase = createClient();
    let mounted = true;

    const refreshAuthAndLibrary = async () => {
      const { data } = await supabase.auth.getUser();

      if (!mounted) {
        return;
      }

      const authenticated = Boolean(data.user);
      setIsAuthenticated(authenticated);
      setAuthReady(true);

      if (authenticated) {
        await refreshSupabaseLibrary();
      } else {
        refreshGuestLibrary();
      }
    };

    void refreshAuthAndLibrary();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) {
        return;
      }

      const authenticated = Boolean(session?.user);
      setIsAuthenticated(authenticated);
      setAuthReady(true);

      if (authenticated) {
        void refreshSupabaseLibrary();
      } else {
        refreshGuestLibrary();
      }
    });

    const onStorage = () => {
      if (!isAuthenticated) {
        refreshGuestLibrary();
      }
    };

    window.addEventListener("storage", onStorage);

    return () => {
      mounted = false;
      subscription.unsubscribe();
      window.removeEventListener("storage", onStorage);
    };
  }, [isAuthenticated]);

  useEffect(() => {
    const supported =
      typeof window !== "undefined" &&
      "Notification" in window;

    setBrowserNotificationsSupported(supported);

    if (supported) {
      setBrowserNotificationPermission(
        window.Notification.permission
      );
    }
  }, []);

  useEffect(() => {
    return () => {
      speechRecognitionRef.current?.abort();
      speechRecognitionRef.current = null;
    };
  }, []);

  const startVoiceSearch = () => {
    if (typeof window === "undefined") {
      return;
    }

    if (voiceListening) {
      speechRecognitionRef.current?.stop();
      return;
    }

    const speechWindow = window as WindowWithSpeechRecognition;
    const SpeechRecognitionApi =
      speechWindow.SpeechRecognition ??
      speechWindow.webkitSpeechRecognition;

    if (!SpeechRecognitionApi) {
      setVoiceMessage(
        "Ta przeglądarka nie udostępnia rozpoznawania mowy. Spróbuj Chrome, Edge lub Opera."
      );
      return;
    }

    const recognition = new SpeechRecognitionApi();
    speechRecognitionRef.current = recognition;

    let finalQuery = "";

    recognition.lang = "pl-PL";
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setVoiceListening(true);
      setVoiceMessage("Słucham… Powiedz, czego szukasz.");
    };

    recognition.onresult = (event) => {
      let interimQuery = "";

      for (let index = event.results.length - 1; index >= 0; index -= 1) {
        const result = event.results[index];
        const transcript = result[0]?.transcript?.trim();

        if (!transcript) {
          continue;
        }

        if (result.isFinal) {
          finalQuery = transcript;
          break;
        }

        if (!interimQuery) {
          interimQuery = transcript;
        }
      }

      const spokenQuery = finalQuery || interimQuery;

      if (spokenQuery) {
        setQuery(spokenQuery);
        setVoiceMessage(
          finalQuery
            ? `Rozpoznano: „${finalQuery}”`
            : `Słyszę: „${interimQuery}”`
        );
      }
    };

    recognition.onerror = (event) => {
      setVoiceListening(false);

      if (event.error === "aborted") {
        setVoiceMessage(null);
        return;
      }

      if (
        event.error === "not-allowed" ||
        event.error === "service-not-allowed"
      ) {
        setVoiceMessage(
          "Brak dostępu do mikrofonu. Zezwól przeglądarce na używanie mikrofonu i spróbuj ponownie."
        );
        return;
      }

      if (event.error === "no-speech") {
        setVoiceMessage(
          "Nie usłyszałem wypowiedzi. Kliknij mikrofon i spróbuj jeszcze raz."
        );
        return;
      }

      setVoiceMessage("Nie udało się rozpoznać mowy. Spróbuj ponownie.");
    };

    recognition.onend = () => {
      setVoiceListening(false);
      speechRecognitionRef.current = null;

      const trimmedVoiceQuery = finalQuery.trim();

      if (!trimmedVoiceQuery) {
        return;
      }

      setQuery(trimmedVoiceQuery);
      setVoiceMessage("Rozpoznano zapytanie — uruchamiam ASARVO Search…");

      window.location.href = `/search?q=${encodeURIComponent(trimmedVoiceQuery)}`;
    };

    try {
      recognition.start();
    } catch {
      setVoiceListening(false);
      speechRecognitionRef.current = null;
      setVoiceMessage(
        "Mikrofon jest już aktywny. Spróbuj ponownie za chwilę."
      );
    }
  };

  const handleImageSearch = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      setImageMessage("Wybierz plik graficzny, np. JPG, PNG lub WEBP.");
      return;
    }

    if (file.size > 12 * 1024 * 1024) {
      setImageMessage("Zdjęcie jest za duże. Maksymalny rozmiar to 12 MB.");
      return;
    }

    setImageAnalyzing(true);
    setImageMessage("Analizuję zdjęcie i rozpoznaję produkt…");

    try {
      const formData = new FormData();
      formData.append("image", file);

      const response = await fetch("/api/vision", {
        method: "POST",
        body: formData,
      });

      const data = (await response.json().catch(() => null)) as
        | {
            ok?: boolean;
            query?: string;
            confidence?: number;
            error?: string;
          }
        | null;

      if (!response.ok || !data?.query) {
        throw new Error(
          data?.error ||
            "Nie udało się rozpoznać produktu na zdjęciu."
        );
      }

      const recognizedQuery = data.query.trim();

      if (!recognizedQuery) {
        throw new Error(
          "Nie udało się zbudować zapytania na podstawie zdjęcia."
        );
      }

      setQuery(recognizedQuery);
      setImageMessage(`Rozpoznano: „${recognizedQuery}” — uruchamiam wyszukiwanie…`);

      window.location.href = `/search?q=${encodeURIComponent(recognizedQuery)}`;
    } catch (error) {
      setImageMessage(
        error instanceof Error
          ? error.message
          : "Nie udało się przeanalizować zdjęcia."
      );
    } finally {
      setImageAnalyzing(false);

      if (imageInputRef.current) {
        imageInputRef.current.value = "";
      }
    }
  };

  const reachedPriceWatches = priceWatches.filter((entry) => {
    const currentPrice =
      entry.lastCheckedPrice ?? entry.currentPrice;

    return (
      entry.active &&
      currentPrice !== null &&
      Number.isFinite(currentPrice) &&
      currentPrice <= entry.targetPrice
    );
  });

  const priceAlertKey = reachedPriceWatches
    .map(
      (entry) =>
        `${entry.key}:${
          entry.lastCheckedPrice ??
          entry.currentPrice ??
          "unknown"
        }`
    )
    .sort()
    .join("|");

  const visibleReachedPriceWatches =
    priceAlertKey &&
    dismissedPriceAlertKey !== priceAlertKey
      ? reachedPriceWatches
      : [];

  const showSystemPriceNotification = (
    watches: PriceWatch[]
  ) => {
    if (
      typeof window === "undefined" ||
      !("Notification" in window) ||
      window.Notification.permission !== "granted" ||
      watches.length === 0
    ) {
      return;
    }

    const notificationKey = watches
      .map(
        (entry) =>
          `${entry.key}:${
            entry.lastCheckedPrice ??
            entry.currentPrice ??
            "unknown"
          }`
      )
      .sort()
      .join("|");

    if (!notificationKey) {
      return;
    }

    const storageKey =
      "asarvo.browserPriceNotification.lastKey.v1";

    try {
      if (
        window.localStorage.getItem(storageKey) ===
        notificationKey
      ) {
        return;
      }
    } catch {
      // Brak localStorage nie może blokować powiadomienia.
    }

    const first = watches[0];
    const firstPrice =
      first.lastCheckedPrice ?? first.currentPrice;

    const title =
      watches.length === 1
        ? "ASARVO: cena osiągnęła Twój próg"
        : `ASARVO: ${watches.length} ceny osiągnęły Twój próg`;

    const body =
      watches.length === 1
        ? `${first.product.name} — ${formatPrice(
            firstPrice
          )} (Twój próg: ${formatPrice(
            first.targetPrice
          )})`
        : `${watches.length} obserwowane produkty są już w cenie, na którą czekałeś.`;

    try {
      const notification = new window.Notification(
        title,
        {
          body,
          icon: "/asarvo-app-icon.png",
          tag: "asarvo-price-target",
        }
      );

      notification.onclick = () => {
        window.focus();
        setLibraryPanel("watches");
        notification.close();
      };

      window.localStorage.setItem(
        storageKey,
        notificationKey
      );
    } catch (error) {
      console.warn(
        "[ASARVO] Nie udało się pokazać powiadomienia systemowego:",
        error
      );
    }
  };

  const requestBrowserNotifications = async () => {
    if (
      typeof window === "undefined" ||
      !("Notification" in window)
    ) {
      setBrowserNotificationsSupported(false);
      return;
    }

    try {
      const permission =
        await window.Notification.requestPermission();

      setBrowserNotificationPermission(permission);

      if (permission !== "granted") {
        return;
      }

      if (reachedPriceWatches.length > 0) {
        showSystemPriceNotification(
          reachedPriceWatches
        );
        return;
      }

      const testNotification =
        new window.Notification(
          "ASARVO — powiadomienia włączone",
          {
            body:
              "Gdy obserwowana cena osiągnie Twój próg, ASARVO pokaże powiadomienie systemowe.",
            icon: "/asarvo-app-icon.png",
            tag: "asarvo-notifications-enabled",
          }
        );

      testNotification.onclick = () => {
        window.focus();
        testNotification.close();
      };
    } catch (error) {
      console.warn(
        "[ASARVO] Nie udało się włączyć powiadomień:",
        error
      );
    }
  };

  const runPriceMonitor = async () => {
    if (
      !isAuthenticated ||
      priceMonitorRunningRef.current
    ) {
      return;
    }

    priceMonitorRunningRef.current = true;
    setPriceMonitorRunning(true);

    try {
      const response = await fetch(
        "/api/account/price-monitor",
        {
          method: "POST",
          cache: "no-store",
        }
      );

      if (!response.ok) {
        return;
      }

      const data = (await response.json()) as {
        checked?: number;
      };

      if ((data.checked ?? 0) > 0) {
        await refreshSupabaseLibrary();
      }
    } catch (error) {
      console.warn(
        "[ASARVO HOME] Nie udało się sprawdzić cen:",
        error
      );
    } finally {
      priceMonitorRunningRef.current = false;
      setPriceMonitorRunning(false);
    }
  };

  useEffect(() => {
    if (
      !isAuthenticated ||
      browserNotificationPermission !== "granted" ||
      reachedPriceWatches.length === 0
    ) {
      return;
    }

    showSystemPriceNotification(
      reachedPriceWatches
    );
  }, [
    isAuthenticated,
    browserNotificationPermission,
    priceAlertKey,
  ]);

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    void runPriceMonitor();

    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void runPriceMonitor();
      }
    }, 30 * 60 * 1000);

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void runPriceMonitor();
      }
    };

    document.addEventListener(
      "visibilitychange",
      onVisibilityChange
    );

    return () => {
      window.clearInterval(interval);
      document.removeEventListener(
        "visibilitychange",
        onVisibilityChange
      );
    };
  }, [isAuthenticated]);

  const handleSearch = () => {
    const trimmedQuery = query.trim();

    if (!trimmedQuery) {
      return;
    }

    window.location.href = `/search?q=${encodeURIComponent(trimmedQuery)}`;
  };

  const clearSearchHistory = async () => {
    if (!isAuthenticated) {
      setSearchHistory([]);
      writeStoredArray<SearchHistoryEntry>(
        SEARCH_HISTORY_STORAGE_KEY,
        []
      );
      return;
    }

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return;
    }

    const { error } = await supabase
      .from("search_history")
      .delete()
      .eq("user_id", user.id);

    if (error) {
      console.error("[ASARVO HOME][CLEAR HISTORY]", error);
      return;
    }

    await refreshSupabaseLibrary();
  };

  const removeFavorite = async (key: string) => {
    if (!isAuthenticated) {
      setFavorites((current) => {
        const next = current.filter(
          (entry) => entry.key !== key
        );
        writeStoredArray(FAVORITES_STORAGE_KEY, next);
        return next;
      });
      return;
    }

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return;
    }

    const { error } = await supabase
      .from("favorites")
      .delete()
      .eq("id", key)
      .eq("user_id", user.id);

    if (error) {
      console.error("[ASARVO HOME][REMOVE FAVORITE]", error);
      return;
    }

    await refreshSupabaseLibrary();
  };

  const removePriceWatch = async (key: string) => {
    if (!isAuthenticated) {
      setPriceWatches((current) => {
        const next = current.filter(
          (entry) => entry.key !== key
        );
        writeStoredArray(PRICE_WATCHES_STORAGE_KEY, next);
        return next;
      });
      return;
    }

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return;
    }

    const { error } = await supabase
      .from("price_watches")
      .delete()
      .eq("id", key)
      .eq("user_id", user.id);

    if (error) {
      console.error("[ASARVO HOME][REMOVE WATCH]", error);
      return;
    }

    await refreshSupabaseLibrary();
  };

  const togglePriceWatchActive = async (key: string) => {
    const entry = priceWatches.find(
      (watch) => watch.key === key
    );

    if (!entry) {
      return;
    }

    if (!isAuthenticated) {
      setPriceWatches((current) => {
        const next = current.map((watch) =>
          watch.key === key
            ? {
                ...watch,
                active: !watch.active,
                updatedAt: Date.now(),
              }
            : watch
        );

        writeStoredArray(PRICE_WATCHES_STORAGE_KEY, next);
        return next;
      });
      return;
    }

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return;
    }

    const { error } = await supabase
      .from("price_watches")
      .update({
        active: !entry.active,
      })
      .eq("id", key)
      .eq("user_id", user.id);

    if (error) {
      console.error("[ASARVO HOME][TOGGLE WATCH]", error);
      return;
    }

    await refreshSupabaseLibrary();
  };

  const openPriceWatchEditor = (entry: PriceWatch) => {
    setPriceWatchError(null);
    setPriceWatchEditor({
      key: entry.key,
      targetPriceInput: entry.targetPrice.toFixed(2).replace(".", ","),
    });
  };

  const closePriceWatchEditor = () => {
    setPriceWatchEditor(null);
    setPriceWatchError(null);
  };

  const savePriceWatchTarget = async () => {
    if (!priceWatchEditor) {
      return;
    }

    const targetPrice = parsePriceInput(
      priceWatchEditor.targetPriceInput
    );

    if (targetPrice === null) {
      setPriceWatchError(
        "Wpisz prawidłową cenę większą od 0 zł."
      );
      return;
    }

    if (!isAuthenticated) {
      setPriceWatches((current) => {
        const next = current.map((entry) =>
          entry.key === priceWatchEditor.key
            ? {
                ...entry,
                targetPrice,
                active: true,
                updatedAt: Date.now(),
              }
            : entry
        );

        writeStoredArray(PRICE_WATCHES_STORAGE_KEY, next);
        return next;
      });

      closePriceWatchEditor();
      return;
    }

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return;
    }

    const { error } = await supabase
      .from("price_watches")
      .update({
        target_price: targetPrice,
        active: true,
      })
      .eq("id", priceWatchEditor.key)
      .eq("user_id", user.id);

    if (error) {
      console.error("[ASARVO HOME][UPDATE WATCH]", error);
      setPriceWatchError(
        "Nie udało się zapisać nowego progu."
      );
      return;
    }

    await refreshSupabaseLibrary();
    closePriceWatchEditor();
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#050505] text-white">
      {/* Tło */}
      <div className="pointer-events-none absolute left-1/2 top-[-250px] h-[650px] w-[900px] -translate-x-1/2 rounded-full bg-blue-600/10 blur-[150px]" />

      <div className="pointer-events-none absolute bottom-[-300px] left-1/2 h-[550px] w-[800px] -translate-x-1/2 rounded-full bg-purple-600/10 blur-[160px]" />

      <div className="relative mx-auto flex min-h-screen max-w-6xl flex-col px-5 sm:px-8">
        {/* HEADER */}
        <header className="flex items-center justify-between gap-3 py-6">
          <a href="/" className="shrink-0 text-xl font-bold tracking-tight">
            <span className="text-blue-400">A</span>SARVO
          </a>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() =>
                setLibraryPanel((current) =>
                  current === "history" ? null : "history"
                )
              }
              aria-expanded={libraryPanel === "history"}
              className={`rounded-full border px-3 py-2 text-xs transition sm:px-4 sm:text-sm ${
                libraryPanel === "history"
                  ? "border-blue-500/30 bg-blue-500/[0.10] text-blue-200"
                  : "border-white/10 bg-white/[0.03] text-gray-300 hover:bg-white/[0.07] hover:text-white"
              }`}
            >
              Historia{searchHistory.length > 0 ? ` (${searchHistory.length})` : ""}
            </button>

            <button
              type="button"
              onClick={() =>
                setLibraryPanel((current) =>
                  current === "favorites" ? null : "favorites"
                )
              }
              aria-expanded={libraryPanel === "favorites"}
              className={`rounded-full border px-3 py-2 text-xs transition sm:px-4 sm:text-sm ${
                libraryPanel === "favorites"
                  ? "border-rose-500/30 bg-rose-500/[0.10] text-rose-200"
                  : "border-white/10 bg-white/[0.03] text-gray-300 hover:bg-white/[0.07] hover:text-white"
              }`}
            >
              ♥ Ulubione{favorites.length > 0 ? ` (${favorites.length})` : ""}
            </button>

            <button
              type="button"
              onClick={() =>
                setLibraryPanel((current) =>
                  current === "watches" ? null : "watches"
                )
              }
              aria-expanded={libraryPanel === "watches"}
              className={`rounded-full border px-3 py-2 text-xs transition sm:px-4 sm:text-sm ${
                reachedPriceWatches.length > 0
                  ? "border-emerald-500/35 bg-emerald-500/[0.10] text-emerald-200 shadow-[0_0_24px_rgba(16,185,129,0.10)]"
                  : libraryPanel === "watches"
                    ? "border-amber-500/30 bg-amber-500/[0.10] text-amber-200"
                    : "border-white/10 bg-white/[0.03] text-gray-300 hover:bg-white/[0.07] hover:text-white"
              }`}
            >
              🔔 Obserwowane
              {priceWatches.length > 0
                ? ` (${priceWatches.length})`
                : ""}
              {reachedPriceWatches.length > 0 && (
                <span className="ml-2 rounded-full bg-emerald-400/15 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                  {reachedPriceWatches.length} CEL
                </span>
              )}
            </button>

            <a
              href={isAuthenticated ? "/account" : "/login"}
              className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-gray-300 transition hover:bg-white/[0.07] hover:text-white sm:px-5 sm:text-sm"
            >
              {!authReady
                ? "Konto"
                : isAuthenticated
                  ? "Moje konto"
                  : "Zaloguj się"}
            </a>
          </div>
        </header>

        {visibleReachedPriceWatches.length > 0 && (
          <div className="mb-4 rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.07] p-4 shadow-[0_20px_70px_rgba(0,0,0,0.35)]">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="text-sm font-bold text-emerald-300">
                  🔔 Cena osiągnęła Twój próg
                </div>
                <div className="mt-1 text-sm text-gray-300">
                  {visibleReachedPriceWatches.length === 1
                    ? `${visibleReachedPriceWatches[0].product.name} kosztuje teraz ${formatPrice(
                        visibleReachedPriceWatches[0]
                          .lastCheckedPrice ??
                          visibleReachedPriceWatches[0]
                            .currentPrice
                      )}.`
                    : `${visibleReachedPriceWatches.length} obserwowane produkty osiągnęły ustawiony przez Ciebie próg ceny.`}
                </div>
              </div>

              <div className="flex shrink-0 flex-wrap gap-2">
                {browserNotificationsSupported &&
                  browserNotificationPermission ===
                    "default" && (
                    <button
                      type="button"
                      onClick={() =>
                        void requestBrowserNotifications()
                      }
                      className="rounded-xl border border-emerald-500/30 bg-emerald-500/[0.08] px-4 py-2 text-xs font-bold text-emerald-200 transition hover:bg-emerald-500/[0.13]"
                    >
                      Włącz systemowe
                    </button>
                  )}

                <button
                  type="button"
                  onClick={() => setLibraryPanel("watches")}
                  className="rounded-xl bg-emerald-500 px-4 py-2 text-xs font-bold text-black transition hover:bg-emerald-400"
                >
                  Zobacz
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setDismissedPriceAlertKey(priceAlertKey)
                  }
                  className="rounded-xl border border-white/10 px-4 py-2 text-xs text-gray-400 transition hover:bg-white/[0.05] hover:text-white"
                >
                  Zamknij
                </button>
              </div>
            </div>
          </div>
        )}

        {libraryPanel === "history" && (
          <div className="rounded-2xl border border-white/[0.08] bg-[#0a0a0a]/95 p-4 shadow-2xl backdrop-blur-xl">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="font-semibold">Ostatnie wyszukiwania</div>
                <div className="mt-1 text-xs text-gray-600">
                  {isAuthenticated
                    ? "Te same dane są zapisane na Twoim koncie."
                    : "Zapisują się lokalnie na tym urządzeniu."}
                </div>
              </div>

              {searchHistory.length > 0 && (
                <button
                  type="button"
                  onClick={() => void clearSearchHistory()}
                  className="text-xs text-gray-500 transition hover:text-white"
                >
                  Wyczyść
                </button>
              )}
            </div>

            {searchHistory.length > 0 ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {searchHistory.map((entry) => (
                  <a
                    key={`${entry.query}-${entry.searchedAt}`}
                    href={`/search?q=${encodeURIComponent(entry.query)}`}
                    className="rounded-full border border-white/[0.08] bg-white/[0.025] px-4 py-2 text-sm text-gray-300 transition hover:border-blue-500/30 hover:bg-blue-500/[0.06] hover:text-white"
                  >
                    {entry.query}
                  </a>
                ))}
              </div>
            ) : (
              <div className="mt-4 text-sm text-gray-600">
                Historia jest jeszcze pusta.
              </div>
            )}
          </div>
        )}

        {libraryPanel === "favorites" && (
          <div className="max-h-[420px] overflow-y-auto rounded-2xl border border-white/[0.08] bg-[#0a0a0a]/95 p-4 shadow-2xl backdrop-blur-xl">
            <div>
              <div className="font-semibold">Ulubione oferty</div>
              <div className="mt-1 text-xs text-gray-600">
                Te same oferty są dostępne również na stronie wyników.
              </div>
            </div>

            {favorites.length > 0 ? (
              <div className="mt-4 space-y-2">
                {favorites.map((entry) => (
                  <div
                    key={entry.key}
                    className="flex flex-col gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">
                        {entry.product.name}
                      </div>
                      <div className="mt-1 text-xs text-gray-600">
                        {entry.product.store} · {formatPrice(entry.product.price)}
                        {entry.query ? ` · wyszukano: ${entry.query}` : ""}
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      {entry.product.url && (
                        <a
                          href={entry.product.url}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-lg border border-white/10 px-3 py-2 text-xs text-gray-300 transition hover:bg-white/[0.05] hover:text-white"
                        >
                          Zobacz ↗
                        </a>
                      )}

                      <button
                        type="button"
                        onClick={() => void removeFavorite(entry.key)}
                        className="rounded-lg border border-rose-500/15 px-3 py-2 text-xs text-rose-300 transition hover:bg-rose-500/[0.08]"
                      >
                        Usuń
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-4 text-sm text-gray-600">
                Nie masz jeszcze zapisanych ofert.
              </div>
            )}
          </div>
        )}

        {libraryPanel === "watches" && (
          <div className="max-h-[420px] overflow-y-auto rounded-2xl border border-amber-500/15 bg-[#0a0a0a]/95 p-4 shadow-2xl backdrop-blur-xl">
            <div>
              <div className="flex items-center justify-between gap-3">
                <div className="font-semibold">
                  Obserwowane ceny
                </div>
                {priceMonitorRunning && (
                  <div className="text-[11px] text-blue-400">
                    Sprawdzam ceny…
                  </div>
                )}
              </div>
              <div className="mt-1 text-xs leading-5 text-gray-600">
                {isAuthenticated
                  ? "Te same obserwacje są zapisane w Supabase i widoczne w panelu konta."
                  : "Dla gościa obserwacje są zapisane tylko lokalnie na tym urządzeniu."}
              </div>

              {isAuthenticated && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {!browserNotificationsSupported ? (
                    <div className="rounded-lg border border-white/[0.07] px-3 py-2 text-[11px] text-gray-600">
                      Ta przeglądarka nie udostępnia zwykłych powiadomień systemowych.
                    </div>
                  ) : browserNotificationPermission ===
                    "granted" ? (
                    <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/[0.06] px-3 py-2 text-[11px] font-medium text-emerald-300">
                      ✓ Powiadomienia systemowe włączone
                    </div>
                  ) : browserNotificationPermission ===
                    "denied" ? (
                    <div className="rounded-lg border border-red-500/20 bg-red-500/[0.05] px-3 py-2 text-[11px] text-red-300">
                      Powiadomienia zablokowane w ustawieniach przeglądarki
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() =>
                        void requestBrowserNotifications()
                      }
                      className="rounded-lg border border-blue-500/20 bg-blue-500/[0.06] px-3 py-2 text-[11px] font-medium text-blue-300 transition hover:bg-blue-500/[0.11]"
                    >
                      🔔 Włącz powiadomienia systemowe
                    </button>
                  )}

                  <span className="text-[10px] text-gray-700">
                    Działają także, gdy karta ASARVO jest w tle.
                  </span>
                </div>
              )}
            </div>

            {reachedPriceWatches.length > 0 && (
              <div className="mt-4 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.07] p-4">
                <div className="text-xs font-bold uppercase tracking-[0.12em] text-emerald-300">
                  ✓ Cel cenowy osiągnięty
                </div>
                <div className="mt-1 text-xs text-gray-400">
                  {reachedPriceWatches.length === 1
                    ? "1 obserwowany produkt jest już w cenie, na którą czekałeś."
                    : `${reachedPriceWatches.length} obserwowane produkty są już w cenie, na którą czekałeś.`}
                </div>
              </div>
            )}

            {priceWatches.length > 0 ? (
              <div className="mt-4 space-y-2">
                {priceWatches.map((entry) => {
                  const currentPrice =
                    entry.lastCheckedPrice ??
                    entry.currentPrice;
                  const targetReached =
                    entry.active &&
                    currentPrice !== null &&
                    Number.isFinite(currentPrice) &&
                    currentPrice <= entry.targetPrice;

                  return (
                  <div
                    key={entry.key}
                    className={`flex flex-col gap-4 rounded-xl border p-4 lg:flex-row lg:items-center lg:justify-between ${
                      targetReached
                        ? "border-emerald-500/25 bg-emerald-500/[0.055]"
                        : "border-white/[0.07] bg-white/[0.02]"
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="truncate text-sm font-medium">
                          {entry.product.name}
                        </div>
                        <span
                          className={`rounded-full border px-2 py-1 text-[10px] font-semibold ${
                            entry.active
                              ? "border-emerald-500/20 bg-emerald-500/[0.07] text-emerald-300"
                              : "border-white/10 bg-white/[0.03] text-gray-500"
                          }`}
                        >
                          {entry.active ? "AKTYWNA" : "WSTRZYMANA"}
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-gray-600">
                        {entry.product.store} · obecnie{" "}
                        {formatPrice(currentPrice)}
                        {entry.query
                          ? ` · wyszukano: ${entry.query}`
                          : ""}
                      </div>

                      {targetReached ? (
                        <div className="mt-2 text-sm font-semibold text-emerald-300">
                          ✓ Cel osiągnięty ·{" "}
                          {currentPrice !== null &&
                          currentPrice < entry.targetPrice
                            ? `${formatPrice(
                                entry.targetPrice -
                                  currentPrice
                              )} poniżej progu`
                            : "cena jest na Twoim progu"}
                        </div>
                      ) : (
                        <div className="mt-2 text-sm font-semibold text-amber-300">
                          Powiadom poniżej{" "}
                          {formatPrice(entry.targetPrice)}
                        </div>
                      )}
                    </div>

                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => openPriceWatchEditor(entry)}
                        className="rounded-lg border border-amber-500/15 px-3 py-2 text-xs text-amber-200 transition hover:bg-amber-500/[0.07]"
                      >
                        Zmień próg
                      </button>
                      <button
                        type="button"
                        onClick={() => void togglePriceWatchActive(entry.key)}
                        className="rounded-lg border border-white/10 px-3 py-2 text-xs text-gray-300 transition hover:bg-white/[0.05] hover:text-white"
                      >
                        {entry.active ? "Wstrzymaj" : "Wznów"}
                      </button>
                      {entry.product.url && (
                        <a
                          href={entry.product.url}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-lg border border-white/10 px-3 py-2 text-xs text-gray-300 transition hover:bg-white/[0.05] hover:text-white"
                        >
                          Zobacz ↗
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={() => void removePriceWatch(entry.key)}
                        className="rounded-lg border border-rose-500/15 px-3 py-2 text-xs text-rose-300 transition hover:bg-rose-500/[0.08]"
                      >
                        Usuń
                      </button>
                    </div>
                  </div>
                  );
                })}
              </div>
            ) : (
              <div className="mt-4 text-sm text-gray-600">
                Nie obserwujesz jeszcze żadnej ceny.
              </div>
            )}
          </div>
        )}

        {priceWatchEditor && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-5 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="home-price-watch-title"
          >
            <div className="w-full max-w-md rounded-3xl border border-amber-500/20 bg-[#0b0b0b] p-6 shadow-[0_30px_120px_rgba(0,0,0,0.75)]">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-amber-300">
                    🔔 Obserwowana cena
                  </div>
                  <h2 id="home-price-watch-title" className="mt-2 text-xl font-bold">
                    Zmień próg
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={closePriceWatchEditor}
                  className="rounded-full border border-white/10 px-3 py-1.5 text-sm text-gray-400 transition hover:bg-white/[0.05] hover:text-white"
                  aria-label="Zamknij"
                >
                  ✕
                </button>
              </div>

              <label className="mt-5 block text-sm text-gray-300">
                Powiadom mnie, gdy cena spadnie poniżej
                <div className="mt-2 flex items-center rounded-xl border border-white/10 bg-black/30 px-4 focus-within:border-amber-500/35">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={priceWatchEditor.targetPriceInput}
                    onChange={(event) => {
                      setPriceWatchError(null);
                      setPriceWatchEditor((current) =>
                        current
                          ? {
                              ...current,
                              targetPriceInput: event.target.value,
                            }
                          : current
                      );
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        void savePriceWatchTarget();
                      }
                    }}
                    placeholder="np. 250,00"
                    className="min-h-14 flex-1 bg-transparent text-lg font-semibold outline-none placeholder:text-gray-700"
                    autoFocus
                  />
                  <span className="text-sm text-gray-500">zł</span>
                </div>
              </label>

              {priceWatchError && (
                <div className="mt-3 text-sm text-rose-300">
                  {priceWatchError}
                </div>
              )}

              <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={closePriceWatchEditor}
                  className="rounded-xl border border-white/10 px-5 py-3 text-sm text-gray-300 transition hover:bg-white/[0.05] hover:text-white"
                >
                  Anuluj
                </button>
                <button
                  type="button"
                  onClick={() => void savePriceWatchTarget()}
                  className="rounded-xl bg-amber-500 px-5 py-3 text-sm font-semibold text-black transition hover:bg-amber-400"
                >
                  Zapisz próg
                </button>
              </div>
            </div>
          </div>
        )}

        {/* GŁÓWNA SEKCJA */}
        <section className="flex flex-1 flex-col items-center justify-center pb-24 pt-10 text-center">
          {/* BADGE */}
          <div className="mb-7 flex items-center gap-2 rounded-full border border-blue-500/20 bg-blue-500/[0.08] px-4 py-2 text-sm text-blue-400">
            <span className="h-2 w-2 rounded-full bg-blue-400 shadow-[0_0_12px_rgba(96,165,250,0.9)]" />
            Inteligentne zakupy z AI
          </div>

          {/* NAGŁÓWEK */}
          <h1 className="max-w-5xl text-5xl font-semibold leading-[1.03] tracking-[-0.045em] sm:text-6xl lg:text-7xl">
            Znajdź najlepszą ofertę.
            <br />

            <span className="bg-gradient-to-r from-blue-400 via-cyan-300 to-purple-400 bg-clip-text text-transparent">
              Bez szukania godzinami.
            </span>
          </h1>

          {/* OPIS */}
          <p className="mt-7 max-w-2xl text-base leading-7 text-gray-400 sm:text-lg">
            Opisz czego potrzebujesz własnymi słowami.
            <br className="hidden sm:block" />
            AI znajdzie, porówna i pomoże wybrać najlepszą ofertę.
          </p>

          {/* WYSZUKIWARKA */}
          <div className="mt-12 w-full max-w-4xl">
            <div className="rounded-2xl border border-white/10 bg-white/[0.045] p-2 shadow-[0_25px_100px_rgba(0,0,0,0.55)] backdrop-blur-xl transition duration-300 focus-within:border-blue-500/40 focus-within:shadow-[0_25px_100px_rgba(37,99,235,0.15)]">
              <div className="flex flex-col gap-2 sm:flex-row">
                {/* POLE TEKSTOWE */}
                <div className="flex min-h-16 flex-1 items-center">
                  <svg
                    className="ml-5 mr-3 h-5 w-5 shrink-0 text-gray-500"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <circle cx="11" cy="11" r="7" />
                    <path d="m20 20-4-4" />
                  </svg>

                  <input
                    value={query}
                    onChange={(event) => {
                      setQuery(event.target.value);
                      if (voiceMessage) {
                        setVoiceMessage(null);
                      }
                      if (imageMessage) {
                        setImageMessage(null);
                      }
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        handleSearch();
                      }
                    }}
                    type="text"
                    placeholder="Czego szukasz? np. oryginalny pad do PS4 do 200 zł"
                    className="w-full bg-transparent pr-3 text-base text-white outline-none placeholder:text-gray-600"
                  />

                  <button
                    type="button"
                    onClick={startVoiceSearch}
                    aria-label={
                      voiceListening
                        ? "Zatrzymaj wyszukiwanie głosowe"
                        : "Wyszukaj głosem"
                    }
                    title={
                      voiceListening
                        ? "Zatrzymaj słuchanie"
                        : "Powiedz, czego szukasz"
                    }
                    className={`relative mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition ${
                      voiceListening
                        ? "border-cyan-300/50 bg-cyan-400/[0.12] text-cyan-200 shadow-[0_0_28px_rgba(34,211,238,0.18)]"
                        : "border-white/10 bg-white/[0.025] text-gray-500 hover:border-blue-400/30 hover:bg-blue-500/[0.07] hover:text-blue-300"
                    }`}
                  >
                    {voiceListening && (
                      <span className="absolute inset-0 animate-ping rounded-xl border border-cyan-300/30" />
                    )}

                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      aria-hidden="true"
                      className="relative h-5 w-5"
                    >
                      <path
                        d="M12 14.5a3.5 3.5 0 0 0 3.5-3.5V6a3.5 3.5 0 1 0-7 0v5a3.5 3.5 0 0 0 3.5 3.5Z"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                      />
                      <path
                        d="M5.5 10.5v.5a6.5 6.5 0 0 0 13 0v-.5M12 17.5V21M9 21h6"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                      />
                    </svg>
                  </button>

                  <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];

                      if (file) {
                        void handleImageSearch(file);
                      }
                    }}
                  />

                  <button
                    type="button"
                    onClick={() => imageInputRef.current?.click()}
                    disabled={imageAnalyzing}
                    aria-label="Wyszukaj produktem ze zdjęcia"
                    title="Dodaj zdjęcie produktu"
                    className={`relative mr-2 flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl border px-3.5 text-xs font-semibold transition ${
                      imageAnalyzing
                        ? "cursor-wait border-violet-300/45 bg-violet-400/[0.12] text-violet-200"
                        : "border-violet-400/20 bg-violet-500/[0.055] text-violet-300 hover:border-violet-400/40 hover:bg-violet-500/[0.10] hover:text-violet-200"
                    }`}
                  >
                    {imageAnalyzing ? (
                      <>
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-violet-200/30 border-t-violet-200" />
                        <span className="hidden md:inline">Analizuję…</span>
                      </>
                    ) : (
                      <>
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          aria-hidden="true"
                          className="h-4.5 w-4.5"
                        >
                          <path
                            d="M4 7.5h3l1.2-2h7.6l1.2 2h3a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9.5a2 2 0 0 1 2-2Z"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinejoin="round"
                          />
                          <circle
                            cx="12"
                            cy="13.5"
                            r="3.2"
                            stroke="currentColor"
                            strokeWidth="1.8"
                          />
                        </svg>
                        <span className="hidden md:inline">Zdjęcie</span>
                      </>
                    )}
                  </button>
                </div>

                {/* PRZYCISK SZUKAJ */}
                <button
                  type="button"
                  onClick={handleSearch}
                  className="min-h-16 rounded-xl bg-blue-600 px-10 text-base font-semibold shadow-[0_8px_35px_rgba(37,99,235,0.25)] transition hover:bg-blue-500 hover:shadow-[0_8px_45px_rgba(37,99,235,0.35)] active:scale-[0.98]"
                >
                  Szukaj
                </button>
              </div>

              {voiceMessage && (
                <div
                  className={`px-4 pb-2 pt-1 text-left text-xs ${
                    voiceListening ? "text-cyan-300" : "text-gray-500"
                  }`}
                  aria-live="polite"
                >
                  {voiceListening ? "🎙️ " : ""}
                  {voiceMessage}
                </div>
              )}

              {imageMessage && (
                <div
                  className={`px-4 pb-2 pt-1 text-left text-xs ${
                    imageAnalyzing ? "text-violet-300" : "text-gray-500"
                  }`}
                  aria-live="polite"
                >
                  {imageAnalyzing ? "📷 " : ""}
                  {imageMessage}
                </div>
              )}
            </div>
          </div>

          {/* PRZYKŁADOWE ZAPYTANIA */}
          <div className="mt-5 flex max-w-4xl flex-wrap justify-center gap-2">
            {examples.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => setQuery(example.replace(/^.{2}/, ""))}
                className="rounded-full border border-white/10 bg-white/[0.025] px-4 py-2.5 text-xs text-gray-500 transition hover:border-blue-500/30 hover:bg-blue-500/[0.06] hover:text-gray-300"
              >
                {example}
              </button>
            ))}
          </div>

          {/* INFORMACJA */}
          <div className="mt-10 flex items-center gap-2 text-xs text-gray-600">
            <svg
              className="h-4 w-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M12 3 4 7v5c0 5 3.5 8 8 9 4.5-1 8-4 8-9V7l-8-4Z" />
              <path d="m9 12 2 2 4-4" />
            </svg>

            <span>Porównujemy oferty, żebyś nie musiał.</span>
          </div>
        </section>

        {/* STOPKA */}
        <footer className="border-t border-white/[0.06] py-5 text-center text-xs text-gray-700">
          AI Shopping · Inteligentne wyszukiwanie zakupów
        </footer>
      </div>
    </main>
  );
}
