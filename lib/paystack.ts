const PAYSTACK_BASE = "https://api.paystack.co";

function secret(): string {
  const k = process.env.PAYSTACK_SECRET_KEY;
  if (!k) throw new Error("PAYSTACK_SECRET_KEY not set");
  return k;
}

// Initialise a transaction with a SERVER-LOCKED amount. Returns an
// access_code (for the on-page inline popup) and an authorization_url
// (redirect fallback).
export async function initializeTransaction(params: {
  email: string;
  amountKobo: number;
  reference: string;
  metadata: Record<string, unknown>;
  callbackUrl?: string;
}) {
  const res = await fetch(`${PAYSTACK_BASE}/transaction/initialize`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: params.email,
      amount: params.amountKobo,
      reference: params.reference,
      currency: "NGN",
      metadata: params.metadata,
      callback_url: params.callbackUrl,
    }),
  });
  const json = await res.json();
  if (!json.status) throw new Error(json.message || "Paystack initialize failed");
  return json.data as {
    authorization_url: string;
    access_code: string;
    reference: string;
  };
}

export async function verifyTransaction(reference: string) {
  const res = await fetch(
    `${PAYSTACK_BASE}/transaction/verify/${encodeURIComponent(reference)}`,
    { headers: { Authorization: `Bearer ${secret()}` } }
  );
  const json = await res.json();
  if (!json.status) throw new Error(json.message || "Paystack verify failed");
  return json.data as { status: string; amount: number; reference: string };
}
