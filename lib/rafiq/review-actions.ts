"use server";

import Anthropic from "@anthropic-ai/sdk";
import { mailConfigured } from "@/lib/auth/mail";
import { requireUser } from "@/lib/auth/session";
import { isPaid } from "@/lib/dashboard/catalog";
import { getPlan } from "@/lib/dashboard/prefs";
import { rafiqConfigured } from "./agent";
import { RAFIQ_SYSTEM } from "./prompt";
import { weeklyReviewSummary } from "./review";
import { consumeRafiqMessage } from "./usage";

/**
 * Rafiq's paragraph about the week.
 *
 * One call, no tools: the figures are gathered first and handed over as data,
 * so there is nothing for the model to look up and no way for it to reach a
 * number by itself. It costs one message from the monthly allowance, the same
 * as any other thing the user asks him.
 */

const MAX_TOKENS = 700;

export async function summariseWeekAction(): Promise<
  { ok: true; text: string } | { ok: false; error: string }
> {
  if (!isPaid(await getPlan())) {
    return { ok: false, error: "Rafiq is part of the Pro plan." };
  }
  if (!rafiqConfigured()) {
    return { ok: false, error: "Rafiq isn't switched on yet." };
  }
  if (mailConfigured() && !(await requireUser()).emailVerified) {
    return { ok: false, error: "Confirm your email to use Rafiq. The link is in your inbox." };
  }
  if (!(await consumeRafiqMessage())) {
    return { ok: false, error: "You've used this month's Rafiq messages. They reset on the 1st." };
  }

  const data = await weeklyReviewSummary();

  try {
    const res = await new Anthropic().beta.messages.create({
      model: "claude-haiku-5-5",
      max_tokens: MAX_TOKENS,
      output_config: { effort: "medium" },
      system: [
        { type: "text", text: RAFIQ_SYSTEM, cache_control: { type: "ephemeral" } },
        {
          type: "text",
          text: `The user has opened their weekly review. Write the short spoken summary that goes at the top of it.

Four or five sentences, plain text, no headings or bullets. Open with the thing that genuinely went best, name the one thing most worth fixing, and finish with a single concrete action for the next few days. Quote at most two or three figures — the page already shows every number, so repeating them all is noise.

If the week is still running, talk about it as still winnable rather than finished. If almost nothing has been logged, say that kindly and encourage one small entry rather than inventing progress.`,
        },
      ],
      messages: [
        {
          role: "user",
          content: `Here is my week, counted from my own logs:\n\n${JSON.stringify(data, null, 2)}`,
        },
      ],
    });

    const text = res.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();

    if (!text) return { ok: false, error: "Rafiq didn't have anything to add this time." };
    return { ok: true, text };
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      return { ok: false, error: "The Anthropic API key was rejected. Check ANTHROPIC_API_KEY." };
    }
    if (err instanceof Anthropic.APIError) {
      console.error("[rafiq:review]", err.status, err.message);
      return { ok: false, error: "Rafiq couldn't reach Claude just now. Try again." };
    }
    throw err;
  }
}
