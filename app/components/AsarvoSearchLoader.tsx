"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./AsarvoSearchLoader.module.css";

type AsarvoSearchLoaderProps = {
  query?: string;
  className?: string;
};

const SEARCH_BUDGET_MS = 20_000;
const MAX_VISIBLE_PROGRESS = 94;

const STAGES = [
  {
    at: 0,
    title: "Rozumiem Twoje wymagania",
    description: "Analizuję produkt, budżet i najważniejsze parametry.",
  },
  {
    at: 2_600,
    title: "Przeszukuję dostępne źródła",
    description: "Szukam ofert w wielu miejscach równolegle.",
  },
  {
    at: 6_800,
    title: "Porównuję znalezione oferty",
    description: "Porównuję ceny, warianty i informacje o zakupie.",
  },
  {
    at: 11_000,
    title: "Weryfikuję produkty",
    description: "Sprawdzam zgodność ofert z Twoimi wymaganiami.",
  },
  {
    at: 15_300,
    title: "Wybieram najlepsze wyniki",
    description: "Porządkuję zweryfikowane oferty przed wyświetleniem.",
  },
] as const;

function getStageIndex(elapsedMs: number) {
  for (let i = STAGES.length - 1; i >= 0; i -= 1) {
    if (elapsedMs >= STAGES[i].at) return i;
  }
  return 0;
}

function getVisualProgress(elapsedMs: number) {
  const linear = Math.min(elapsedMs / SEARCH_BUDGET_MS, 1);
  const eased = 1 - Math.pow(1 - linear, 1.7);

  // To wyłącznie orientacyjny postęp UX.
  // Nigdy nie dochodzi do 100%, dopóki prawdziwe wyszukiwanie nie zakończy się
  // i komponent nie zostanie zdjęty przez rodzica.
  return Math.min(
    Math.round(eased * MAX_VISIBLE_PROGRESS),
    MAX_VISIBLE_PROGRESS,
  );
}

export default function AsarvoSearchLoader({
  query,
  className = "",
}: AsarvoSearchLoaderProps) {
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    const startedAt = performance.now();

    const update = () => {
      setElapsedMs(performance.now() - startedAt);
    };

    update();
    const timer = window.setInterval(update, 120);

    return () => window.clearInterval(timer);
  }, []);

  const stageIndex = useMemo(() => getStageIndex(elapsedMs), [elapsedMs]);
  const progress = useMemo(() => getVisualProgress(elapsedMs), [elapsedMs]);
  const stage = STAGES[stageIndex];
  const safeQuery = query?.trim();

  return (
    <section
      className={`${styles.loader} ${className}`.trim()}
      aria-live="polite"
      aria-busy="true"
      aria-label="ASARVO wyszukuje oferty"
    >
      <div className={`${styles.ambient} ${styles.ambientOne}`} />
      <div className={`${styles.ambient} ${styles.ambientTwo}`} />

      <div className={styles.card}>
        <div className={styles.brandMark} aria-hidden="true">
          <svg className={styles.logo} viewBox="0 0 120 120">
            <defs>
              <linearGradient
                id="asarvo-logo-gradient"
                x1="20"
                y1="20"
                x2="100"
                y2="100"
              >
                <stop offset="0%" stopColor="#3b82f6" />
                <stop offset="55%" stopColor="#22a7f0" />
                <stop offset="100%" stopColor="#5eead4" />
              </linearGradient>
              <linearGradient
                id="asarvo-ring-gradient"
                x1="12"
                y1="12"
                x2="106"
                y2="106"
              >
                <stop offset="0%" stopColor="#2563eb" stopOpacity="0.35" />
                <stop offset="58%" stopColor="#2f7df6" />
                <stop offset="100%" stopColor="#52e5df" />
              </linearGradient>
            </defs>

            <circle
              cx="60"
              cy="60"
              r="48"
              fill="none"
              stroke="rgba(59,130,246,.14)"
              strokeWidth="2"
            />
            <circle
              className={styles.ring}
              cx="60"
              cy="60"
              r="48"
              fill="none"
              stroke="url(#asarvo-ring-gradient)"
              strokeWidth="2.7"
              strokeLinecap="round"
              strokeDasharray="214 302"
            />

            <path
              d="M35 77.5 55.6 35c1.8-3.7 7-3.7 8.8 0L85 77.5c1.6 3.3-.8 7.1-4.4 7.1h-7.9c-2 0-3.8-1.2-4.6-3L60 64.8l-8.1 16.8c-.8 1.8-2.6 3-4.6 3h-7.9c-3.6 0-6-3.8-4.4-7.1Z"
              fill="url(#asarvo-logo-gradient)"
            />
          </svg>
          <span className={styles.brandName}>ASARVO</span>
        </div>

        <div className={styles.eyebrow}>ASARVO SEARCH</div>

        <div className={styles.copy} key={stageIndex}>
          <h2 className={styles.title}>{stage.title}</h2>
          <p className={styles.description}>{stage.description}</p>
        </div>

        {safeQuery ? (
          <div className={styles.query} title={safeQuery}>
            <span>„{safeQuery}”</span>
          </div>
        ) : null}

        <div className={styles.progressArea}>
          <div className={styles.progressLabels}>
            <span>WYSZUKIWANIE</span>
            <span>ORIENTACYJNY POSTĘP</span>
          </div>

          <div
            className={styles.progressTrack}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
            aria-valuetext={`Orientacyjny postęp ${progress}%`}
          >
            <div
              className={styles.progressFill}
              style={{ width: `${progress}%` }}
            />
          </div>

          <div className={styles.steps} aria-hidden="true">
            {STAGES.map((item, index) => {
              const isActive = index === stageIndex;
              const isDone = index < stageIndex;

              return (
                <div
                  className={`${styles.step} ${
                    isActive ? styles.active : ""
                  } ${isDone ? styles.done : ""}`.trim()}
                  key={item.title}
                >
                  <div className={styles.stepLine} />
                  <span>{index + 1}</span>
                </div>
              );
            })}
          </div>
        </div>

        <p className={styles.footer}>
          ASARVO weryfikuje wyniki zamiast pokazywać pierwsze przypadkowe oferty.
        </p>
      </div>
    </section>
  );
}
