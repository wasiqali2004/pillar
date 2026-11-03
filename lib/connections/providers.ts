/**
 * Every outside service Pillar can pull from, and — the part that matters
 * for the UI — *who* has to do the work to switch it on.
 *
 * Client-safe: no server imports, so both the user-facing Connect page and the
 * owner's setup page read the same list and can't drift apart.
 *
 * The distinction this file exists to make:
 *
 *   "oauth"  one tap for the user. They press Connect, approve on the
 *            provider's own screen, and come back done. Nothing to copy or
 *            paste. Costs the app owner a one-time setup first (env vars).
 *   "key"    the provider has no OAuth for personal use, so the user has to
 *            fetch a key themselves. Kept to a single paste.
 *   "file"   no account anywhere: download your own data, drop it in.
 *
 * Owner setup never belongs on the user's screen. It lives at /app/setup.
 */

export type LinkKind = "oauth" | "key" | "file";

export type ProviderSpec = {
  id: string;
  name: string;
  /** What the user gets, in their words, not the vendor's. */
  gives: string;
  mark: { text: string; color: string };
  kind: LinkKind;
  /** Which dashboard widgets this feeds. */
  feeds: ("body" | "training" | "money" | "portfolio" | "business")[];
  /** Env vars the owner must set before a one-tap connect can work. */
  requires?: string[];
  /** Where the owner goes to get those, for the setup page only. */
  setup?: {
    console: string;
    steps: string[];
    /** Pitfalls that cost an afternoon if discovered late. */
    warnings?: string[];
  };
};

export const HEALTH_PROVIDERS: ProviderSpec[] = [
  {
    id: "google_health",
    name: "Fitbit, Pixel Watch & Android",
    gives: "Steps, calories burned and sleep, updated through the day",
    mark: { text: "G", color: "#4285f4" },
    kind: "oauth",
    feeds: ["body"],
    requires: ["GOOGLE_HEALTH_CLIENT_ID", "GOOGLE_HEALTH_CLIENT_SECRET", "GOOGLE_HEALTH_REDIRECT_URI"],
    setup: {
      console: "https://console.cloud.google.com/apis/library/health.googleapis.com",
      steps: [
        "Create a Google Cloud project, then enable the Google Health API in the API Library.",
        "Under Google Auth Platform, configure the consent screen: app name, your email, External audience.",
        "In Clients, create an OAuth client ID of type Web application, with the app's callback URL as an authorised redirect URI.",
        "Under Data Access, add the two googlehealth read-only scopes: sleep, and activity_and_fitness.",
        "Under Audience, add the Google account you'll test with as a Test user.",
        "Add the client ID and secret to the server (or to .env.local at home) and restart.",
      ],
      warnings: [
        "Only Google accounts on the Test users list can connect while the project is in Testing. Anyone else sees Google's blocked-app screen, so add testers under Audience.",
        "While the project is in Testing, Google expires every connection after 7 days, so it needs reconnecting weekly. Publishing the app stops that.",
        "Health scopes are Restricted. Unverified clients cap at 100 users, and going past that needs a security review by an outside assessor.",
        "A Fitbit account has to be moved to a Google account, and the Google Health app signed into once, or the API answers ACCOUNT_NOT_LINKED.",
      ],
    },
  },
  {
    id: "hevy",
    name: "Hevy",
    gives: "Every workout you log, with sets, reps and weight",
    mark: { text: "H", color: "#3b82f6" },
    kind: "key",
    feeds: ["training"],
  },
  {
    id: "health_file",
    name: "Upload your own data",
    gives: "Steps, calories and sleep from a Fitbit or Google Takeout export, including history",
    mark: { text: "↥", color: "#2fe1c4" },
    kind: "file",
    feeds: ["body"],
  },
];

/**
 * Asked for by name and not built yet. Listed so the page answers "can it do
 * Whoop?" honestly instead of going quiet — but never as a button that does
 * nothing when pressed.
 */
export const PLANNED_PROVIDERS: { name: string; note: string }[] = [
  { name: "Whoop", note: "Has an OAuth API. Needs a developer app and a sync written — about a day's work." },
  { name: "Oura", note: "Same shape as Whoop: OAuth, then a sync." },
  { name: "Apple Health", note: "No web API at all. It would need an importer for Apple's export.xml, which the upload doesn't read yet." },
  { name: "Garmin", note: "Developer programme requires approval before any access." },
];
