// Server-authoritative configuration. Prices live here, never on the client,
// so a tampered request can't change what gets charged.

export const EVENT_ID = "laser-2026";
export const RESERVATION_TTL_MINUTES = 30;

// Early-bird cutoff in Lagos time (WAT, UTC+1). Before this instant the
// early-bird price applies; on/after it the late-entry price applies.
export const EARLY_BIRD_CUTOFF = new Date("2026-07-01T00:00:00+01:00");

export type Tier = {
  id: string;
  name: string;
  earlyKobo: number; // NGN * 100
  lateKobo: number;
};

// Amounts are in kobo (₦1 = 100 kobo). Matches the corrected PDF pricing.
export const TIERS: Record<string, Tier> = {
  foundation: { id: "foundation", name: "Tier I — Foundation Practitioner", earlyKobo:   465_300_000, lateKobo:   620_400_000 },
  certified:  { id: "certified",  name: "Tier II — Certified Professional", earlyKobo:   506_400_000, lateKobo:   675_200_000 },
  advanced:   { id: "advanced",   name: "Tier III — Advanced Specialist",   earlyKobo: 1_406_400_000, lateKobo: 1_875_200_000 },
  elite:      { id: "elite",      name: "Tier IV — Elite Clinician",        earlyKobo: 3_506_400_000, lateKobo: 4_675_200_000 },
};

export function isEarlyBird(now: number = Date.now()): boolean {
  return now < EARLY_BIRD_CUTOFF.getTime();
}

export function priceForTier(tierId: string) {
  const tier = TIERS[tierId];
  if (!tier) return null;
  const early = isEarlyBird();
  return { kobo: early ? tier.earlyKobo : tier.lateKobo, isEarly: early, tier };
}

// Current price list for the front-end dropdown (so the page always shows
// the right price without hardcoding it in Liquid).
export function currentPricing() {
  const early = isEarlyBird();
  return {
    isEarly: early,
    tiers: Object.values(TIERS).map((t) => {
      const kobo = early ? t.earlyKobo : t.lateKobo;
      return { id: t.id, name: t.name, kobo, naira: kobo / 100 };
    }),
  };
}

export const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
