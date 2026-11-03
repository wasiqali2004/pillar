import type { ComponentType } from "react";

export type WidgetSize = "sm" | "md" | "lg";

/**
 * A tool the AI layer may call against this widget's data.
 * Read tools land in Phase 3; `write: true` tools go behind a confirm chip
 * and must record to audit_log. There are deliberately no delete tools.
 */
export type ToolDef = {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: (input: any) => Promise<unknown>;
  write?: boolean;
};

/**
 * The whole architecture. A widget owns how it loads, how it draws, and what
 * Rafiq is allowed to ask it — so adding a life area is one file, and the
 * chat layer can never drift out of sync with the dashboard.
 */
export type Widget<T = unknown> = {
  id: string;
  title: string;
  size: WidgetSize;
  /**
   * Columns out of 12 on a wide screen. Defaults to 3 for a lone widget and 6
   * for a group. The dashboard grid is a fixed number of full rows, so these
   * must sum to a multiple of 12 — a widget that overflows the last row gets
   * clipped by the one-screen lock rather than wrapping visibly.
   */
  span?: 3 | 6 | 9 | 12;
  refresh: "live" | "daily" | "manual";
  /**
   * Widgets sharing a group id render as one labelled cluster on the
   * dashboard. They must be adjacent in the registry — order there is the
   * order on screen.
   */
  group?: { id: string; label: string };
  /** Runs on the server. */
  load: () => Promise<T>;
  Tile: ComponentType<{ data: T }>;
  tools?: ToolDef[];
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyWidget = Widget<any>;

export function defineWidget<T>(w: Widget<T>): Widget<T> {
  return w;
}
