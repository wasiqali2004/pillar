import { defineWidget } from "../types";
import { HabitsTile } from "./HabitsTile";
import {
  loadHabits,
  habitStatusSummary,
  markHabit,
  type HabitsData,
} from "./queries";

export const habitsWidget = defineWidget<HabitsData>({
  id: "habits",
  title: "Habits",
  span: 6,
  size: "sm",
  refresh: "live",
  load: loadHabits,
  Tile: HabitsTile,

  // Wired in Phase 3. Defined here so the capability ships with the widget
  // rather than in a central list that drifts.
  tools: [
    {
      name: "get_habit_status",
      description:
        "Today's habit completion, current streaks, and how many days in the last 7 each habit was hit.",
      input_schema: { type: "object", properties: {} },
      handler: habitStatusSummary,
    },
    {
      name: "log_habit",
      description:
        "Mark a habit complete for today. Returns a proposed action for the user to confirm.",
      input_schema: {
        type: "object",
        properties: {
          habit_id: { type: "number", description: "The habit's id." },
        },
        required: ["habit_id"],
      },
      write: true,
      handler: ({ habit_id }: { habit_id: number }) => markHabit(habit_id),
    },
  ],
});
