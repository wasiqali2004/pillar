import "server-only";
import { and, gte, sql, desc } from "drizzle-orm";
import { defineWidget } from "../types";
import { MoneyTile } from "./MoneyTile";
import { db } from "@/lib/db";
import { moneyEntries, businessRevenue, auditLog } from "@/lib/db/schema";
import { loadPortfolio } from "../portfolio";
import { syncMoneyIfStale, moneyLinkStatus } from "@/lib/money/plaid";
import {
  localDate,
  startOfWeek,
  startOfMonth,
  dayOfMonth,
  daysInMonth,
} from "@/lib/date";

export type MoneyData = {
  spentWeek: number;
  spentMonth: number;
  /** Everything made this month: earnings + business + investments. */
  incomeMonth: number;
  /** Paycheques and other direct deposits from work. */
  earningsMonth: number;
  /** Store sales this month (Shopify, Square, Stripe), not the bank payouts for them. */
  businessMonth: number;
  /** Interest and dividends that actually landed. Not portfolio value. */
  investmentsMonth: number;
  /** 1-month change in portfolio value. Shown apart from income, and null
      when the price feed is unavailable. */
  stockChangeMonth: number | null;
  /** income minus spend. */
  netMonth: number;
  /** Money moved between own accounts or paid to a card, kept out of both sides. */
  excludedTransfers: number;
  /** Where this month's spend lands if the current daily rate holds. */
  projectedMonth: number;
  topCategories: { category: string; cents: number }[];
  /** This month's spend split by card/account. Empty until a CSV or Plaid sync lands. */
  byAccount: { account: string; cents: number }[];
  /** True once at least one bank is linked at /connect-money — hides the banner. */
  hasLinkedAccount: boolean;
  recent: {
    id: number;
    amountCents: number;
    direction: "in" | "out";
    category: string | null;
    note: string | null;
    occurredOn: string;
  }[];
};

const noteHas = (word: string) =>
  sql`coalesce(${moneyEntries.note}, '') like ${`%${word}%`}`;
// Moving money between accounts or paying a card isn't spending or earning. The
// card side of a payment ("PAYMENT RECEIVED") and the bank side ("BILL PYMT")
// would otherwise each count once, inflating both spend and income. The
// Equitable Life TFSA contribution is the same kind of movement — it isn't
// spent, it's the same dollars showing up as portfolio value once the
// segregated fund's statement balance is updated — so it's excluded rather
// than counted as an expense under Plaid's "General services" category.
const isTransfer = sql`(
  coalesce(${moneyEntries.category}, '') in ('Transfer in', 'Transfer out')
  or coalesce(${moneyEntries.note}, '') like '%PAYMENT RECEIVED%'
  or coalesce(${moneyEntries.note}, '') like '%BILL PYMT%'
  or ${noteHas("Equitable Life")}
)`;
// Shopify payouts are the same money as the Sabr sales counted under business.
const isShopifyPayout = noteHas("shopify");
const isInvestmentPayout = sql`(${noteHas("interest")} or ${noteHas("dividend")})`;
// Money in that isn't a paycheque-style deposit is a refund, which offsets spend.
const isEarning = sql`(${moneyEntries.direction} = 'in'
  and (${moneyEntries.category} is null or ${moneyEntries.category} = 'Income')
  and not ${isTransfer})`;

const sinceDate = (since: string) => gte(moneyEntries.occurredOn, since);

async function total(...where: ReturnType<typeof sql>[]) {
  const [r] = await db
    .select({ v: sql<number>`coalesce(sum(${moneyEntries.amountCents}), 0)` })
    .from(moneyEntries)
    .where(and(...where));
  return Number(r?.v ?? 0);
}

/** Card/bank spend net of refunds, with transfers left out. */
async function spentSince(since: string) {
  const [r] = await db
    .select({
      v: sql<number>`coalesce(sum(case when ${moneyEntries.direction} = 'out'
        then ${moneyEntries.amountCents} else -${moneyEntries.amountCents} end), 0)`,
    })
    .from(moneyEntries)
    .where(
      and(
        sinceDate(since),
        sql`not ${isTransfer}`,
        sql`not ${isEarning}`,
      ),
    );
  return Number(r?.v ?? 0);
}

