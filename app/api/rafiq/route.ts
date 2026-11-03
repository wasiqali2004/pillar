import Anthropic from "@anthropic-ai/sdk";
import { runTurn, rafiqAllowed, rafiqConfigured, type RafiqMessage } from "@/lib/rafiq/agent";
import { consumeRafiqMessage } from "@/lib/rafiq/usage";
import { RAFIQ_MONTHLY_MESSAGES } from "@/lib/dashboard/catalog";
import { mailConfigured } from "@/lib/auth/mail";
import { getSessionUser } from "@/lib/auth/session";

/** Every turn resends the whole chat, so very long ones get expensive and slow. */
const MAX_HISTORY = 60;

export const dynamic = "force-dynamic";

/**
 * Rafiq's one endpoint. Body: { messages, approvals? }.
 *
 * The client holds the transcript, so a client could hand-craft tool calls in
 * its own history. Those can only ever touch that same signed-in user's data,
 * because the database is theirs alone, but it should still move server-side.
 */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) {
    return Response.json({ error: "Please sign in." }, { status: 401 });
  }
  if (!(await rafiqAllowed())) {
    return Response.json({ error: "Rafiq is part of the Pro plan." }, { status: 402 });
  }
  if (!rafiqConfigured()) {
    return Response.json(
      {
        error: user.isOwner
          ? "Rafiq needs an Anthropic API key. Owner setup has the steps."
          : "Rafiq isn't switched on yet. Check back soon.",
      },
      { status: 503 },
    );
  }

  // Every message is on the owner's bill, so throwaway addresses don't get any.
  if (mailConfigured() && !user.emailVerified) {
    return Response.json({ error: "Confirm your email to use Rafiq. The link is in your inbox." }, { status: 403 });
  }

  let body: { messages?: RafiqMessage[]; approvals?: Record<string, boolean> };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Bad request" }, { status: 400 });
  }
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return Response.json({ error: "No messages" }, { status: 400 });
  }

  if (body.messages.length > MAX_HISTORY) {
    return Response.json({ error: "This chat has gotten long. Start a new one to keep Rafiq quick and sharp." }, { status: 400 });
  }
  // A new message from the user uses one of the month's; tapping Yes or No on
  // a confirm chip continues the same message and doesn't.
  if (!body.approvals && !(await consumeRafiqMessage())) {
    return Response.json(
      { error: `You've used your ${RAFIQ_MONTHLY_MESSAGES} Rafiq messages for this month. They reset on the 1st.` },
      { status: 429 },
    );
  }

  try {
    return Response.json(await runTurn(body.messages, body.approvals));
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      return Response.json(
        { error: user.isOwner ? "The Anthropic API key was rejected. Check ANTHROPIC_API_KEY." : "Rafiq isn't available right now. Try again later." },
        { status: 502 },
      );
    }
    if (err instanceof Anthropic.RateLimitError) {
      return Response.json({ error: "Rafiq is getting too many requests. Try again in a moment." }, { status: 429 });
    }
    if (err instanceof Anthropic.APIError) {
      console.error("[rafiq]", err.status, err.message);
      return Response.json({ error: "Rafiq couldn't reach Claude just now. Try again." }, { status: 502 });
    }
    throw err;
  }
}
