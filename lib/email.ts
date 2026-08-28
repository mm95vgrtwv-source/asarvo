type SendEmailResult = {
  ok: boolean;
  messageId: string | null;
  error: string | null;
  skipped?: boolean;
};

type PriceAlertEmailInput = {
  to: string;
  displayName?: string | null;
  productName: string;
  store: string;
  currentPrice: number;
  targetPrice: number;
  productUrl?: string | null;
};

function formatPrice(value: number): string {
  return new Intl.NumberFormat("pl-PL", {
    style: "currency",
    currency: "PLN",
    minimumFractionDigits: 2,
  }).format(value);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function sendBrevoEmail(payload: {
  to: string;
  subject: string;
  htmlContent: string;
  textContent: string;
}): Promise<SendEmailResult> {
  const apiKey = process.env.BREVO_API_KEY?.trim();
  const senderEmail = process.env.BREVO_SENDER_EMAIL?.trim();
  const senderName =
    process.env.BREVO_SENDER_NAME?.trim() || "ASARVO";

  if (!apiKey || !senderEmail) {
    return {
      ok: false,
      messageId: null,
      error:
        "Brevo nie jest skonfigurowane. Brakuje BREVO_API_KEY lub BREVO_SENDER_EMAIL.",
      skipped: true,
    };
  }

  try {
    const response = await fetch(
      "https://api.brevo.com/v3/smtp/email",
      {
        method: "POST",
        headers: {
          accept: "application/json",
          "api-key": apiKey,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          sender: {
            name: senderName,
            email: senderEmail,
          },
          to: [
            {
              email: payload.to,
            },
          ],
          subject: payload.subject,
          htmlContent: payload.htmlContent,
          textContent: payload.textContent,
          tags: ["asarvo-price-alert"],
        }),
        signal: AbortSignal.timeout(15_000),
      }
    );

    const raw = await response.text();
    let parsed: Record<string, unknown> = {};

    if (raw) {
      try {
        parsed = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        parsed = {};
      }
    }

    if (!response.ok) {
      const message =
        typeof parsed.message === "string"
          ? parsed.message
          : `Brevo HTTP ${response.status}`;

      return {
        ok: false,
        messageId: null,
        error: message,
      };
    }

    return {
      ok: true,
      messageId:
        typeof parsed.messageId === "string"
          ? parsed.messageId
          : null,
      error: null,
    };
  } catch (error) {
    return {
      ok: false,
      messageId: null,
      error:
        error instanceof Error
          ? error.message
          : "Nieznany błąd wysyłki e-mail.",
    };
  }
}

export async function sendPriceAlertEmail(
  input: PriceAlertEmailInput
): Promise<SendEmailResult> {
  const safeName = escapeHtml(input.productName);
  const safeStore = escapeHtml(input.store);
  const safeDisplayName = input.displayName
    ? escapeHtml(input.displayName)
    : "";
  const current = formatPrice(input.currentPrice);
  const target = formatPrice(input.targetPrice);
  const difference = Math.max(
    0,
    Math.round((input.targetPrice - input.currentPrice) * 100) / 100
  );
  const differenceText = formatPrice(difference);

  const productLink =
    input.productUrl &&
    /^https?:\/\//i.test(input.productUrl)
      ? input.productUrl
      : null;

  const htmlContent = `
<!doctype html>
<html lang="pl">
  <body style="margin:0;background:#050505;color:#ffffff;font-family:Arial,Helvetica,sans-serif;">
    <div style="max-width:640px;margin:0 auto;padding:32px 20px;">
      <div style="font-size:20px;font-weight:700;letter-spacing:.04em;">
        <span style="color:#60a5fa;">A</span>SARVO
      </div>

      <div style="margin-top:28px;border:1px solid rgba(16,185,129,.28);background:#07140f;border-radius:20px;padding:24px;">
        <div style="font-size:14px;font-weight:700;color:#6ee7b7;">
          🔔 Cena osiągnęła Twój próg
        </div>

        ${
          safeDisplayName
            ? `<p style="margin:18px 0 0;color:#d1d5db;">Cześć ${safeDisplayName},</p>`
            : ""
        }

        <h1 style="font-size:22px;line-height:1.35;margin:18px 0 0;color:#ffffff;">
          ${safeName}
        </h1>

        <p style="margin:10px 0 0;color:#9ca3af;">
          ${safeStore}
        </p>

        <div style="margin-top:22px;background:#050807;border:1px solid #1f2937;border-radius:16px;padding:18px;">
          <div style="font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:.08em;">Aktualna cena</div>
          <div style="font-size:28px;font-weight:800;margin-top:6px;color:#ffffff;">${current}</div>

          <div style="height:1px;background:#1f2937;margin:18px 0;"></div>

          <div style="font-size:14px;color:#9ca3af;">
            Twój próg: <strong style="color:#fbbf24;">${target}</strong>
          </div>
          <div style="font-size:14px;color:#6ee7b7;margin-top:8px;">
            ${differenceText} poniżej ustawionego progu
          </div>
        </div>

        ${
          productLink
            ? `<a href="${escapeHtml(
                productLink
              )}" style="display:block;text-align:center;text-decoration:none;margin-top:20px;background:#2563eb;color:#ffffff;font-weight:700;padding:14px 18px;border-radius:12px;">Zobacz ofertę</a>`
            : ""
        }
      </div>

      <p style="margin:20px 4px 0;color:#4b5563;font-size:12px;line-height:1.6;">
        To automatyczne powiadomienie ASARVO dotyczące obserwowanej przez Ciebie ceny.
      </p>
    </div>
  </body>
</html>`;

  const textContent = [
    "ASARVO — cena osiągnęła Twój próg",
    "",
    input.productName,
    input.store,
    `Aktualna cena: ${current}`,
    `Twój próg: ${target}`,
    `${differenceText} poniżej progu`,
    productLink ? `Oferta: ${productLink}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return sendBrevoEmail({
    to: input.to,
    subject: `🔔 ASARVO: cena spadła do ${current}`,
    htmlContent,
    textContent,
  });
}

export async function sendPriceAlertTestEmail(input: {
  to: string;
  displayName?: string | null;
}): Promise<SendEmailResult> {
  return sendBrevoEmail({
    to: input.to,
    subject: "ASARVO — test powiadomień e-mail",
    htmlContent: `
<!doctype html>
<html lang="pl">
  <body style="margin:0;background:#050505;color:#ffffff;font-family:Arial,Helvetica,sans-serif;">
    <div style="max-width:600px;margin:0 auto;padding:32px 20px;">
      <div style="font-size:20px;font-weight:700;">
        <span style="color:#60a5fa;">A</span>SARVO
      </div>
      <div style="margin-top:24px;border:1px solid #1f2937;background:#0a0d14;border-radius:18px;padding:24px;">
        <h1 style="font-size:22px;margin:0;">✅ Powiadomienia e-mail działają</h1>
        <p style="margin:14px 0 0;color:#9ca3af;line-height:1.6;">
          ${
            input.displayName
              ? `Cześć ${escapeHtml(input.displayName)}, `
              : ""
          }gdy obserwowana cena osiągnie ustawiony przez Ciebie próg, ASARVO może wysłać Ci e-mail.
        </p>
      </div>
    </div>
  </body>
</html>`,
    textContent:
      "ASARVO — powiadomienia e-mail działają. Gdy obserwowana cena osiągnie Twój próg, ASARVO może wysłać Ci e-mail.",
  });
}
