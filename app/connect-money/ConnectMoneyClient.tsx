"use client";

import { useState, useTransition } from "react";
import Script from "next/script";
import { MAX_LINKED_BANKS } from "@/lib/dashboard/catalog";

declare global {
  interface Window {
    Plaid?: {
      create: (config: {
        token: string;
        onSuccess: (
          publicToken: string,
          metadata: { institution: { name: string } | null },
        ) => void;
        onExit?: () => void;
      }) => { open: () => void };
    };
  }
}

type LinkedAccount = { itemId: string; institutionName: string | null };

export function ConnectMoneyClient({
  linkedAccounts,
}: {
  linkedAccounts: LinkedAccount[];
}) {
  const [scriptReady, setScriptReady] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // Server Components can't hold client state across a redirect-free flow,
  // so the just-linked list starts from props and grows in place.
  const [accounts, setAccounts] = useState(linkedAccounts);

  function connect() {
    setStatus(null);
    start(async () => {
      try {
        const res = await fetch("/api/plaid/link-token", { method: "POST" });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Could not start Link.");

        const handler = window.Plaid!.create({
          token: json.linkToken,
          onSuccess: (publicToken, metadata) => {
            const institutionName = metadata.institution?.name ?? null;
            start(async () => {
              const r = await fetch("/api/plaid/exchange", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ publicToken, institutionName }),
              });
              const j = await r.json();
              if (!r.ok) {
                setStatus(`Connected, but the first sync failed: ${j.error}`);
                return;
              }
              setAccounts((prev) => [
                ...prev,
                { itemId: j.itemId, institutionName },
              ]);
              setStatus(`${institutionName ?? "Account"} connected.`);
            });
          },
        });
        handler.open();
      } catch (e) {
        setStatus(e instanceof Error ? e.message : String(e));
      }
    });
  }

  async function unlink(itemId: string) {
    start(async () => {
      await fetch("/api/plaid/unlink", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId }),
      });
      setAccounts((prev) => prev.filter((a) => a.itemId !== itemId));
    });
  }

  return (
    <div className="mt-6">
      <Script
        src="https://cdn.plaid.com/link/v2/stable/link-initialize.js"
        onReady={() => setScriptReady(true)}
      />

      <button
        type="button"
        onClick={connect}
        disabled={!scriptReady || pending || accounts.length >= MAX_LINKED_BANKS}
        className="pill pill-selected disabled:opacity-60"
      >
        {pending ? "…" : accounts.length >= MAX_LINKED_BANKS ? `${MAX_LINKED_BANKS} of ${MAX_LINKED_BANKS} accounts linked` : "+ Connect a bank"}
      </button>

      {status && <p className="mt-3 text-sm text-muted">{status}</p>}

      {accounts.length > 0 && (
        <ul className="mt-6 flex flex-col gap-2">
          {accounts.map((a) => (
            <li
              key={a.itemId}
              className="flex items-center justify-between rounded-ctl border border-line bg-surface-hi/40 px-3 py-2 text-sm"
            >
              <span className="text-ink">
                {a.institutionName ?? "Connected account"}
              </span>
              <button
                type="button"
                onClick={() => unlink(a.itemId)}
                disabled={pending}
                className="text-xs text-muted hover:text-bad"
              >
                Disconnect
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-6 text-xs text-faint">
        Repeat for each bank or brokerage you use — one click each.
        Transactions sync automatically after that; no need to revisit this
        page unless a bank needs re-authentication.
      </p>
    </div>
  );
}
