import "server-only";
import type { ToolDef } from "@/lib/widgets/types";
import { weeklyReviewSummary } from "./review";

/**
 * Tools that read across every widget rather than belonging to one, so they
 * have no owner and stay available whatever the dashboard looks like. The
 * review itself already drops any section whose widget is switched off.
 */
export const reviewTools: ToolDef[] = [
  {
    name: "get_weekly_review",
    description:
      "The user's current week in numbers, counted from their own logs: salah, habits, training, body, Qur'an and money, each against the week before, plus the points most worth raising. Use this for any question about how their week, fortnight or recent run is going, and for weekly check-ins. The figures are authoritative — repeat them as given and never recalculate or estimate.",
    input_schema: { type: "object", properties: {} },
    handler: weeklyReviewSummary,
  },
];
