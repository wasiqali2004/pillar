/**
 * Imports a bank/card/broker transaction CSV into money_entries.
 *
 * None of Amex Canada, TD or Wealthsimple offer a personal API to pull from,
 * so the supported path is their own CSV export. Their formats differ in ways
 * that silently corrupt an import if ignored, which is what `--source` exists
 * to handle:
 *
 *   amex         Positive Amount means a CHARGE, the opposite of a bank
 *                account. Without the flip, every purchase imports as income.
 *   td           The export has NO header row at all — it starts on the first
 *                transaction, as Date,Description,Debit,Credit,Balance. Header
 *                detection would silently eat that first row.
 *   wealthsimple Ordinary negative-is-outflow amounts; mostly needs the label.
 *
 * With no --source the columns are detected from the header row against
 * variants seen across Canadian exports. Either way a preview of what was
 * detected and how rows parsed is printed BEFORE anything is written, because
 * a reversed sign convention turns spending into income and is far easier to
 * catch by eye once than to debug later in the dashboard.
 *
 * Usage:
 *   npm run import:money -- <csv> --source=amex|td|wealthsimple [--commit]
 *   npm run import:money -- <csv> [--account=Name] [--invert] [--category=X]
 *
 * Without --commit this only prints a preview and writes nothing. Re-running
 * the same file (or one with overlapping dates) is safe: each row is
 * fingerprinted from (account, date, amount, direction, description) and the
 * DB has a unique index on it, so already-imported rows are skipped rather
 * than double-counted. The account is part of that hash on purpose — the same
 * coffee on the same day on two different cards is two real transactions.
 */
import { ownerDbUrl } from "./lib/owner-db.mts";
import { createClient } from "@libsql/client";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const path = args.find((a) => !a.startsWith("--"));
const commit = args.includes("--commit");
const categoryArg = args.find((a) => a.startsWith("--category="))?.slice(11);
const sourceArg = args.find((a) => a.startsWith("--source="))?.slice(9)?.toLowerCase();
const accountArg = args.find((a) => a.startsWith("--account="))?.slice(10);

/**
 * Per-source quirks. `headerless` and `invert` are the two that cause silent
 * data corruption; everything else is just a nicer default.
 */
const PRESETS = {
  amex: {
    account: "Amex",
    /** Positive = charge on a card statement. */
    invert: true,
    headerless: false,
    columns: null,
  },
  td: {
    account: "TD",
    invert: false,
    /** TD's download begins on row 1 with a transaction, not a header. */
    headerless: true,
    columns: ["date", "description", "debit", "credit", "balance"],
  },
  wealthsimple: {
    account: "Wealthsimple",
    invert: false,
    headerless: false,
    columns: null,
  },
} as const;

if (sourceArg && !(sourceArg in PRESETS)) {
  console.error(
    `Unknown --source=${sourceArg}. Expected one of: ${Object.keys(PRESETS).join(", ")}`,
  );
  process.exit(1);
}

const preset = sourceArg ? PRESETS[sourceArg as keyof typeof PRESETS] : null;
// An explicit --invert still wins, for an export that doesn't match its preset.
const invert = args.includes("--invert") || (preset?.invert ?? false);
const account = accountArg ?? preset?.account ?? null;

if (!path) {
  console.error(
    "Usage: npm run import:money -- <csv> [--source=amex|td|wealthsimple] [--account=Name] [--commit] [--invert] [--category=Name]",
  );
  process.exit(1);
}

/* ── minimal CSV parsing: handles quoted fields, embedded commas, "" escapes ── */

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
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((f) => f !== "")) rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/* ── column detection ── */

const DATE_NAMES = ["date", "transaction date", "posted date", "value date", "occurred on"];
const AMOUNT_NAMES = ["amount", "transaction amount", "value"];
const DEBIT_NAMES = ["debit", "withdrawal", "money out", "out"];
const CREDIT_NAMES = ["credit", "deposit", "money in", "in"];
const DESC_NAMES = ["description", "payee", "merchant", "memo", "details", "transaction", "name"];
const CATEGORY_NAMES = ["category", "type"];

