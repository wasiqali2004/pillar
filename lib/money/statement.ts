/**
 * Reads a bank or card's transaction export (CSV) into money rows. Runs in
 * the browser, so the file itself is never uploaded: only the parsed
 * transactions go to the server, after the user has seen a preview.
 *
 * Two quirks that silently corrupt an import if ignored:
 * - Credit card exports (Amex and others) use a positive amount for a
 *   CHARGE, the opposite of a bank account. `invert` flips them.
 * - TD's export has no header row; it starts on the first transaction as
 *   Date, Description, Debit, Credit, Balance. Detected by the first cell
 *   being a date.
 */

export type StatementRow = {
  occurredOn: string;
  /** Always positive. */
  amountCents: number;
  direction: "in" | "out";
  note: string | null;
};

export type Parsed = {
  rows: StatementRow[];
  /** The column names used, for the preview. */
  columns: { date: string; amount?: string; debit?: string; credit?: string; note?: string };
  headerless: boolean;
};

export const MAX_ROWS = 5000;

/** National Bank and some French-language exports use ";" between fields. */
function sniffDelimiter(text: string): "," | ";" {
  const head = text.split(/\r?\n/, 5).join("\n");
  return (head.match(/;/g)?.length ?? 0) > (head.match(/,/g)?.length ?? 0) ? ";" : ",";
}

function parseCsv(text: string): string[][] {
  const sep = sniffDelimiter(text);
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
    else if (c === sep) {
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
    if (row.some((f) => f !== "")) rows.push(row);
  }
  return rows;
}

const DATE_NAMES = [
  "date", "transaction date", "posted date", "posting date", "value date", "date posted", "transfer date",
  "trans. date", "transaction_date",
];
// RBC calls its amount column "CAD$"; some exports say "Amount (CAD)".
const AMOUNT_NAMES = ["amount", "transaction amount", "cad$", "amount (cad)", "amount cad", "net amount", "value"];
const DEBIT_NAMES = ["debit", "withdrawal", "withdrawals", "money out", "out", "debit amount", "withdrawal amount"];
const CREDIT_NAMES = ["credit", "deposit", "deposits", "money in", "in", "credit amount", "deposit amount"];
// Most specific first: Tangerine has Transaction (DEBIT/CREDIT), Name (the
// merchant) and an often-empty Memo, and only Name is worth showing.
const DESC_NAMES = [
  "description", "description 1", "payee", "merchant", "merchant name", "name", "details", "transaction details",
  "memo", "transaction",
];

function findCol(headers: string[], names: string[]): number {
  const norm = headers.map((h) => h.trim().toLowerCase().replace(/\s+/g, " "));
  for (const name of names) {
    const i = norm.indexOf(name);
    if (i !== -1) return i;
  }
  return -1;
}

const MONTHS: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

