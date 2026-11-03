"use client";

import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";

/** Chrome/Edge's install event. Not in the DOM typings yet. */
type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const noop = () => () => {};
const useStandalone = () =>
  useSyncExternalStore(
    noop,
    () => window.matchMedia("(display-mode: standalone)").matches,
    () => false,
  );
const useIos = () =>
  useSyncExternalStore(noop, () => /iphone|ipad|ipod/i.test(navigator.userAgent), () => false);

/**
 * "Install app". Uses the browser's own install prompt where there is one
 * (Chrome, Edge, Android). iPhone has no prompt, so it shows the two taps
 * instead. Hidden once the app is installed and running in its own window.
 *
 * `fallback` is what to show when neither applies, e.g. Firefox desktop.
 */
export function InstallButton({
  className = "pill pill-inactive",
  label = "Install app",
  fallback = null,
}: {
  className?: string;
  label?: string;
  fallback?: ReactNode;
}) {
  const standalone = useStandalone();
  const ios = useIos();
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [iosHelp, setIosHelp] = useState(false);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault(); // keep the browser's mini-bar quiet; we show our own button
      setPrompt(e as InstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setPrompt(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (standalone || installed) return null;

  if (prompt) {
    return (
      <button
        type="button"
        className={className}
        onClick={async () => {
          await prompt.prompt();
          const { outcome } = await prompt.userChoice;
          if (outcome === "accepted") setPrompt(null);
        }}
      >
        {label}
      </button>
    );
  }

  if (ios) {
    return (
      <span className="relative inline-flex">
        <button type="button" className={className} onClick={() => setIosHelp((v) => !v)} aria-expanded={iosHelp}>
          {label}
        </button>
        {iosHelp && (
          <span className="lp-ios-help" role="note">
            Tap <b>Share</b> in Safari, then <b>Add to Home Screen</b>.
          </span>
        )}
      </span>
    );
  }

  return <>{fallback}</>;
}
