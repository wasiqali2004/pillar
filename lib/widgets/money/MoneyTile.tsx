"use client";

import { useState, useTransition } from "react";
import type { MoneyData } from ".";
import { addMoneyAction } from "../actions";
import { Tile, Stat, Row, Empty } from "@/components/ui";
import { money, moneyCompact } from "@/lib/format";

export function MoneyTile({ data }: { data: MoneyData }) {
  const [open, setOpen] = useState(false);
  const empty = data.spentMonth === 0 && data.incomeMonth === 0;

  return (
    <Tile
      title="Money"
      sub="Personal · this month"
      right={
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="pill"
          aria-expanded={open}
        >
          {open ? "Close" : "Add"}
        </button>
      }
    >
      {open && <AddForm onDone={() => setOpen(false)} />}

      {!data.hasLinkedAccount && (
        // Plain navigation — /connect-money opens Plaid's own hosted login.
        <a
          href="/app/connect"
          className="mt-3 block rounded-ctl border border-line bg-surface-hi/50 px-3 py-2 text-xs text-muted hover:text-ink"
        >
          Connect your bank →
        </a>
      )}

      <div className="mt-5 grid grid-cols-2 gap-4">
        <Stat value={money(data.spentWeek)} label="Spent this week" />
        <Stat
          value={money(data.spentMonth)}
          label="Spent this month"
          hint={
            data.projectedMonth > 0
              ? `${moneyCompact(data.projectedMonth)} projected`
              : undefined
          }
        />
        <Stat value={money(data.incomeMonth)} label="Made this month" tone="teal" />
        <Stat
          value={money(data.netMonth, { sign: true })}
          label="Net income"
          tone={data.netMonth >= 0 ? "teal" : "bad"}
          hint={`${money(data.incomeMonth)} made − ${money(data.spentMonth)} spent`}
        />
      </div>

      <div className="mt-5 border-t border-line-soft pt-3">
        <p className="mb-1 text-[0.65rem] uppercase tracking-wider text-faint">
          Where it came from
        </p>
        <Row left="Earnings" right={money(data.earningsMonth)} />
        <Row left="Business · store sales" right={money(data.businessMonth)} />
        <Row left="Investments · interest" right={money(data.investmentsMonth)} />
        {data.stockChangeMonth != null && (
          // Below the income rows and labelled as value, not income: a
          // portfolio's change is on paper until something is sold.
          <Row
            left="Portfolio value · 1M change"
            right={money(data.stockChangeMonth, { sign: true })}
            muted
          />
        )}
      </div>

      {data.byAccount.length > 0 && (
        <div className="mt-5 border-t border-line-soft pt-3">
          <p className="mb-1 text-[0.65rem] uppercase tracking-wider text-faint">
            By account
          </p>
          {data.byAccount.map((a) => (
            <Row key={a.account} left={a.account} right={money(a.cents)} />
          ))}
        </div>
      )}

      {data.topCategories.length > 0 && (
        <div className="mt-5 border-t border-line-soft pt-3">
          <p className="mb-1 text-[0.65rem] uppercase tracking-wider text-faint">
            Top categories
          </p>
          {data.topCategories.map((c) => (
            <Row
              key={c.category}
              left={c.category}
              right={money(c.cents)}
              muted
            />
          ))}
        </div>
      )}

      {data.excludedTransfers > 0 && (
        <p className="mt-4 text-[0.65rem] leading-snug text-faint">
          Left out of both sides: {money(data.excludedTransfers)} of transfers
          and card payments. Shopify payouts are counted once, as store sales.
        </p>
      )}

      {empty && (
        <Empty>
          No entries yet. Use <strong>Add</strong> to log one by hand.
        </Empty>
      )}
    </Tile>
  );
}

function AddForm({ onDone }: { onDone: () => void }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [direction, setDirection] = useState<"in" | "out">("out");

  return (
    <form
      className="mt-4 flex flex-col gap-3 rounded-ctl border border-line bg-surface-hi/50 p-3"
      action={(fd: FormData) => {
        const raw = String(fd.get("amount") ?? "").trim();
        const dollars = Number(raw);
        if (raw === "" || !Number.isFinite(dollars) || dollars <= 0) {
          setErr("Enter an amount greater than zero.");
          return;
        }
        setErr(null);
        start(async () => {
          await addMoneyAction({
            // Round at the boundary — cents are the only representation stored.
            amountCents: Math.round(dollars * 100),
            direction,
            category: String(fd.get("category") ?? "").trim() || null,
            note: null,
          });
          onDone();
        });
      }}
    >
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setDirection("out")}
          className={`pill flex-1 justify-center ${direction === "out" ? "pill-highlight" : ""}`}
        >
          Spent
        </button>
        <button
          type="button"
          onClick={() => setDirection("in")}
          className={`pill flex-1 justify-center ${direction === "in" ? "pill-selected" : ""}`}
        >
          Received
        </button>
      </div>

      <div className="flex gap-2">
        <input
          name="amount"
          type="number"
          inputMode="decimal"
          step="0.01"
          min="0"
          placeholder="Amount"
          className="field"
          autoFocus
        />
        <input
          name="category"
          type="text"
          placeholder="Category"
          className="field"
        />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="pill pill-selected justify-center disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save"}
      </button>

      {err && (
        <p className="text-xs text-bad" role="alert">
          {err}
        </p>
      )}
    </form>
  );
}
