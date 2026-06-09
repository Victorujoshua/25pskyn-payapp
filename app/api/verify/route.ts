import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { verifyTransaction } from "@/lib/paystack";
import { EVENT_ID } from "@/lib/config";
import { corsHeaders } from "@/lib/cors";

export const dynamic = "force-dynamic";

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { headers: corsHeaders(req.headers.get("origin")) });
}

// Page calls this after the popup closes — a fast confirmation path.
// The webhook stays the source of truth; this just finalises sooner.
export async function GET(req: NextRequest) {
  const headers = corsHeaders(req.headers.get("origin"));
  const ref = req.nextUrl.searchParams.get("reference");
  if (!ref) return NextResponse.json({ error: "missing_reference" }, { status: 400, headers });

  try {
    const data = await verifyTransaction(ref);
    if (data.status === "success") {
      const { data: st } = await supabaseAdmin.rpc("finalize_seat", {
        p_event: EVENT_ID,
        p_reference: ref,
      });
      return NextResponse.json({ status: st || "paid" }, { headers });
    }
    return NextResponse.json({ status: data.status }, { headers });
  } catch {
    return NextResponse.json({ error: "verify_failed" }, { status: 502, headers });
  }
}
