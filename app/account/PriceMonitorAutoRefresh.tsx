"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

const AUTO_REFRESH_MS = 30 * 60 * 1000;

export default function PriceMonitorAutoRefresh() {
  const router = useRouter();
  const runningRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (runningRef.current || document.visibilityState === "hidden") {
        return;
      }

      runningRef.current = true;

      try {
        const response = await fetch("/api/account/price-monitor", {
          method: "POST",
          cache: "no-store",
        });

        if (!response.ok) {
          return;
        }

        const data = (await response.json()) as {
          checked?: number;
        };

        if (!cancelled && (data.checked ?? 0) > 0) {
          router.refresh();
        }
      } catch (error) {
        console.warn(
          "[ASARVO] Automatyczne sprawdzenie cen nie powiodło się:",
          error
        );
      } finally {
        runningRef.current = false;
      }
    };

    void run();

    const interval = window.setInterval(() => {
      void run();
    }, AUTO_REFRESH_MS);

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void run();
      }
    };

    document.addEventListener(
      "visibilitychange",
      onVisibilityChange
    );

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener(
        "visibilitychange",
        onVisibilityChange
      );
    };
  }, [router]);

  return null;
}
