"use client";

import { useRef, useState, useTransition } from "react";
import type { MoneyData } from ".";
import { addMoneyAction, deleteMoneyAction } from "../actions";
import { Tile, Stat, Row, Empty } from "@/components/ui";
import { money, moneyCompact } from "@/lib/format";
import { useOpenFromHash } from "@/components/useOpenFromHash";

export function MoneyTile({ data }: { data: MoneyData }) {
  const [open, setOpen] = useState(false);
  const addButton = useRef<HTMLButtonElement>(null);
  useOpenFromHash("#add-money", () => setOpen(true), addButton);
  const empty = data.spentMonth === 0 && data.incomeMonth === 0;

  return (
    <Tile
      title="Money"
      sub="Personal · this month"
      right={
        <button
          ref={addButton}
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
        {/* Rows for money they don't have read as something missing, so
            business and interest only show once there's been some. */}
        {(data.businessMonth > 0 || data.businessLastMonth > 0) && (
          <Row left="Business · store sales" right={money(data.businessMonth)} />
        )}
        {data.businessLastMonth > 0 && <Row left="Business · last month" right={money(data.businessLastMonth)} muted />}
        {data.investmentsMonth > 0 && <Row left="Investments · interest" right={money(data.investmentsMonth)} />}
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

      {data.recent.length > 0 && (
        <div className="mt-5 border-t border-line-soft pt-3">
          <p className="mb-1 text-[0.65rem] uppercase tracking-wider text-faint">Latest</p>
          <ul className="flex flex-col">
            {data.recent.map((r) => (
              <RecentRow key={r.id} entry={r} />
            ))}
          </ul>
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

/**
 * One recent entry, with a way to take it back. Before this a typo stayed in
 * the month's totals for good: the entries were loaded but never shown. The
 * first tap asks, the second removes, so a stray tap can't delete anything.
 */
function RecentRow({ entry }: { entry: MoneyData["recent"][number] }) {
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();
  const label = entry.note || entry.category || (entry.direction === "in" ? "Money in" : "Spent");
  const date = new Date(`${entry.occurredOn}T12:00:00Z`).toLocaleDateString("en-CA", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

  return (
    <li className={`flex items-center gap-2 py-1 text-xs ${pending ? "opacity-40" : ""}`}>
      <span className="tnum w-12 shrink-0 text-faint">{date}</span>
      <span className="min-w-0 flex-1 truncate text-muted" title={label}>
        {label}
      </span>
      <span className={`tnum shrink-0 ${entry.direction === "in" ? "text-teal" : "text-ink"}`}>
        {entry.direction === "in" ? "+" : "−"}
        {money(entry.amountCents)}
      </span>
      {confirming ? (
        <button
          type="button"
          className="h-7 shrink-0 rounded-full px-2 text-bad hover:bg-bad/10"
          disabled={pending}
          onClick={() => start(async () => void (await deleteMoneyAction(entry.id)))}
          onBlur={() => setConfirming(false)}
        >
          Remove?
        </button>
      ) : (
        <button
          type="button"
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-sm text-faint hover:bg-bad/10 hover:text-bad"
          aria-label={`Remove ${label}, ${money(entry.amountCents)}`}
          title="Remove"
          onClick={() => setConfirming(true)}
        >
          ×
        </button>
      )}
    </li>
  );
}

/** Suggestions only; anything typed is kept as written. */
const SPEND_CATEGORIES = [
  "Groceries", "Eating out", "Coffee", "Transport", "Gas", "Rent", "Bills", "Shopping",
  "Health", "Gym", "Subscriptions", "Gifts", "Charity", "Travel", "Education", "Other",
];

function AddForm({ onDone }: { onDone: () => void }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [direction, setDirection] = useState<"in" | "out">("out");
  // Money in is either pay or a refund, and they count differently: pay is
  // income, a refund takes spending back down. A free-text category here
  // made "Salary" count as a refund, so it's a choice instead.
  const [inKind, setInKind] = useState<"Income" | "Refund">("Income");

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
          const r = await addMoneyAction({
            // Round at the boundary — cents are the only representation stored.
            amountCents: Math.round(dollars * 100),
            direction,
            category: direction === "in" ? inKind : String(fd.get("category") ?? "").trim() || null,
            note: null,
          });
          if (!r.ok) {
            setErr(r.error ?? "That didn't save. Try again.");
            return;
          }
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
        {direction === "out" ? (
          <>
            <input
              name="category"
              type="text"
              placeholder="Category"
              list="pillar-spend-categories"
              maxLength={40}
              className="field"
            />
            <datalist id="pillar-spend-categories">
              {SPEND_CATEGORIES.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </>
        ) : (
          <div className="flex flex-1 gap-1.5" role="group" aria-label="What kind of money in">
            {(["Income", "Refund"] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setInKind(k)}
                aria-pressed={inKind === k}
                className={`pill flex-1 justify-center text-xs ${inKind === k ? "pill-selected" : ""}`}
              >
                {k === "Income" ? "Pay / income" : "Refund"}
              </button>
            ))}
          </div>
        )}
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
