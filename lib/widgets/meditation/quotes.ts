/**
 * The reflection pool, kept free of server imports so the tile can filter and
 * rotate it on the client without dragging the database into the bundle.
 *
 * On the spiritual set: these are reflections, deliberately NOT scripture.
 * The same rule the Quran reader follows applies here — revealed text is
 * quoted from a real source or not at all, so nothing in this file is
 * presented as Qur'an or hadith. `by` is filled in only where the line is
 * genuinely traceable to a person; the rest are common aphorisms with no
 * reliable attribution, and inventing one would be worse than leaving it off.
 */

export const CATEGORIES = [
  "spiritual",
  "financial",
  "discipline",
  "resilience",
  "stillness",
] as const;

export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<Category, string> = {
  spiritual: "Spiritual",
  financial: "Financial",
  discipline: "Discipline",
  resilience: "Resilience",
  stillness: "Stillness",
};

export type Quote = { text: string; category: Category; by?: string };

export const QUOTES: Quote[] = [
  /* ── spiritual ── */
  { category: "spiritual", text: "Patience is not waiting. It is how you carry yourself while you wait." },
  { category: "spiritual", text: "Intention is the difference between a habit and an act of worship." },
  { category: "spiritual", text: "Gratitude turns what you have into enough." },
  { category: "spiritual", text: "Trust the outcome, but do not abandon the effort." },
  { category: "spiritual", text: "What was taken from you was never the thing holding you up." },
  { category: "spiritual", text: "The soul needs maintenance the way the body does — daily, quietly, without applause." },
  { category: "spiritual", text: "Sincerity is what you do when no one is recording." },
  { category: "spiritual", text: "Contentment is wealth that no market can price." },
  { category: "spiritual", text: "You are not behind. You are on a timeline you did not write." },
  { category: "spiritual", text: "Hardship is not a detour from the path. Often it is the path." },
  { category: "spiritual", text: "Mercy given freely is mercy you will need one day." },
  { category: "spiritual", text: "Stand for what is right, even if you stand thinner for it." },

  /* ── financial ── */
  { category: "financial", text: "Wealth is what you keep, not what you earn." },
  { category: "financial", text: "Every purchase is a trade of hours you have already worked." },
  { category: "financial", text: "Compounding rewards the patient and punishes the restless." },
  { category: "financial", text: "A budget is not a restriction. It is a plan for your freedom." },
  { category: "financial", text: "The best investment you own is the skill no one can take." },
  { category: "financial", text: "Price is what you pay. Value is what you get.", by: "Warren Buffett" },
  { category: "financial", text: "Debt borrows from a version of you who will have fewer options." },
  { category: "financial", text: "Build the boring foundation before the exciting bet." },
  { category: "financial", text: "Money earned honestly sleeps better than money earned fast." },
  { category: "financial", text: "The market pays you for staying, not for guessing." },
  { category: "financial", text: "Enough is a number. Decide yours before someone decides it for you." },
  { category: "financial", text: "Revenue is vanity, margin is sanity, cash in the bank is reality." },

  /* ── discipline ── */
  { category: "discipline", text: "Discipline is choosing what you want most over what you want now." },
  { category: "discipline", text: "Consistency beats intensity that does not come back tomorrow." },
  { category: "discipline", text: "You do not rise to your goals. You fall to your systems.", by: "James Clear" },
  { category: "discipline", text: "The hardest rep is the one that gets you through the door." },
  { category: "discipline", text: "Small things done daily outrank big things done once." },
  { category: "discipline", text: "Motivation is a guest. Habit is a resident." },
  { category: "discipline", text: "Do it tired. Do it small. But do it." },
  { category: "discipline", text: "Focus is deciding what you are willing to be bad at." },
  { category: "discipline", text: "The standard you walk past is the standard you accept." },
  { category: "discipline", text: "Start before you feel ready. Readiness follows action." },
  { category: "discipline", text: "A streak is one day, repeated with respect." },
  { category: "discipline", text: "Finish the thing you would most like to abandon." },

  /* ── resilience ── */
  { category: "resilience", text: "The only way out is through." },
  { category: "resilience", text: "In the middle of chaos, there is also opportunity." },
  { category: "resilience", text: "The wound is the place where the light enters you.", by: "Rumi" },
  { category: "resilience", text: "A no today is information, not a verdict." },
  { category: "resilience", text: "You have survived every worst day so far." },
  { category: "resilience", text: "Pressure is what turns preparation into proof." },
  { category: "resilience", text: "Falling is not failing. Staying down is a separate decision." },
  { category: "resilience", text: "Setbacks are tuition. Pay attention, or pay again." },
  { category: "resilience", text: "Strength is not never breaking. It is rebuilding each time." },
  { category: "resilience", text: "The storm rarely lasts as long as the story you tell about it." },
  { category: "resilience", text: "Rejection is the toll on the road to the yes." },
  { category: "resilience", text: "Begin again. That is the whole skill." },

  /* ── stillness ── */
  { category: "stillness", text: "Breathe. You are exactly where you need to be." },
  { category: "stillness", text: "Stillness is the gateway to clarity." },
  { category: "stillness", text: "The present moment is all we truly have." },
  { category: "stillness", text: "You are not your thoughts. You are the observer of them." },
  { category: "stillness", text: "In silence, we find our true voice." },
  { category: "stillness", text: "Peace comes from within. Do not seek it without." },
  { category: "stillness", text: "What we resist persists. What we accept transforms." },
  { category: "stillness", text: "Meditation is not about achieving anything. It is about letting go." },
  { category: "stillness", text: "The river flows not because it tries, but because it is water." },
  { category: "stillness", text: "Awareness is the first step to change." },
  { category: "stillness", text: "A quiet mind hears what a busy one talks over." },
  { category: "stillness", text: "Rest is not the reward for finishing. It is part of the work." },
];

/** Two hours, in milliseconds — one rotation slot. */
export const SLOT_MS = 2 * 60 * 60 * 1000;

/** Which rotation slot an instant falls in. Stable for the whole two hours. */
export function slotFor(ms: number): number {
  return Math.floor(ms / SLOT_MS);
}

export function poolFor(category: Category | "all"): Quote[] {
  return category === "all"
    ? QUOTES
    : QUOTES.filter((q) => q.category === category);
}

/**
 * The quote for a given slot. Walking the pool by slot index rather than
 * hashing means nothing repeats until the whole category has been seen.
 * Falls back to the full pool if a category is ever empty, so the tile can
 * never render blank.
 */
export function quoteFor(category: Category | "all", slot: number): Quote {
  const pool = poolFor(category);
  const list = pool.length > 0 ? pool : QUOTES;
  // Modulo of a negative slot would index off the front of the array.
  const i = ((slot % list.length) + list.length) % list.length;
  return list[i];
}