function findCol(headers: string[], names: string[]): number {
  const norm = headers.map((h) => h.trim().toLowerCase());
  for (const name of names) {
    const i = norm.indexOf(name);
    if (i !== -1) return i;
  }
  return -1;
}

/** Accepts YYYY-MM-DD, MM/DD/YYYY, DD/MM/YYYY (ambiguous cases favour MM/DD/YYYY, the Wealthsimple/EQ convention). */
function parseDate(raw: string): string | null {
  const s = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const [, a, b, y] = m;
    const mm = Number(a) > 12 ? b : a;
    const dd = Number(a) > 12 ? a : b;
    return `${y}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  }
  return null;
}

/** "$1,234.56", "(12.00)", "-12.00" — the shapes real bank exports use for money. */
function parseAmountCents(raw: string): number | null {
  let s = raw.trim().replace(/[$,]/g, "");
  if (!s) return null;
  let negative = false;
  if (s.startsWith("(") && s.endsWith(")")) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (s.startsWith("-")) {
    negative = true;
    s = s.slice(1);
  }
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100) * (negative ? -1 : 1);
}

type ParsedRow = {
  occurredOn: string;
  amountCents: number; // always positive
  direction: "in" | "out";
  note: string | null;
  category: string | null;
};

function parseFile(csvPath: string): ParsedRow[] {
  const raw = readFileSync(csvPath, "utf-8").replace(/^﻿/, ""); // strip BOM
  const rows = parseCsv(raw);
  if (rows.length === 0) throw new Error("CSV is empty.");

  // A headerless export (TD) has no row to detect from, so the preset supplies
  // the column names and every row — including the first — is data.
  const headerless = preset?.headerless ?? false;
  if (headerless && !preset?.columns) {
    throw new Error("Headerless preset is missing its column list.");
  }
  const headers = headerless ? [...preset!.columns!] : rows[0];
  const dataRows = headerless ? rows : rows.slice(1);

  if (dataRows.length === 0) throw new Error("CSV has no data rows.");

  if (headerless) {
    console.log(
      `Headerless ${sourceArg} export — assuming columns: ${headers.join(", ")}\n`,
    );
  }
  const dateCol = findCol(headers, DATE_NAMES);
  const amountCol = findCol(headers, AMOUNT_NAMES);
  const debitCol = findCol(headers, DEBIT_NAMES);
  const creditCol = findCol(headers, CREDIT_NAMES);
  const descCol = findCol(headers, DESC_NAMES);
  const categoryCol = findCol(headers, CATEGORY_NAMES);

  if (dateCol === -1) {
    throw new Error(
      `No date column found. Headers were: ${headers.join(", ")}`,
    );
  }
  if (amountCol === -1 && debitCol === -1 && creditCol === -1) {
    throw new Error(
      `No amount/debit/credit column found. Headers were: ${headers.join(", ")}`,
    );
  }

  console.log("Detected columns:");
  console.log(`  date:     "${headers[dateCol]}"`);
  if (amountCol !== -1) console.log(`  amount:   "${headers[amountCol]}"`);
  if (debitCol !== -1) console.log(`  debit:    "${headers[debitCol]}"`);
  if (creditCol !== -1) console.log(`  credit:   "${headers[creditCol]}"`);
  if (descCol !== -1) console.log(`  note:     "${headers[descCol]}"`);
  if (categoryCol !== -1) console.log(`  category: "${headers[categoryCol]}"`);
  console.log("");

  const out: ParsedRow[] = [];
  for (const cells of dataRows) {
    const occurredOn = parseDate(cells[dateCol] ?? "");
    if (!occurredOn) continue;

    let direction: "in" | "out";
    let amountCents: number;

    if (amountCol !== -1) {
      const cents = parseAmountCents(cells[amountCol] ?? "");
      if (cents == null || cents === 0) continue;
      direction = cents < 0 ? "out" : "in";
      amountCents = Math.abs(cents);
    } else {
      const debit = debitCol !== -1 ? parseAmountCents(cells[debitCol] ?? "") : null;
      const credit = creditCol !== -1 ? parseAmountCents(cells[creditCol] ?? "") : null;
      if (debit) {
        direction = "out";
        amountCents = Math.abs(debit);
      } else if (credit) {
        direction = "in";
        amountCents = Math.abs(credit);
      } else {
        continue;
      }
    }

    if (invert) direction = direction === "out" ? "in" : "out";

    out.push({
      occurredOn,
      amountCents,
      direction,
      note: descCol !== -1 ? (cells[descCol] ?? "").trim() || null : null,
      category:
        categoryArg ?? (categoryCol !== -1 ? (cells[categoryCol] ?? "").trim() || null : null),
    });
  }
  return out;
}

/**
 * Account leads the hash so the same transaction on two cards stays two rows.
 * Without it, importing Amex after TD would silently drop matching amounts.
 */
function fingerprint(r: ParsedRow): string {
  return createHash("sha256")
    .update(
      `${account ?? ""}|${r.occurredOn}|${r.amountCents}|${r.direction}|${r.note ?? ""}`,
    )
    .digest("hex")
    .slice(0, 32);
}

/* ── run ── */

const parsed = parseFile(path);
if (parsed.length === 0) {
  console.error("✗ Parsed 0 usable rows. Check the column detection above against your file.");
  process.exit(1);
}

const spent = parsed.filter((r) => r.direction === "out");
const received = parsed.filter((r) => r.direction === "in");
const spentTotal = spent.reduce((n, r) => n + r.amountCents, 0);
const receivedTotal = received.reduce((n, r) => n + r.amountCents, 0);

console.log(
  `Parsed ${parsed.length} rows: ${spent.length} out, ${received.length} in.` +
    `${account ? `  account: ${account}` : ""}${invert ? "  (signs flipped)" : ""}`,
);
console.log(`  total out: $${(spentTotal / 100).toFixed(2)}`);
console.log(`  total in:  $${(receivedTotal / 100).toFixed(2)}`);
console.log("");
console.log("Sample (first 5):");
for (const r of parsed.slice(0, 5)) {
  const sign = r.direction === "out" ? "-" : "+";
  console.log(
    `  ${r.occurredOn}  ${sign}$${(r.amountCents / 100).toFixed(2)}  ${r.note ?? ""}`,
  );
}
console.log("");

if (!commit) {
  console.log(
    "Dry run only — nothing written. If the sample above looks right, re-run with --commit.\n" +
      "If in/out look swapped, re-run with --invert.",
  );
  process.exit(0);
}

const client = createClient({
  url: await ownerDbUrl(),
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

let inserted = 0;
for (const r of parsed) {
  const fp = fingerprint(r);
  const res = await client.execute({
    // created_at has no DB-level default — that's a drizzle $defaultFn that
    // only fires through the ORM's own insert builder, not raw SQL.
    sql: `INSERT INTO money_entries
            (amount_cents, direction, category, occurred_on, note, account, source, import_fingerprint, created_at)
          VALUES (?, ?, ?, ?, ?, ?, 'csv', ?, ?)
          ON CONFLICT(import_fingerprint) DO NOTHING`,
    args: [
      r.amountCents,
      r.direction,
      r.category,
      r.occurredOn,
      r.note,
      account,
      fp,
      new Date().toISOString(),
    ],
  });
  if (res.rowsAffected > 0) inserted++;
}

console.log(
  `✓ inserted ${inserted} new row${inserted === 1 ? "" : "s"}, skipped ${parsed.length - inserted} already-imported`,
);
client.close();
