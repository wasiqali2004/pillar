import { moneyLinkStatus } from "@/lib/money/plaid";
import { requireUser } from "@/lib/auth/session";
import { ConnectMoneyClient } from "./ConnectMoneyClient";

export const dynamic = "force-dynamic";

/**
 * Visit /connect-money once per bank/card. Clicking "Connect" opens Plaid's
 * own hosted login screen (Link) — this app never sees the bank password,
 * only a token Plaid hands back afterward.
 */
export default async function ConnectMoneyPage() {
  await requireUser();
  const status = await moneyLinkStatus();

  if (!status.configured) {
    return (
      <main className="mx-auto max-w-xl px-6 py-16">
        <h1 className="text-xl font-semibold text-ink">Connect a bank</h1>
        <p className="mt-3 text-sm text-muted">
          Set <code className="text-teal">PLAID_CLIENT_ID</code> and{" "}
          <code className="text-teal">PLAID_SECRET</code> in{" "}
          <code className="text-teal">.env.local</code> first — see the
          comment above them in <code className="text-teal">.env.example</code>.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-xl px-6 py-16">
      <h1 className="text-xl font-semibold text-ink">Connect a bank</h1>
      <p className="mt-3 text-sm text-muted">
        Each button below opens Plaid&apos;s own login screen for that
        institution. Your bank password goes to Plaid, never to Pillar —
        this app only ever sees a read-only token afterward.
      </p>
      <ConnectMoneyClient linkedAccounts={status.accounts} />
    </main>
  );
}
