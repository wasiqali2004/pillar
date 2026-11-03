import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { auditLog, holdings } from "@/lib/db/schema";

export type HoldingInput = { symbol: string; shares: number; totalCost: number };

/**
 * One row per symbol, so adding a symbol you already hold replaces it (type
 * the new totals) rather than creating a duplicate. Amounts arrive in dollars
 * from the form and are stored as integer cents, like everywhere else.
 */
export async function saveHolding(input: HoldingInput): Promise<{ ok: true } | { ok: false; error: string }> {
  const symbol = String(input.symbol ?? "").trim().toUpperCase();
  if (!/^[A-Z0-9.\-=^]{1,14}$/.test(symbol)) {
    return { ok: false, error: "Enter a ticker like VFV.TO, AAPL or BTC-USD." };
  }
  const shares = Number(input.shares);
  if (!Number.isFinite(shares) || shares <= 0 || shares > 1e9) {
    return { ok: false, error: "Shares must be more than zero." };
  }
  const totalCost = Number(input.totalCost);
  if (!Number.isFinite(totalCost) || totalCost < 0 || totalCost > 1e10) {
    return { ok: false, error: "Enter what you paid in total, in CAD (0 if you're not sure)." };
  }
  const costBasisCents = Math.round(totalCost * 100);

  await db
    .insert(holdings)
    .values({ symbol, shares, costBasisCents })
    .onConflictDoUpdate({ target: holdings.symbol, set: { shares, costBasisCents } });
  await db.insert(auditLog).values({
    actor: "user",
    action: "portfolio.save_holding",
    tableName: "holdings",
    payload: { symbol, shares, costBasisCents },
  });
  return { ok: true };
}

export async function removeHolding(symbol: string): Promise<void> {
  await db.delete(holdings).where(eq(holdings.symbol, symbol));
  await db.insert(auditLog).values({
    actor: "user",
    action: "portfolio.remove_holding",
    tableName: "holdings",
    payload: { symbol },
  });
}
