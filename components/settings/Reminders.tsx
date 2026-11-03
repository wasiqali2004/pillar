"use client";

import { useEffect, useState, useTransition } from "react";
import { disablePushAction, enablePushAction, saveReminderPrefsAction, sendTestReminderAction } from "@/lib/reminders/actions";
import type { ReminderPrefs } from "@/lib/reminders/schedule";

type Support = "checking" | "ok" | "needs-install" | "unsupported" | "blocked";

function toKey(base64url: string) {
  const b64 = base64url.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(base64url.length / 4) * 4, "=");
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

function hourLabel(h: number) {
  return `${h % 12 || 12}:00 ${h < 12 ? "am" : "pm"}`;
}

export function Reminders({
  publicKey,
  initial,
  showPrayers,
  hasPrayerPlace,
}: {
  publicKey: string;
  initial: ReminderPrefs;
  showPrayers: boolean;
  hasPrayerPlace: boolean;
}) {
  const [support, setSupport] = useState<Support>("checking");
  const [subscribed, setSubscribed] = useState(false);
  const [prefs, setPrefs] = useState(initial);
  const [note, setNote] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const installed = window.matchMedia("(display-mode: standalone)").matches;
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- only known in the browser
      setSupport(ios && !installed ? "needs-install" : "unsupported");
      return;
    }
    setSupport(Notification.permission === "denied" ? "blocked" : "ok");
    void navigator.serviceWorker
      .getRegistration("/")
      .then((r) => r?.pushManager.getSubscription())
      .then((s) => setSubscribed(Boolean(s)));
  }, []);

  async function subscribe() {
    const permission = await Notification.requestPermission();
    if (permission === "denied") {
      setSupport("blocked");
      return false;
    }
    if (permission !== "granted") return false;
    const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(publicKey) });
    const { ok } = await enablePushAction(sub.toJSON());
    if (!ok) {
      await sub.unsubscribe();
      setNote("This browser's notification service isn't one Pillar can use.");
      return false;
    }
    setSubscribed(true);
    return true;
  }

  async function unsubscribe() {
    const reg = await navigator.serviceWorker.getRegistration("/");
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      await disablePushAction(sub.endpoint);
      await sub.unsubscribe();
    }
    setSubscribed(false);
  }

  function change(next: ReminderPrefs) {
    const before = prefs;
    setPrefs(next);
    setNote(null);
    start(async () => {
      try {
        const turningOn = next.prayers || next.checkin;
        if (turningOn && !subscribed && !(await subscribe())) {
          setPrefs(before);
          return;
        }
        await saveReminderPrefsAction(next);
        if (!turningOn && subscribed) await unsubscribe();
      } catch {
        setPrefs(before);
        setNote("That didn't work in this browser. Try again, or try another browser.");
      }
    });
  }

  if (support === "checking") return <p className="text-sm text-muted">Checking this browser…</p>;
  if (support === "needs-install") {
    return (
      <p className="text-sm text-muted">
        On iPhone, reminders need Pillar on your Home Screen. Tap Share, then Add to Home Screen, open it from there, and come
        back to this page.
      </p>
    );
  }
  if (support === "unsupported") {
    return <p className="text-sm text-muted">This browser can&apos;t show reminders. Chrome, Edge, Firefox and Safari can.</p>;
  }
  if (support === "blocked") {
    return (
      <p className="text-sm text-muted">
        Notifications are blocked for Pillar in this browser. Allow them in the site settings next to the address bar, then
        reload this page.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3 text-sm">
      {showPrayers && (
        <label className={`flex items-center justify-between gap-3 ${hasPrayerPlace ? "" : "opacity-60"}`}>
          <span>
            Prayer times
            {!hasPrayerPlace && <span className="block text-xs text-faint">Set your location above first</span>}
          </span>
          <input
            type="checkbox"
            checked={prefs.prayers}
            disabled={pending || !hasPrayerPlace}
            onChange={(e) => change({ ...prefs, prayers: e.target.checked })}
          />
        </label>
      )}
      <label className="flex items-center justify-between gap-3">
        <span>
          Evening check-in
          <span className="block text-xs text-faint">Only if habits are still open that day</span>
        </span>
        <input type="checkbox" checked={prefs.checkin} disabled={pending} onChange={(e) => change({ ...prefs, checkin: e.target.checked })} />
      </label>
      {prefs.checkin && (
        <label className="flex items-center justify-between gap-3 text-muted">
          Check-in time
          <select
            className="cx-input !w-auto !py-1 !text-xs"
            value={prefs.checkinHour}
            disabled={pending}
            onChange={(e) => change({ ...prefs, checkinHour: Number(e.target.value) })}
          >
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>
                {hourLabel(h)}
              </option>
            ))}
          </select>
        </label>
      )}
      {subscribed && (
        <button
          type="button"
          className="self-start text-teal hover:underline"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const { delivered } = await sendTestReminderAction();
              setNote(delivered > 0 ? "Sent. It should appear in a moment." : "That couldn't be delivered. Turn reminders off and on again.");
            })
          }
        >
          Send a test
        </button>
      )}
      {note && (
        <p className="text-xs text-muted" role="status">
          {note}
        </p>
      )}
    </div>
  );
}
