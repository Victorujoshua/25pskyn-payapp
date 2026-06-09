import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { EVENT_ID, currentPricing } from "@/lib/config";
import { corsHeaders } from "@/lib/cors";

export const dynamic = "force-dynamic";

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { headers: corsHeaders(req.headers.get("origin")) });
}

export async function GET(req: NextRequest) {
  const headers = corsHeaders(req.headers.get("origin"));
  const { data: ev } = await supabaseAdmin
    .from("workshop_event")
    .select("total_seats")
    .eq("id", EVENT_ID)
    .single();
  const { data: taken, error } = await supabaseAdmin.rpc("seats_taken", { p_event: EVENT_ID });

  if (error || !ev) {
    return NextResponse.json({ error: "unavailable" }, { status: 500, headers });
  }
  const total = ev.total_seats as number;
  const used = (taken as number) ?? 0;
  const left = Math.max(0, total - used);
  return NextResponse.json(
    { total, taken: used, left, soldOut: left <= 0, ...currentPricing() },
    { headers }
  );
}
