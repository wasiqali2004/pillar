"use server";

import { revalidatePath } from "next/cache";
import { removeCredentials, saveCredentials, type Provider } from "./vault";
import { normalizeShopDomain, syncShopifyNow, verifyShopify } from "@/lib/business/shopify";
import { syncSquareNow, verifySquare } from "@/lib/business/square";
import { syncStripeNow, verifyStripe } from "@/lib/business/stripe";
import { syncHevy, verifyHevy } from "@/lib/training/hevy";

export type ConnectResult = { ok: true; label: string; note?: string } | { ok: false; error: string };

const clean = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/**
 * Every key is tried against the real service before it's saved, so a typo
 * fails here with a plain message instead of as a broken tile later. The
 * first sync runs straight after; if that fails the connection still stands
 * and the tile shows why.
 */
export async function connectAction(provider: Provider, fields: Record<string, string>): Promise<ConnectResult> {
  try {
    let label: string;
    let firstSync: () => Promise<unknown>;

    switch (provider) {
      case "hevy": {
        const apiKey = clean(fields.apiKey);
        if (!apiKey) return { ok: false, error: "Paste your Hevy API key." };
        label = await verifyHevy(apiKey);
        await saveCredentials("hevy", { apiKey }, label);
        firstSync = syncHevy;
        break;
      }
      case "shopify": {
        const raw = clean(fields.domain);
        if (!raw) return { ok: false, error: "Enter your store's address, e.g. my-store.myshopify.com." };
        const domain = normalizeShopDomain(raw);
        const token = clean(fields.token);
        const clientId = clean(fields.clientId);
        const clientSecret = clean(fields.clientSecret);
        if (!token && !(clientId && clientSecret)) {
          return { ok: false, error: "Paste an Admin API access token, or the app's client ID and secret." };
        }
        const creds = token ? { domain, token } : { domain, clientId, clientSecret };
        label = await verifyShopify(creds);
        await saveCredentials("shopify", creds, label);
        firstSync = syncShopifyNow;
        break;
      }
      case "square": {
        const token = clean(fields.token);
        if (!token) return { ok: false, error: "Paste your Square production access token." };
        label = await verifySquare(token);
        await saveCredentials("square", { token }, label);
        firstSync = syncSquareNow;
        break;
      }
      case "stripe": {
        const key = clean(fields.key);
        if (!key) return { ok: false, error: "Paste your Stripe restricted key." };
        if (key.startsWith("sk_")) {
          return { ok: false, error: "That's a full secret key. Make a restricted key with only Charges: Read instead." };
        }
        label = await verifyStripe(key);
        await saveCredentials("stripe", { key }, label);
        firstSync = syncStripeNow;
        break;
      }
      default:
        return { ok: false, error: "Unknown connection." };
    }

    let note: string | undefined;
    try {
      await firstSync();
    } catch (e) {
      note = `Connected, but the first sync failed: ${e instanceof Error ? e.message : String(e)}`;
    }
    revalidatePath("/app");
    revalidatePath("/app/connect");
    return { ok: true, label, note };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: /fetch failed|ENOTFOUND/i.test(msg) ? "Couldn't reach that service. Check the address and your connection." : msg };
  }
}

export async function disconnectAction(provider: Provider) {
  await removeCredentials(provider);
  revalidatePath("/app");
  revalidatePath("/app/connect");
}
