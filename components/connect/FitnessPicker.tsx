"use client";

import { useEffect, useState, type ReactNode } from "react";
import { HealthUpload } from "./HealthUpload";
import { WorkoutUpload } from "./WorkoutUpload";

/**
 * "Which do you use?" for fitness. Picking an app shows only what works for
 * that app, best route first:
 *   google    one tap, kept up to date (Fitbit, Pixel, Android via Google Health)
 *   hevy      paste a key, kept up to date
 *   health    upload the app's export: steps, calories, sleep, weight
 *   apple     Apple Health's export.xml
 *   workouts  upload a gym or cardio app's workout export
 *   manual    log it yourself
 *
 * The export steps name what to look for rather than promise exact menus:
 * apps move their settings around, and a wrong path is worse than a hint.
 */

type Route = "google" | "hevy" | "health" | "apple" | "workouts" | "manual";

type App = {
  id: string;
  name: string;
  mark: string;
  color: string;
  routes: Route[];
  /** Steps for the upload route. */
  how?: ReactNode[];
  /** Steps for the workouts route, when they differ from `how`. */
  workoutHow?: ReactNode[];
  /** Said above everything else, for apps with a catch. */
  note?: string;
};

const APPS: App[] = [
  {
    id: "fitbit",
    name: "Fitbit",
    mark: "F",
    color: "#2fb5c4",
    routes: ["google", "health"],
    how: [
      <>In the Fitbit app, open your profile and look for <b>Export your data</b>, or use Google Takeout and tick Fitbit.</>,
      <>It arrives by email as a .zip. Unzip it.</>,
      <>Choose the files whose names start with <b>steps</b>, <b>calories</b> and <b>sleep</b>.</>,
    ],
  },
  {
    id: "google",
    name: "Pixel Watch / Google Fit",
    mark: "G",
    color: "#4285f4",
    routes: ["google", "health"],
    how: [
      <>Go to <a href="https://takeout.google.com" target="_blank" rel="noreferrer" className="text-teal hover:underline">Google Takeout</a>, untick everything, then tick <b>Fitbit</b> or <b>Fit</b>.</>,
      <>It arrives by email as a .zip. Unzip it.</>,
      <>Choose the daily steps, calories and sleep files.</>,
    ],
  },
  {
    id: "apple",
    name: "Apple Watch / iPhone",
    mark: "A",
    color: "#e8ecf8",
    routes: ["apple"],
    note: "Apple doesn't let websites read Apple Health directly, so it's an export. It brings in your whole history at once.",
    how: [
      <>On your iPhone, open the <b>Health</b> app and tap your picture in the top right.</>,
      <>Tap <b>Export All Health Data</b> and save it to <b>Files</b>. It can take a few minutes.</>,
      <>In Files, tap the zip to unzip it, open the folder, and choose <b>export.xml</b> here.</>,
    ],
  },
  {
    id: "garmin",
    name: "Garmin",
    mark: "G",
    color: "#38bdf8",
    routes: ["health", "workouts"],
    how: [
      <>Sign in at garmin.com, open your account, and look for <b>Data Management → Export Your Data</b>.</>,
      <>Garmin emails a link, sometimes a day later. Unzip the download.</>,
      <>Choose the files named <b>UDSFile…</b> (steps and calories) and <b>…sleepData</b> (sleep).</>,
    ],
    workoutHow: [
      <>On connect.garmin.com, open <b>Activities → All Activities</b> and use <b>Export CSV</b>.</>,
      <>Choose the CSV it saves.</>,
    ],
  },
  {
    id: "samsung",
    name: "Samsung Health",
    mark: "S",
    color: "#1e88e5",
    routes: ["manual"],
    note: "Samsung Health doesn't share with websites, and its export can't be read here yet. Logging takes a few seconds a day.",
  },
  {
    id: "oura",
    name: "Oura",
    mark: "O",
    color: "#c9cdd6",
    routes: ["health"],
    how: [
      <>Sign in on the Oura website and look for <b>Export data</b> or <b>Download your data</b>.</>,
      <>Choose the daily activity and sleep CSV files here.</>,
    ],
  },
  {
    id: "whoop",
    name: "WHOOP",
    mark: "W",
    color: "#e8ecf8",
    routes: ["health"],
    how: [
      <>In the WHOOP app&apos;s settings, look for <b>Data export</b>.</>,
      <>WHOOP emails a zip. Unzip it and choose <b>sleeps.csv</b> and <b>physiological_cycles.csv</b>.</>,
    ],
  },
  {
    id: "mfp",
    name: "MyFitnessPal",
    mark: "M",
    color: "#2f80ed",
    routes: ["health", "manual"],
    note: "Pillar reads your weight from MyFitnessPal. Food logs aren't tracked here yet.",
    how: [
      <>On the MyFitnessPal website, look for <b>Export data</b> in settings. It&apos;s a Premium feature.</>,
      <>Choose the <b>Measurement</b> CSV from the download.</>,
    ],
  },
  {
    id: "hevy",
    name: "Hevy",
    mark: "H",
    color: "#3b82f6",
    routes: ["hevy", "workouts"],
    how: [
      <>In Hevy, open <b>Settings → Export &amp; Import Data</b> and export your workouts.</>,
      <>Choose the CSV it saves.</>,
    ],
  },
  {
    id: "strong",
    name: "Strong",
    mark: "S",
    color: "#f97316",
    routes: ["workouts"],
    how: [<>In Strong, open <b>Settings → Export Data</b>.</>, <>Choose the CSV it saves.</>],
  },
  {
    id: "fitbod",
    name: "Fitbod",
    mark: "F",
    color: "#ef4444",
    routes: ["workouts"],
    how: [<>In Fitbod&apos;s settings, look for <b>Export workout data</b>.</>, <>Choose the CSV it sends you.</>],
  },
  {
    id: "strava",
    name: "Strava",
    mark: "S",
    color: "#fc4c02",
    routes: ["workouts"],
    how: [
      <>On strava.com, open <b>Settings → My Account</b> and request your archive (under Download or Delete Your Account).</>,
      <>Strava emails a zip. Unzip it and choose <b>activities.csv</b>.</>,
    ],
  },
  {
    id: "peloton",
    name: "Peloton",
    mark: "P",
    color: "#e11d48",
    routes: ["workouts"],
    how: [<>On onepeloton.com, open your <b>Workouts</b> and choose <b>Download workouts</b>.</>, <>Choose the CSV it saves.</>],
  },
  {
    id: "nike",
    name: "Nike Run Club",
    mark: "N",
    color: "#e8ecf8",
    routes: ["manual"],
    note: "Nike Run Club has no export. On iPhone, turn on its Apple Health sharing and use the Apple option; otherwise log runs yourself.",
  },
  {
    id: "other",
    name: "Something else",
    mark: "…",
    color: "#8b93a7",
    routes: ["workouts", "health", "manual"],
    how: [
      <>Look in the app&apos;s settings for <b>Export</b> or <b>Download your data</b>, and pick CSV.</>,
      <>Choose the file here. Workout files need a date, exercise, weight and reps; daily files need a date plus steps, sleep or weight.</>,
    ],
  },
  { id: "none", name: "I don't use an app", mark: "✎", color: "#2fe1c4", routes: ["manual"] },
];