export async function loadMoney(): Promise<MoneyData> {
  // Pulls new transactions from every linked bank if the last pull has gone
  // stale. Throttled and non-throwing, so the tile renders either way.
  await syncMoneyIfStale();
  const linkStatus = await moneyLinkStatus();

  const today = localDate();
  const week = startOfWeek(today);
  const month = startOfMonth(today);
  const inMonth = sinceDate(month);
  const out = sql`${moneyEntries.direction} = 'out'`;

  const [
    spentWeek,
    spentMonth,
    earningsMonth,
    interestMonth,
    businessMonth,
    excludedTransfers,
    stockChangeMonth,
    cats,
    accounts,
    recent,
  ] = await Promise.all([
    spentSince(week),
    spentSince(month),
    total(inMonth, isEarning, sql`not ${isShopifyPayout}`, sql`not ${isInvestmentPayout}`),
    total(inMonth, isEarning, isInvestmentPayout),
    db
      .select({ v: sql<number>`coalesce(sum(${businessRevenue.revenueCents}), 0)` })
      .from(businessRevenue)
      .where(gte(businessRevenue.localDate, month))
      .then((r) => Number(r[0]?.v ?? 0)),
    total(inMonth, out, isTransfer),
    // Portfolio value change over the last month, from the Portfolio widget's
    // own numbers. A dead price feed leaves this null rather than breaking the tile.
    loadPortfolio()
      .then((p) => p.periods.find((x) => x.key === "1M")?.netCents ?? null)
      .catch(() => null),
    db
      .select({
        category: sql<string>`coalesce(${moneyEntries.category}, 'Uncategorized')`,
        cents: sql<number>`sum(${moneyEntries.amountCents})`,
      })
      .from(moneyEntries)
      .where(and(out, sql`not ${isTransfer}`, inMonth))
      .groupBy(sql`1`)
      .orderBy(sql`2 desc`)
      .limit(4),
    // Manual entries have no account; they'd group under one blank row, so
    // they're excluded rather than shown as a nameless card.
    db
      .select({
        account: sql<string>`${moneyEntries.account}`,
        cents: sql<number>`sum(${moneyEntries.amountCents})`,
      })
      .from(moneyEntries)
      .where(
        and(
          out,
          sql`not ${isTransfer}`,
          inMonth,
          sql`${moneyEntries.account} is not null`,
        ),
      )
      .groupBy(sql`1`)
      .orderBy(sql`2 desc`),
    db
      .select()
      .from(moneyEntries)
      .orderBy(desc(moneyEntries.occurredOn), desc(moneyEntries.id))
      .limit(5),
  ]);

  // Money made is money that arrived: pay, sales, interest and dividends.
  // A portfolio's change in value is neither earned nor spendable — counting
  // it made "Made this month" read −$75 on a month with no income at all,
  // purely because the market dipped. It gets its own line instead.
  const investmentsMonth = interestMonth;
  const incomeMonth = earningsMonth + businessMonth + investmentsMonth;

  const elapsed = dayOfMonth(today);
  const daysTotal = daysInMonth(today);

  return {
    spentWeek,
    spentMonth,
    incomeMonth,
    earningsMonth,
    businessMonth,
    investmentsMonth,
    stockChangeMonth,
    netMonth: incomeMonth - spentMonth,
    excludedTransfers,
    projectedMonth: elapsed > 0 ? Math.round((spentMonth / elapsed) * daysTotal) : 0,
    topCategories: cats.map((c) => ({
      category: c.category,
      cents: Number(c.cents),
    })),
    byAccount: accounts.map((a) => ({
      account: a.account,
      cents: Number(a.cents),
    })),
    hasLinkedAccount: linkStatus.accounts.length > 0,
    recent: recent.map((r) => ({
      id: r.id,
      amountCents: r.amountCents,
      direction: r.direction,
      category: r.category,
      note: r.note,
      occurredOn: r.occurredOn,
    })),
  };
}

export async function addMoney(
  input: {
    amountCents: number;
    direction: "in" | "out";
    category?: string | null;
    note?: string | null;
  },
  source: "ui" | "rafiq" = "ui",
) {
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
    return { ok: false, error: "Amount must be a positive number of cents." };
  }

  const [row] = await db
    .insert(moneyEntries)
    .values({
      amountCents: input.amountCents,
      direction: input.direction,
      category: input.category ?? null,
      note: input.note ?? null,
      occurredOn: localDate(),
      source: source === "rafiq" ? "rafiq" : "ui",
    })
    .returning({ id: moneyEntries.id });

  await db.insert(auditLog).values({
    actor: source === "rafiq" ? "rafiq" : "user",
    action: "money.add",
    tableName: "money_entries",
    rowId: row.id,
    payload: input,
  });

  return { ok: true, id: row.id };
}

export async function moneySummary() {
  const d = await loadMoney();
  return {
    spent_this_week_cents: d.spentWeek,
    spent_this_month_cents: d.spentMonth,
    income_this_month_cents: d.incomeMonth,
    earnings_this_month_cents: d.earningsMonth,
    business_this_month_cents: d.businessMonth,
    investments_this_month_cents: d.investmentsMonth,
    net_this_month_cents: d.netMonth,
    projected_month_spend_cents: d.projectedMonth,
    top_categories: d.topCategories,
  };
}

export const moneyWidget = defineWidget<MoneyData>({
  id: "money",
  title: "Money",
  size: "sm",
  refresh: "live",
  load: loadMoney,
  Tile: MoneyTile,
  tools: [
    {
      name: "get_money_summary",
      description:
        "Personal spending this week and month (transfers and card payments excluded), income this month split into earnings, business (Sabr sales) and investments (interest plus 1-month portfolio change), net income, projected month-end spend, and top categories. Synced automatically from linked banks via Plaid where connected. All amounts in cents.",
      input_schema: { type: "object", properties: {} },
      handler: moneySummary,
    },
    {
      name: "add_money_entry",
      description:
        "Record money in or out. Amount must be in whole cents (e.g. $12.50 is 1250).",
      input_schema: {
        type: "object",
        properties: {
          amountCents: { type: "number" },
          direction: { type: "string", enum: ["in", "out"] },
          category: { type: "string" },
          note: { type: "string" },
        },
        required: ["amountCents", "direction"],
      },
      write: true,
      handler: (input: Parameters<typeof addMoney>[0]) =>
        addMoney(input, "rafiq"),
    },
  ],
});
