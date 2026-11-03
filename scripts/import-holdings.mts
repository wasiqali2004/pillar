/**
 * Upserts current ETF/stock positions into the holdings table from a small
 * CSV: symbol, shares, cost_basis (total dollars paid, not per-share) and an
 * optional label.
 *
 * Deliberately not a Wealthsimple/EQ "activity" import: neither publishes a
 * documented transaction-history CSV, and reconstructing a *current* position
 * (net shares, average cost) by replaying every historical buy/sell from an
 * unverified export format risks getting the cost basis quietly wrong. A
 * position is a snapshot, not a stream — copy the numbers you already see
 * on the Wealthsimple/EQ Bank positions page for each holding, same as the
 * VFV.TO / XEQT.TO rows already in the portfolio widget were entered.
 *
 * CSV format (header row required):
 *   symbol,shares,cost_basis,label
 *   VFV.TO,12.5,4200.00,S&P 500 ETF
 *
 * Usage:
 *   npm run import:holdings -- <path-to-csv> [--commit]
 *
 * Without --commit this only prints what would change. Re-running replaces
 * shares/cost_basis for a symbol already on file (last import wins) rather
 * than adding a duplicate row — a position is one row per symbol by design
 * (see the unique index on holdings.symbol).
 */
import { ownerDbUrl } from "./lib/owner-db.mts";
import { createClient } from "@libsql/client";
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const path = args.find((a) => !a.startsWith("--"));
const commit = args.includes("--commit");

if (!path) {
  console.error("Usage: npm run import:holdings -- <path-to-csv> [--commit]");
  process.exit(1);
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((f) => f !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

type Position = { symbol: string; shares: number; costBasisCents: number; label: string | null };

const raw = readFileSync(path, "utf-8").replace(/^﻿/, "");
const rows = parseCsv(raw);
if (rows.length < 2) {
  console.error("✗ CSV has no data rows.");
  process.exit(1);
}

const headers = rows[0].map((h) => h.trim().toLowerCase());
const symCol = headers.indexOf("symbol");
const sharesCol = headers.indexOf("shares");
const costCol = headers.findIndex((h) => h === "cost_basis" || h === "cost basis");
const labelCol = headers.indexOf("label");

if (symCol === -1 || sharesCol === -1 || costCol === -1) {
  console.error(
    `✗ Expected columns "symbol", "shares", "cost_basis". Found: ${headers.join(", ")}`,
  );
  process.exit(1);
}

const positions: Position[] = [];
for (const cells of rows.slice(1)) {
  const symbol = (cells[symCol] ?? "").trim().toUpperCase();
  const shares = Number((cells[sharesCol] ?? "").trim());
  const costBasis = Number((cells[costCol] ?? "").replace(/[$,]/g, "").trim());
  if (!symbol || !Number.isFinite(shares) || !Number.isFinite(costBasis)) continue;
  positions.push({
    symbol,
    shares,
    costBasisCents: Math.round(costBasis * 100),
    label: labelCol !== -1 ? (cells[labelCol] ?? "").trim() || null : null,
  });
}

if (positions.length === 0) {
  console.error("✗ Parsed 0 usable rows.");
  process.exit(1);
}

console.log(`Parsed ${positions.length} position(s):`);
for (const p of positions) {
  console.log(
    `  ${p.symbol.padEnd(10)} ${p.shares} sh   $${(p.costBasisCents / 100).toFixed(2)} cost basis`,
  );
}
console.log("");

if (!commit) {
  console.log("Dry run only — nothing written. Re-run with --commit to apply.");
  process.exit(0);
}

const client = createClient({
  url: await ownerDbUrl(),
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

for (const p of positions) {
  await client.execute({
    sql: `INSERT INTO holdings (symbol, label, shares, cost_basis_cents)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(symbol) DO UPDATE SET
            label = excluded.label,
            shares = excluded.shares,
            cost_basis_cents = excluded.cost_basis_cents`,
    args: [p.symbol, p.label, p.shares, p.costBasisCents],
  });
}

console.log(`✓ upserted ${positions.length} position(s)`);
client.close();
