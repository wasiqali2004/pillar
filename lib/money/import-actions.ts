"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { auditLog, moneyEntries } from "@/lib/db/schema";
import { MAX_ROWS, type StatementRow } from "./statement";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Saves the rows a statement upload parsed in the browser. Each row is
 * fingerprinted from (account, date, amount, direction, description), and
 * the table has a unique index on it, so uploading an overlapping statement
 * next month skips what's already there instead of double-counting. The
 * account leads the hash: the same coffee on two cards is two transactions.
 */
export async function importStatementAction(
  account: string,
  rows: StatementRow[],
): Promise<{ ok: true; inserted: number; skipped: number } | { ok: false; error: string }> {
  const name = account.trim().slice(0, 60);
  if (!name) return { ok: false, error: "Say which bank or card this is." };
  if (!Array.isArray(rows) || rows.length === 0) return { ok: false, error: "No transactions to import." };
  if (rows.length > MAX_ROWS) return { ok: false, error: `Upload ${MAX_ROWS} transactions or fewer at a time.` };

  const clean = rows.filter(
    (r) =>
      typeof r?.occurredOn === "string" &&
      DATE.test(r.occurredOn) &&
      Number.isInteger(r.amountCents) &&
      r.amountCents > 0 &&
      r.amountCents < 100_000_000_00 &&
      (r.direction === "in" || r.direction === "out"),
  );
  if (clean.length === 0) return { ok: false, error: "None of those transactions looked valid." };

  let inserted = 0;
  for (const r of clean) {
    const note = typeof r.note === "string" ? r.note.slice(0, 200) || null : null;
    const fp = createHash("sha256")
      .update(`${name}|${r.occurredOn}|${r.amountCents}|${r.direction}|${note ?? ""}`)
      .digest("hex")
      .slice(0, 32);
    const res = await db
      .insert(moneyEntries)
      .values({
        amountCents: r.amountCents,
        direction: r.direction,
        occurredOn: r.occurredOn,
        note,
        account: name,
        source: "csv",
        importFingerprint: fp,
      })
      .onConflictDoNothing({ target: moneyEntries.importFingerprint })
      .returning({ id: moneyEntries.id });
    inserted += res.length;
  }

  await db.insert(auditLog).values({
    actor: "user",
    action: "money.import_statement",
    tableName: "money_entries",
    payload: { account: name, rows: clean.length, inserted },
  });
  revalidatePath("/app");
  return { ok: true, inserted, skipped: clean.length - inserted };
}
