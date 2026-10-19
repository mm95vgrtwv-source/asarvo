"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./AsarvoSearchLoader.module.css";

type AsarvoSearchLoaderProps = {
  query?: string;
  className?: string;
};

const SEARCH_BUDGET_MS = 20_000;

// ASARVO_RESULTS_UI_V6_LOADING_QA
// ASARVO_RESULTS_UI_V5_7_LOADING_FINISH
const MAX_VISIBLE_PROGRESS = 94;

const STAGES = [
  {
    at: 0,
    title: "Rozumiem zapytanie",
    description: "Wyłapuję produkt, budżet i warunki, których nie wolno pominąć.",
  },
  {
    at: 2_600,
    title: "Przeszukuję sklepy i źródła",
    description: "Zbieram dostępne oferty i łączę duplikaty tego samego produktu.",
  },
  {
    at: 6_800,
    title: "Odrzucam nietrafione wyniki",
    description: "Usuwam akcesoria, złe warianty i oferty niespełniające zapytania.",
  },
  {
    at: 11_000,
    title: "Porównuję cenę i ryzyko",
    description: "Sprawdzam koszt, źródło, zgodność produktu i sygnały wiarygodności.",
  },
  {
    at: 15_300,
    title: "Układam najlepsze odpowiedzi",
    description: "Porządkuję zweryfikowane wyniki, żeby od razu pokazać najważniejsze opcje.",
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
          <div className={styles.logoGlow} />
          <img
            src="/asarvo-mark.png"
            alt=""
            className={styles.logoMark}
          />
        </div>

        <div className={styles.eyebrow}>ASARVO SEARCH ENGINE</div>

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
            <span>ANALIZA RYNKU</span>
            <span>{progress}%</span>
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
          ASARVO filtruje przypadkowe wyniki zanim zobaczysz listę produktów.
        </p>
      </div>
    </section>
  );
}
