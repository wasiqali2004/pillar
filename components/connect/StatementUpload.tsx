"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { parseStatement, type Parsed } from "@/lib/money/statement";
import { importStatementAction } from "@/lib/money/import-actions";

/**
 * `card`: credit card exports count a purchase as positive, so these start
 * flipped. `where`: the hint for finding the download. Menus move, so these
 * name what to look for rather than promise an exact path.
 */
const BANKS: { name: string; card?: boolean; where?: string }[] = [
  { name: "TD", where: "On EasyWeb, open the account and use Download above the transactions. Pick Spreadsheet (CSV)." },
  { name: "RBC", where: "In RBC Online Banking, choose Download Transactions and pick Comma Separated Values (.csv)." },
  { name: "Scotiabank", where: "Open the account on scotiabank.com and use Download transactions. Pick CSV." },
  { name: "BMO", where: "Open the account on bmo.com and use Download transactions. Pick CSV." },
  { name: "CIBC", where: "Open the account on cibc.com and use Download transactions. Pick Spreadsheet (CSV)." },
  { name: "National Bank", where: "Open the account on the website and look for Export or Download, then pick CSV." },
  { name: "Desjardins", where: "In AccèsD on a computer, open the account and look for Export or Download (CSV)." },
  { name: "Tangerine", where: "Open the account on tangerine.ca and use Download Transactions. Pick CSV." },
  { name: "Simplii", where: "Open the account on simplii.com and look for Download transactions. Pick CSV." },
  { name: "EQ Bank", where: "Open the account on the website and look for Download or Export (CSV)." },
  { name: "Wealthsimple", where: "Open the account, go to Activity, and look for Export or Download (CSV)." },
  { name: "KOHO", where: "In KOHO, look for Statements or Export transactions and pick CSV." },
  { name: "Neo", where: "In the Neo app or website, open Statements and look for a CSV export." },
  { name: "PC Financial", where: "Open the account on the website and look for Download transactions (CSV)." },
  { name: "Amex", card: true, where: "On americanexpress.ca, open Statements & Activity and use Download. Pick CSV." },
  { name: "Capital One", card: true, where: "Open the card on the website and look for Download transactions (CSV)." },
  { name: "Rogers Bank", card: true, where: "Open the card on the website and look for Download or Export (CSV)." },
  { name: "Triangle (Canadian Tire)", card: true, where: "Open the card on the website and look for Download transactions (CSV)." },
  { name: "Other" },
];

const dollars = (c: number) => `$${(c / 100).toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function StatementUpload() {
  const router = useRouter();
  const [bank, setBank] = useState("TD");
  const [other, setOther] = useState("");
  const [text, setText] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [invert, setInvert] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const account = bank === "Other" ? other.trim() : bank;

  let parsed: Parsed | null = null;
  let parseError: string | null = null;
  if (text !== null) {
    try {
      parsed = parseStatement(text, invert);
    } catch (e) {
      parseError = e instanceof Error ? e.message : String(e);
    }
  }

  const out = parsed?.rows.filter((r) => r.direction === "out") ?? [];
  const inn = parsed?.rows.filter((r) => r.direction === "in") ?? [];
  const range = parsed
    ? [parsed.rows.reduce((a, r) => (r.occurredOn < a ? r.occurredOn : a), "9999"), parsed.rows.reduce((a, r) => (r.occurredOn > a ? r.occurredOn : a), "")]
    : null;

  function pickBank(name: string) {
    setBank(name);
    setInvert(Boolean(BANKS.find((b) => b.name === name)?.card));
  }

  async function onFile(f: File | undefined) {
    setError(null);
    setDone(null);
    if (!f) return;
    if (f.size > 5_000_000) {
      setError("That file is over 5 MB. Download a shorter date range.");
      return;
    }
    setFileName(f.name);
    setText(await f.text());
  }

  function save() {
    if (!parsed) return;
    setError(null);
    start(async () => {
      const r = await importStatementAction(account, parsed!.rows);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setDone(
        `Added ${r.inserted} transaction${r.inserted === 1 ? "" : "s"} from ${account}` +
          (r.skipped ? `, skipped ${r.skipped} already added.` : "."),
      );
      setText(null);
      setFileName(null);
      router.refresh();
    });
  }

  return (
    <div className="mt-4 flex flex-col gap-4">
      <div>
        <p className="text-xs font-semibold text-muted">1. Which bank or card?</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {BANKS.map((b) => (
            <button
              key={b.name}
              type="button"
              onClick={() => pickBank(b.name)}
              className={`cx-chip ${bank === b.name ? "is-on" : ""}`}
              aria-pressed={bank === b.name}
            >
              {b.name}
            </button>
          ))}
        </div>
        {bank === "Other" && (
          <input
            className="cx-input mt-2 max-w-xs"
            placeholder="e.g. Meridian, Coast Capital, a Visa card"
            value={other}
            maxLength={60}
            onChange={(e) => setOther(e.target.value)}
          />
        )}
      </div>

      <div>
        <p className="text-xs font-semibold text-muted">2. Download your transactions as CSV, then choose the file</p>
        <p className="mt-1 text-xs text-faint">
          {BANKS.find((b) => b.name === bank)?.where ?? (
            <>
              On your bank&apos;s website, open the account, find <b>Download</b> or <b>Export transactions</b>, and pick CSV
              (sometimes called Spreadsheet or Excel).
            </>
          )}{" "}
          Use a computer if you can: most bank apps can&apos;t export. The file stays on your device; only the transactions
          are saved.
        </p>
        <label className="pill mt-2 inline-flex cursor-pointer">
          <input type="file" accept=".csv,.txt,text/csv" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
          {fileName ? `↻ ${fileName}` : "Choose CSV file"}
        </label>
      </div>

      {parseError && <p className="text-sm text-bad">{parseError}</p>}

      {parsed && range && (
        <div className="rounded-[14px] border border-line-soft p-4">
          <p className="text-xs font-semibold text-muted">3. Check it looks right</p>
          <p className="mt-2 text-sm">
            <b>{parsed.rows.length}</b> transactions, {range[0]} to {range[1]}
          </p>
          <div className="mt-2 flex flex-wrap gap-4 text-sm">
            <span>
              Money out <b className="text-bad">{dollars(out.reduce((n, r) => n + r.amountCents, 0))}</b> ({out.length})
            </span>
            <span>
              Money in <b className="text-teal">{dollars(inn.reduce((n, r) => n + r.amountCents, 0))}</b> ({inn.length})
            </span>
          </div>
          <ul className="mt-3 flex flex-col gap-1 font-mono text-[0.72rem] text-muted">
            {parsed.rows.slice(0, 4).map((r, i) => (
              <li key={i} className="flex justify-between gap-3">
                <span className="truncate">
                  {r.occurredOn} · {r.note ?? "No description"}
                </span>
                <span className={r.direction === "out" ? "text-bad" : "text-teal"}>
                  {r.direction === "out" ? "−" : "+"}
                  {dollars(r.amountCents)}
                </span>
              </li>
            ))}
          </ul>
          <label className="mt-3 flex items-center gap-2 text-xs text-muted">
            <input type="checkbox" checked={invert} onChange={(e) => setInvert(e.target.checked)} />
            Purchases showing as money in? Flip in and out.
          </label>
          <button type="button" className="ob-next mt-4" onClick={save} disabled={pending || !account}>
            {pending ? "Adding…" : `Add ${parsed.rows.length} transactions`}
          </button>
        </div>
      )}

      {error && <p className="text-sm text-bad">{error}</p>}
      {done && <p className="text-sm text-teal">{done}</p>}
    </div>
  );
}
