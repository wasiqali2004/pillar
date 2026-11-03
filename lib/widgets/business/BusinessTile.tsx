import Link from "next/link";
import type { BusinessData } from ".";
import { Tile, Stat, MiniBars, Empty, Delta } from "@/components/ui";
import { money, moneyCompact } from "@/lib/format";

export function BusinessTile({ data }: { data: BusinessData }) {
  if (!data.connected) {
    return (
      <Tile title="Business revenue" sub="Not connected">
        <Empty>
          Connect Shopify, Square or your website&apos;s Stripe account and your
          sales show up here.{" "}
          <Link href="/app/connect" className="text-teal hover:underline">
            Connect a sales app →
          </Link>
        </Empty>
      </Tile>
    );
  }

  const vsLastMonth =
    data.lastMonthToDateCents > 0
      ? ((data.monthCents - data.lastMonthToDateCents) /
          data.lastMonthToDateCents) *
        100
      : null;

  return (
    <Tile
      title="Business revenue"
      sub={
        data.lastError ? (
          <span className="text-warn">Last sync failed</span>
        ) : (
          `${data.ordersMonth} orders this month`
        )
      }
      right={
        <>
          <div className="tnum grad-text text-lg font-semibold leading-none">
            {moneyCompact(data.monthCents)}
          </div>
          {vsLastMonth != null && (
            <div className="mt-1">
              <Delta value={vsLastMonth} />
            </div>
          )}
        </>
      }
    >
      <div className="mt-5 grid grid-cols-3 gap-3">
        <Stat value={money(data.todayCents)} label="Today" tone="violet" />
        <Stat value={money(data.weekCents)} label="This week" />
        <Stat
          value={money(data.monthCents)}
          label="This month"
          tone="teal"
          hint={`${moneyCompact(data.projectedMonthCents)} projected`}
        />
      </div>

      <div className="mt-6">
        <div className="mb-2 flex items-baseline justify-between">
          <span className="text-[0.7rem] uppercase tracking-wider text-faint">
            Daily
          </span>
          <span className="font-mono text-[0.65rem] text-faint">14 days</span>
        </div>
        <MiniBars values={data.daily14} />
      </div>

      {(data.lastSyncAt || !data.autoSync) && (
        <p
          className="mt-3 border-t border-line-soft pt-2.5 font-mono text-[0.62rem] text-faint"
          title={data.lastError ?? undefined}
        >
          {data.lastSyncAt &&
            `Synced ${new Date(data.lastSyncAt).toLocaleString("en-CA", {
              timeZone: "America/Toronto",
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}`}
          {data.autoSync ? (
            " · updates every 30 min"
          ) : (
            <span className="text-warn">
              {data.lastSyncAt ? " · " : ""}auto-sync off. Reconnect on the Connections page
            </span>
          )}
        </p>
      )}
    </Tile>
  );
}
