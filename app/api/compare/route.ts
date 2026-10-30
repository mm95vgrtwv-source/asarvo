import { NextResponse } from "next/server";
import { groupOffers, type ComparisonOffer } from "@/lib/asarvo/core077-offer-comparison";

export const runtime = "nodejs";
const MAX_OFFERS = 100;
const MAX_BYTES = 96_000;

export async function POST(request: Request) {
  try {
    if (Number(request.headers.get("content-length") || 0) > MAX_BYTES) {
      return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
    }
    const raw = await request.text();
    if (raw.length > MAX_BYTES) {
      return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
    }
    let payload: unknown;
    try { payload = JSON.parse(raw); }
    catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
    }
    const offers = (payload as { offers?: unknown }).offers;
    if (!Array.isArray(offers) || offers.length > MAX_OFFERS) {
      return NextResponse.json({ error: "offers_must_be_array_max_100" }, { status: 400 });
    }
    // CORE077 verifies URLs, identity, currencies, finite prices and shipping.
    const result = groupOffers(offers as ComparisonOffer[]);
    // No winner when shipping is unknown. Identity is conservative (explicit SKU/variant or matching URL).
    return NextResponse.json({
      version: "core078-v1", count: offers.length,
      groups: result.groups.map(g => ({ id: g.id, offers: g.offers.map(e => ({
        url: e.url, price: e.price, shippingCost: e.shippingCost ?? null,
        shippingKnown: e.shippingKnown, total: e.total ?? null,
      })) })),
      rejected: result.rejected.map(r => ({ reason: r.reason })),
      warning: "Unknown shipping is never treated as free. Product identity requires evidence."
    });
  } catch {
    return NextResponse.json({ error: "invalid_offers" }, { status: 400 });
  }
}
