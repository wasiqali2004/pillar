import "server-only";
import { defineWidget } from "../types";
import { MeditationTile } from "./MeditationTile";
import {
  CATEGORIES,
  quoteFor,
  slotFor,
  type Category,
  type Quote,
} from "./quotes";
import { localDate } from "@/lib/date";

export type MeditationData = {
  today: string;
  /**
   * The current two-hour slot and the quote it maps to under the default
   * "all" setting. The tile re-picks on the client once it knows the stored
   * category, but rendering this first is what keeps SSR and hydration in
   * agreement — and it's what a viewer with storage blocked keeps seeing.
   */
  slot: number;
  quote: Quote;
};

export async function loadMeditation(): Promise<MeditationData> {
  const slot = slotFor(Date.now());
  return { today: localDate(), slot, quote: quoteFor("all", slot) };
}

export async function meditationSummary(input?: { category?: string }) {
  const slot = slotFor(Date.now());
  const wanted = input?.category;
  const category: Category | "all" =
    wanted && CATEGORIES.includes(wanted as Category)
      ? (wanted as Category)
      : "all";
  const q = quoteFor(category, slot);
  return {
    date: localDate(),
    category: q.category,
    quote: q.text,
    attributed_to: q.by ?? null,
    rotates_every: "2 hours",
    categories: [...CATEGORIES],
  };
}

export const meditationWidget = defineWidget<MeditationData>({
  id: "meditation",
  title: "Reflection",
  size: "sm",
  group: { id: "health", label: "Health" },
  refresh: "live",
  load: loadMeditation,
  Tile: MeditationTile,
  tools: [
    {
      name: "get_daily_quote",
      description:
        "The current reflection from the Meditation tile. It rotates every two hours. Pass a category to draw from one set instead of all of them.",
      input_schema: {
        type: "object",
        properties: {
          category: {
            type: "string",
            enum: [...CATEGORIES],
            description: "Omit to use the full pool.",
          },
        },
      },
      handler: meditationSummary,
    },
  ],
});
