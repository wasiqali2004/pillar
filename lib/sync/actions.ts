"use server";

import { revalidatePath } from "next/cache";
import { refreshAll, type RefreshReport } from ".";

/**
 * The server boundary for the Refresh button. Revalidates every route that
 * reads synced data, not just "/" — the Quran reader and the money-linking
 * page render from the same tables.
 */
export async function refreshAllAction(): Promise<RefreshReport> {
  const report = await refreshAll();
  revalidatePath("/", "layout");
  return report;
}