const STORE = "pillar:fitness-app";

export function FitnessPicker({
  google,
  hevy,
  manual,
  googleConnected,
  hevyConnected,
}: {
  /** The one-tap Google Health block, with its connected / unavailable states. */
  google: ReactNode;
  /** The Hevy key card. */
  hevy: ReactNode;
  /** The "log it yourself" buttons. */
  manual: ReactNode;
  googleConnected: boolean;
  hevyConnected: boolean;
}) {
  const [picked, setPicked] = useState<string | null>(null);

  // Remember the pick on this device; a connected source is the next best guess.
  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(STORE);
    } catch {}
    const guess = saved && APPS.some((a) => a.id === saved) ? saved : googleConnected ? "fitbit" : hevyConnected ? "hevy" : null;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading browser storage after hydration
    if (guess) setPicked(guess);
  }, [googleConnected, hevyConnected]);

  const pick = (id: string) => {
    const next = picked === id ? null : id;
    setPicked(next);
    try {
      if (next) localStorage.setItem(STORE, next);
      else localStorage.removeItem(STORE);
    } catch {}
  };

  const app = APPS.find((a) => a.id === picked) ?? null;
  const connectedIds = new Set([...(googleConnected ? ["fitbit", "google"] : []), ...(hevyConnected ? ["hevy"] : [])]);

  return (
    <div className="md:col-span-2">
      <p className="text-sm font-semibold">Which do you use?</p>
      <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Your fitness app">
        {APPS.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => pick(a.id)}
            className={`cx-chip inline-flex items-center gap-1.5 ${picked === a.id ? "is-on" : ""}`}
            aria-pressed={picked === a.id}
          >
            <span className="text-[0.7rem] font-bold" style={{ color: a.color }} aria-hidden>
              {a.mark}
            </span>
            {a.name}
            {connectedIds.has(a.id) && <span className="text-teal" aria-label="connected">✓</span>}
          </button>
        ))}
      </div>

      {!app && <p className="mt-3 text-xs text-faint">Tap one and you&apos;ll see the simplest way to bring it in.</p>}

      {app && (
        <div className="cx-card mt-4">
          <h3 className="font-semibold">{app.id === "none" ? "Log it yourself" : `Bring in ${app.name}`}</h3>
          {app.note && <p className="mt-1 text-sm text-muted">{app.note}</p>}

          <div className="mt-2 flex flex-col gap-5">
            {app.routes.map((r, i) => (
              <section key={r} className={i > 0 ? "border-t border-line-soft pt-4" : ""}>
                {app.routes.length > 1 && (
                  <p className="mb-1 text-[0.62rem] font-semibold tracking-[0.16em] text-faint uppercase">
                    {i === 0
                      ? "Best way"
                      : r === "manual"
                        ? "Or log it yourself"
                        : r === "workouts"
                          ? "Or upload your workouts"
                          : "Or upload a file"}
                  </p>
                )}
                {r === "google" && google}
                {r === "hevy" && hevy}
                {r === "health" && <HealthUpload steps={app.how} />}
                {r === "apple" && <HealthUpload steps={app.how} apple />}
                {r === "workouts" && (app.workoutHow ?? app.how) && <WorkoutUpload steps={(app.workoutHow ?? app.how)!} />}
                {r === "manual" && manual}
              </section>
            ))}
          </div>

          {!app.routes.includes("manual") && <div className="mt-5 border-t border-line-soft pt-4">{manual}</div>}
        </div>
      )}
    </div>
  );
}
