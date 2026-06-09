import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { EVENT_ID, RESERVATION_TTL_MINUTES, priceForTier } from "@/lib/config";
import { initializeTransaction } from "@/lib/paystack";
import { corsHeaders } from "@/lib/cors";

export const dynamic = "force-dynamic";

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { headers: corsHeaders(req.headers.get("origin")) });
}

function genRef(): string {
  return (
    "PSK-" +
    Date.now().toString(36).toUpperCase() +
    "-" +
    Math.random().toString(36).slice(2, 8).toUpperCase()
  );
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export async function POST(req: NextRequest) {
  const headers = corsHeaders(req.headers.get("origin"));

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400, headers });
  }

  const { tier, email, name, phone, callbackUrl } = body || {};
  const pricing = priceForTier(tier);
  if (!pricing) return NextResponse.json({ error: "invalid_tier" }, { status: 400, headers });
  if (typeof email !== "string" || !EMAIL_RE.test(email))
    return NextResponse.json({ error: "invalid_email" }, { status: 400, headers });

  const reference = genRef();

  // 1) Atomically hold a seat (or learn we're sold out).
  const { data: reservationId, error: rErr } = await supabaseAdmin.rpc("reserve_seat", {
    p_event: EVENT_ID,
    p_reference: reference,
    p_tier: tier,
    p_name: name ?? null,
    p_email: email,
    p_phone: phone ?? null,
    p_amount: pricing.kobo,
    p_ttl_minutes: RESERVATION_TTL_MINUTES,
  });

  if (rErr) return NextResponse.json({ error: "reserve_failed" }, { status: 500, headers });
  if (!reservationId) return NextResponse.json({ error: "sold_out" }, { status: 409, headers });

  // 2) Initialise Paystack with the server-locked amount.
  try {
    const data = await initializeTransaction({
      email,
      amountKobo: pricing.kobo,
      reference,
      callbackUrl,
      metadata: {
        reservationId,
        event: EVENT_ID,
        tier,
        tierName: pricing.tier.name,
        earlyBird: pricing.isEarly,
        name: name ?? null,
        phone: phone ?? null,
      },
    });

    return NextResponse.json(
      {
        reference,
        accessCode: data.access_code,
        authorizationUrl: data.authorization_url,
        amountKobo: pricing.kobo,
        tierName: pricing.tier.name,
        earlyBird: pricing.isEarly,
      },
      { headers }
    );
  } catch {
    await supabaseAdmin
      .from("seat_reservations")
      .update({ status: "released" })
      .eq("reference", reference);
    return NextResponse.json({ error: "init_failed" }, { status: 502, headers });
  }
}
