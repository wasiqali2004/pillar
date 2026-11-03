import { bankSyncAllowed } from "@/lib/dashboard/catalog";
import { getLayout, getPlan } from "@/lib/dashboard/prefs";
import { listConnections } from "@/lib/connections/vault";
import { moneyLinkStatus } from "@/lib/money/plaid";
import { healthStatus } from "@/lib/health/google-health";
import { hevyConfigured } from "@/lib/training/hevy";
import { shopifyConfigured } from "@/lib/business/shopify";
import { getUnlinkNotice } from "@/lib/activity";
import { ConnectHub } from "@/components/connect/ConnectHub";
import { sourceHealth } from "@/lib/connections/freshness";
import { requireUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export const metadata = { title: "Connections" };

/**
 * Where the user links their own apps: banks through Plaid, Hevy, and their
 * sales apps. Reached right after setup (?welcome=1) and from the dashboard.
 * Only labels and dates reach the browser; the keys stay on the server.
 */
export default async function ConnectPage({ searchParams }: { searchParams: Promise<{ welcome?: string; health?: string }> }) {
  const user = await requireUser();
  const [{ welcome, health: healthResult }, layout, plan, connections, bank, health, hevy, shopify, unlinkNotice, freshness] = await Promise.all([
    searchParams,
    getLayout(),
    getPlan(),
    listConnections(),
    moneyLinkStatus(),
    healthStatus(),
    hevyConfigured(),
    shopifyConfigured(),
    getUnlinkNotice(),
    sourceHealth(),
  ]);
  const saved = new Set(connections.map((c) => c.provider));

  return (
    <ConnectHub
      welcome={welcome === "1"}
      plan={plan}
      bankSync={bankSyncAllowed(plan, user.isOwner)}
      unlinkNotice={unlinkNotice}
      onLayout={(layout ?? []).map((i) => i.id)}
      connections={connections}
      // Connected through .env.local on a self-hosted install: shown as connected, managed there.
      serverManaged={{ hevy: hevy && !saved.has("hevy"), shopify: shopify && !saved.has("shopify") }}
      bank={{ configured: bank.configured, accounts: bank.accounts }}
      health={{ configured: health.configured, connected: health.connected, expired: health.expired }}
      isOwner={user.isOwner}
      healthResult={healthResult ?? null}
      freshness={freshness}
    />
  );
}
