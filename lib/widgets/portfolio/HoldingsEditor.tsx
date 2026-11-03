"use client";

import { useState, useTransition } from "react";
import { removeHoldingAction, saveHoldingAction } from "../actions";
import { money } from "@/lib/format";
import type { PositionRow } from ".";

/**
 * Add what you own by hand: a ticker, how many shares, and what you paid in
 * total (CAD). Prices come from the market feed; nothing here needs a bank.
 * Re-adding a ticker replaces it, which is also how you update a position.
 */
export function HoldingsEditor({ rows }: { rows: PositionRow[] }) {
  const [symbol, setSymbol] = useState("");
  const [shares, setShares] = useState("");
  const [cost, setCost] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit() {
    setError(null);
    start(async () => {
      const r = await saveHoldingAction({
        symbol,
        shares: Number(shares),
        totalCost: cost.trim() === "" ? 0 : Number(cost.replace(/[$,]/g, "")),
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setSymbol("");
      setShares("");
      setCost("");
    });
  }

  return (
    <div className="mt-2">
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <label className="flex flex-col gap-1">
          <span className="text-[0.62rem] uppercase tracking-wider text-faint">Ticker</span>
          <input className="cx-input w-28 font-mono" placeholder="VFV.TO" value={symbol} maxLength={14} onChange={(e) => setSymbol(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[0.62rem] uppercase tracking-wider text-faint">Shares</span>
          <input className="cx-input w-24" inputMode="decimal" placeholder="12.5" value={shares} onChange={(e) => setShares(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[0.62rem] uppercase tracking-wider text-faint">Paid in total (CAD)</span>
          <input className="cx-input w-36" inputMode="decimal" placeholder="1,250.00" value={cost} onChange={(e) => setCost(e.target.value)} />
        </label>
        <button type="submit" className="ob-next" disabled={pending || !symbol.trim() || !shares.trim()}>
          {pending ? "Saving…" : "Add holding"}
        </button>
      </form>
      {error && <p className="mt-2 text-sm text-bad">{error}</p>}

      {rows.length > 0 && (
        <ul className="mt-4 flex flex-wrap gap-2">
          {rows.map((r) => (
            <li key={r.symbol} className="cx-chip flex items-center gap-2">
              <span className="font-mono">{r.symbol}</span>
              <span className="text-faint">
                {r.shares} · {r.valueCents != null ? money(r.valueCents) : "unpriced"}
              </span>
              <button
                type="button"
                aria-label={`Remove ${r.symbol}`}
                className="text-faint hover:text-bad"
                disabled={pending}
                onClick={() => start(() => removeHoldingAction(r.symbol))}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