/** YYYY-MM-DD, YYYYMMDD (BMO), MM/DD/YYYY or DD/MM/YYYY (ambiguous ones read as MM/DD), and "05 Oct 2026". */
export function parseDate(raw: string): string | null {
  const s = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  if (/^\d{4}\/\d{2}\/\d{2}/.test(s)) return s.slice(0, 10).replace(/\//g, "-");
  const compact = s.match(/^(20\d{2})(\d{2})(\d{2})$/);
  if (compact && Number(compact[2]) >= 1 && Number(compact[2]) <= 12) return `${compact[1]}-${compact[2]}-${compact[3]}`;
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const [, a, b, y] = m;
    const mm = Number(a) > 12 ? b : a;
    const dd = Number(a) > 12 ? a : b;
    return `${y}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  }
  m = s.match(/^(\d{1,2})[ -]([A-Za-z]{3})[a-z]*\.?[ -,]+(\d{4})$/);
  if (m && MONTHS[m[2].toLowerCase()]) return `${m[3]}-${MONTHS[m[2].toLowerCase()]}-${m[1].padStart(2, "0")}`;
  return null;
}

/** "$1,234.56", "(12.00)", "-12.00": the shapes bank exports use for money. */
function parseAmountCents(raw: string): number | null {
  let t = raw.trim();
  // French-format exports write 12,50 for twelve fifty: a comma with exactly two
  // digits after it and no dot is a decimal comma, not a thousands separator.
  if (!t.includes(".") && /,\d{2}\)?$/.test(t)) t = t.replace(/[\s.]/g, "").replace(/,(\d{2}\)?)$/, ".$1");
  let s = t.replace(/[$,\s]/g, "").replace(/(CAD|USD)$/i, "");
  // A trailing minus ("45.00-") is how a few card exports mark a credit.
  if (/^\d+(\.\d+)?-$/.test(s)) s = `-${s.slice(0, -1)}`;
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

export function parseStatement(text: string, invert: boolean): Parsed {
  const all = parseCsv(text.replace(/^﻿/, ""));
  if (all.length === 0) throw new Error("That file is empty.");

  // BMO and some others put a line or two of account info above the header.
  // The header is the first row, among the first ten, naming a date column.
  const headerAt = all.slice(0, 10).findIndex((r) => findCol(r, DATE_NAMES) !== -1);
  const rows = headerAt > 0 ? all.slice(headerAt) : all;

  const headerless = headerAt === -1 && parseDate(rows[0][0] ?? "") !== null;
  // Two headerless layouts: TD and CIBC write Date, Description, Debit, Credit;
  // Scotiabank writes Date, Amount, then a filler, type and description.
  const amountSecond = headerless && /^-?\$?[\d,]+(\.\d+)?$/.test((rows[0][1] ?? "").trim());
  const headers = !headerless
    ? rows[0]
    : amountSecond
      ? ["Date", "Amount", "-", "Type", "Description", ...rows[0].slice(5).map((_, i) => `Column ${i + 6}`)]
      : ["Date", "Description", "Debit", "Credit", "Balance"];
  const data = headerless ? rows : rows.slice(1);

  const dateCol = findCol(headers, DATE_NAMES);
  const amountCol = findCol(headers, AMOUNT_NAMES);
  const debitCol = findCol(headers, DEBIT_NAMES);
  const creditCol = findCol(headers, CREDIT_NAMES);
  const descCol = findCol(headers, DESC_NAMES);

  if (dateCol === -1) throw new Error(`Couldn't find a date column. The file's columns are: ${headers.join(", ")}`);
  if (amountCol === -1 && debitCol === -1 && creditCol === -1) {
    throw new Error(`Couldn't find an amount column. The file's columns are: ${headers.join(", ")}`);
  }

  const out: StatementRow[] = [];
  for (const cells of data) {
    const occurredOn = parseDate(cells[dateCol] ?? "");
    if (!occurredOn) continue;
    let direction: "in" | "out";
    let amountCents: number;
    if (amountCol !== -1) {
      const cents = parseAmountCents(cells[amountCol] ?? "");
      if (!cents) continue;
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
      } else continue;
    }
    if (invert) direction = direction === "out" ? "in" : "out";
    out.push({ occurredOn, amountCents, direction, note: descCol !== -1 ? (cells[descCol] ?? "").trim() || null : null });
  }

  if (out.length === 0) throw new Error("Found the columns but no transactions in them. Is this the right file?");
  if (out.length > MAX_ROWS) throw new Error(`That's ${out.length} transactions; upload ${MAX_ROWS} or fewer at a time.`);

  return {
    rows: out,
    headerless,
    columns: {
      date: headers[dateCol],
      amount: amountCol !== -1 ? headers[amountCol] : undefined,
      debit: debitCol !== -1 ? headers[debitCol] : undefined,
      credit: creditCol !== -1 ? headers[creditCol] : undefined,
      note: descCol !== -1 ? headers[descCol] : undefined,
    },
  };
}
