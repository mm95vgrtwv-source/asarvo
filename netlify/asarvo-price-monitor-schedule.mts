import type { Config } from "@netlify/functions";

export default async function handler(): Promise<Response> {
  const siteUrl =
    (process.env.URL ?? "")
      .trim()
      .replace(/\/+$/, "");

  const monitorSecret =
    (process.env.ASARVO_MONITOR_SECRET ?? "")
      .trim();

  if (!siteUrl) {
    console.error(
      "[ASARVO SCHEDULE] Brak zmiennej URL od Netlify."
    );

    return new Response(
      "Missing Netlify URL.",
      {
        status: 500,
      }
    );
  }

  if (!monitorSecret) {
    console.error(
      "[ASARVO SCHEDULE] Brak ASARVO_MONITOR_SECRET."
    );

    return new Response(
      "Missing monitor secret.",
      {
        status: 500,
      }
    );
  }

  const workerUrl =
    `${siteUrl}/api/internal/asarvo-price-monitor-worker`;

  try {
    const response =
      await fetch(
        workerUrl,
        {
          method: "POST",

          headers: {
            "x-asarvo-monitor-secret":
              monitorSecret,
          },

          cache: "no-store",
        }
      );

    if (!response.ok) {
      console.error(
        "[ASARVO SCHEDULE] Worker nie został uruchomiony.",
        {
          status:
            response.status,
          statusText:
            response.statusText,
        }
      );

      return new Response(
        "Worker invocation failed.",
        {
          status: 502,
        }
      );
    }

    console.log(
      "[ASARVO SCHEDULE] Worker został uruchomiony.",
      {
        status:
          response.status,
        time:
          new Date().toISOString(),
      }
    );

    return new Response(
      "ASARVO price monitor queued.",
      {
        status: 200,
      }
    );
  } catch (error) {
    console.error(
      "[ASARVO SCHEDULE] Błąd uruchamiania workera.",
      error
    );

    return new Response(
      "Worker invocation error.",
      {
        status: 500,
      }
    );
  }
}

export const config: Config = {
  schedule: "*/30 * * * *",
};