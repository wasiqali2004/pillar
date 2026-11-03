import "server-only";
import type { ToolDef } from "@/lib/widgets/types";
import { CATALOG, CATALOG_BY_ID, WIDGET_IDS, conflictsOf, fitSpan, moveTo, placeWidget, type Span, type WidgetId } from "./catalog";
import { getLayout, saveLayout } from "./prefs";

const SIZES = { small: 3, medium: 6, large: 9, full: 12 } as const;
type Size = keyof typeof SIZES;
const SIZE_OF: Record<Span, Size> = { 3: "small", 6: "medium", 9: "large", 12: "full" };

const widgetIdProp = { type: "string", enum: [...WIDGET_IDS] };
const sizeProp = {
  type: "string",
  enum: Object.keys(SIZES),
  description: "small = a quarter of the row, medium = half, large = three quarters, full = the whole row.",
};
const positionProp = { type: "number", description: "1-based position on the dashboard, left to right, top to bottom." };

async function current() {
  return (await getLayout()) ?? [];
}

function title(id: WidgetId) {
  return CATALOG_BY_ID.get(id)?.title ?? id;
}

/** Shapes the result so Rafiq can tell the user what actually happened. */
function summary(items: { id: WidgetId; span: Span }[]) {
  return items.map((i, n) => ({ position: n + 1, id: i.id, title: title(i.id), size: SIZE_OF[i.span] }));
}

/**
 * Rafiq's handle on the dashboard itself. The writes go behind the same
 * confirm chip as logging a prayer, and through normalizeLayout like every
 * other layout change.
 */
export const dashboardTools: ToolDef[] = [
  {
    name: "get_dashboard_layout",
    description:
      "The widgets currently on the user's dashboard in order, with their sizes, plus the widgets they could add. Check this before changing the layout.",
    input_schema: { type: "object", properties: {} },
    handler: async () => {
      const items = await current();
      const on = new Set(items.map((i) => i.id));
      return {
        on_dashboard: summary(items),
        available_to_add: CATALOG.filter((c) => !on.has(c.id)).map((c) => ({
          id: c.id,
          title: c.title,
          what_it_shows: c.blurb,
          note: c.replaces ? `Contains ${c.replaces.map(title).join(" and ")}; adding it replaces them.` : undefined,
        })),
      };
    },
  },
  {
    name: "add_widget",
    description: "Add a widget to the user's dashboard. Returns a proposed action for the user to confirm.",
    input_schema: {
      type: "object",
      properties: { widget_id: widgetIdProp, position: positionProp, size: sizeProp },
      required: ["widget_id"],
    },
    write: true,
    handler: async ({ widget_id, position, size }: { widget_id: WidgetId; position?: number; size?: Size }) => {
      const items = await current();
      const replaced = conflictsOf(widget_id).filter((c) => items.some((i) => i.id === c));
      const next = placeWidget(items, widget_id, size ? SIZES[size] : undefined, position ? position - 1 : undefined);
      return {
        dashboard: summary(await saveLayout(next, "rafiq")),
        replaced: replaced.length ? replaced.map(title) : undefined,
      };
    },
  },
  {
    name: "remove_widget",
    description:
      "Take a widget off the user's dashboard. Their data is kept; it can be added back any time. Returns a proposed action for the user to confirm.",
    input_schema: { type: "object", properties: { widget_id: widgetIdProp }, required: ["widget_id"] },
    write: true,
    handler: async ({ widget_id }: { widget_id: WidgetId }) => {
      const items = (await current()).filter((i) => i.id !== widget_id);
      return { dashboard: summary(await saveLayout(items, "rafiq")) };
    },
  },
  {
    name: "move_widget",
    description: "Move a widget that's already on the dashboard to a new position. Returns a proposed action for the user to confirm.",
    input_schema: {
      type: "object",
      properties: { widget_id: widgetIdProp, position: positionProp },
      required: ["widget_id", "position"],
    },
    write: true,
    handler: async ({ widget_id, position }: { widget_id: WidgetId; position: number }) => {
      const items = await current();
      const from = items.findIndex((i) => i.id === widget_id);
      if (from === -1) return { error: `${title(widget_id)} isn't on the dashboard. Use add_widget.` };
      return { dashboard: summary(await saveLayout(moveTo(items, from, position - 1), "rafiq")) };
    },
  },
  {
    name: "resize_widget",
    description:
      "Change how wide a widget is. Some widgets only support certain sizes, so the result reports the size actually used. Returns a proposed action for the user to confirm.",
    input_schema: {
      type: "object",
      properties: { widget_id: widgetIdProp, size: sizeProp },
      required: ["widget_id", "size"],
    },
    write: true,
    handler: async ({ widget_id, size }: { widget_id: WidgetId; size: Size }) => {
      const items = await current();
      if (!items.some((i) => i.id === widget_id)) return { error: `${title(widget_id)} isn't on the dashboard. Use add_widget.` };
      const next = items.map((i) => (i.id === widget_id ? { ...i, span: fitSpan(widget_id, SIZES[size]) } : i));
      return { dashboard: summary(await saveLayout(next, "rafiq")) };
    },
  },
];
