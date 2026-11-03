import type { AnyWidget, ToolDef } from "./types";
import { deenWidget } from "./deen";
import { prayersWidget } from "./prayers";
import { quranWidget } from "./quran";
import { habitsWidget } from "./habits";
import { goalsWidget } from "./goals";
import { bodyWidget } from "./body";
import { meditationWidget } from "./meditation";
import { moneyWidget } from "./money";
import { businessWidget } from "./business";
import { portfolioWidget } from "./portfolio";
import { trainingTools } from "@/lib/training";
import { routineTools } from "@/lib/training/routines";
import { dashboardTools } from "@/lib/dashboard/tools";
import { reviewTools } from "@/lib/rafiq/tools";
import type { WidgetId } from "@/lib/dashboard/catalog";

/**
 * Every widget a user can put on their dashboard, by catalog id. Which ones
 * are actually shown, in what order and at what width, is the user's layout
 * (lib/dashboard/prefs.ts); this is just the code behind each id.
 *
 * Training is a full-width section rather than a tile, so it has no entry
 * here; app/page.tsx renders it directly when the layout includes "training".
 */
export const widgetsById: Partial<Record<WidgetId, AnyWidget>> = {
  // Prayers and Qur'an before Deen, so their tools own the shared names.
  prayers: prayersWidget,
  quran: quranWidget,
  deen: deenWidget,
  body: bodyWidget,
  habits: habitsWidget,
  goals: goalsWidget,
  meditation: meditationWidget,
  money: moneyWidget,
  portfolio: portfolioWidget,
  business: businessWidget,
};

/** Which catalog widget a tool reads from, so Rafiq can tell when it's switched off. */
export type OwnedTool = ToolDef & { owner: WidgetId | null };

/**
 * The one tool list Rafiq gets. It is the same every request, whatever is on
 * the dashboard: a stable list keeps the prompt cache warm, and old turns that
 * called a tool still match a definition. Switched-off widgets are handled
 * when a tool runs instead (see lib/rafiq/agent.ts).
 *
 * Prayers, Qur'an and Deen share tool names because Deen contains the other
 * two; the first definition of a name wins, which is why they're ordered
 * prayers, quran, deen above.
 */
export function allTools(): OwnedTool[] {
  const out: OwnedTool[] = [];
  const seen = new Set<string>();
  const add = (owner: WidgetId | null, tools: ToolDef[]) => {
    for (const t of tools) {
      if (seen.has(t.name)) continue;
      seen.add(t.name);
      out.push({ ...t, owner });
    }
  };
  for (const [id, w] of Object.entries(widgetsById) as [WidgetId, AnyWidget][]) add(id, w.tools ?? []);
  add("training", [...trainingTools, ...routineTools] as ToolDef[]);
  add(null, [...dashboardTools, ...reviewTools]);
  return out;
}

/** The widgets on a layout that give access to a tool's data. */
export function toolAvailable(tool: OwnedTool, onDashboard: Set<WidgetId>): boolean {
  if (tool.owner === null || onDashboard.has(tool.owner)) return true;
  // Deen contains Prayers and Qur'an, so their tools stay live when Deen is
  // on. The only tool Deen owns outright is Qur'an reading progress, which
  // the standalone Qur'an tile shows too.
  if ((tool.owner === "prayers" || tool.owner === "quran") && onDashboard.has("deen")) return true;
  if (tool.owner === "deen" && onDashboard.has("quran")) return true;
  return false;
}
