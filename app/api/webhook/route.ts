import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { supabaseAdmin } from "@/lib/supabase";
import { EVENT_ID } from "@/lib/config";

export const dynamic = "force-dynamic";

// Paystack signs every webhook: x-paystack-signature = HMAC-SHA512(rawBody, secretKey).
// Verify against the RAW body — read req.text(), not req.json().
export async function POST(req: NextRequest) {
  const raw = await req.text();
  const signature = req.headers.get("x-paystack-signature") || "";
  const secret = process.env.PAYSTACK_SECRET_KEY || "";

  const expected = crypto.createHmac("sha512", secret).update(raw).digest("hex");
  let valid = false;
  try {
    valid =
      signature.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    valid = false;
  }
  if (!valid) return NextResponse.json({ error: "invalid_signature" }, { status: 401 });

  const event = JSON.parse(raw);

  if (event?.event === "charge.success") {
    const reference = event?.data?.reference;
    if (reference) {
      const { data: status } = await supabaseAdmin.rpc("finalize_seat", {
        p_event: EVENT_ID,
        p_reference: reference,
      });
      if (status === "overflow") {
        console.warn(`[overflow] ${reference} paid past the 8-seat cap — refund required`);
      }
    }
  }

  return NextResponse.json({ received: true });
}
