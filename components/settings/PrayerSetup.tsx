"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { searchPlacesAction } from "@/lib/account/actions";
import { localDate } from "@/lib/date";
import { time } from "@/lib/format";
import {
  PRAYER_METHODS,
  defaultMethod,
  prayerTimesFor,
  type AsrSchool,
  type PlaceResult,
  type PrayerMethod,
  type PrayerSettings,
} from "@/lib/prayer-options";

const FIVE = ["fajr", "dhuhr", "asr", "maghrib", "isha"] as const;
const LABEL = { fajr: "Fajr", dhuhr: "Dhuhr", asr: "Asr", maghrib: "Maghrib", isha: "Isha" };

/**
 * Where you are and which Asr you follow: the two things prayer times depend on
 * that can't be guessed. One tap on "Use my location" is enough for most people,
 * and the times show straight away so they can check them against their masjid.
 */
export function PrayerSetup({
  value,
  onChange,
}: {
  value: PrayerSettings | null;
  onChange: (next: PrayerSettings) => void;
}) {
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [searching, setSearching] = useState(false);
  const madhab: AsrSchool = value?.madhab ?? "shafi";
  const timer = useRef<number | undefined>(undefined);

  function apply(place: { latitude: number; longitude: number; label: string; timezone: string | null }) {
    onChange({
      latitude: place.latitude,
      longitude: place.longitude,
      place: place.label,
      method: defaultMethod(place.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone),
      madhab,
    });
    setResults([]);
    setQuery("");
  }

  function useMyLocation() {
    setGeoError(null);
    if (!navigator.geolocation) {
      setGeoError("This browser can't share a location. Search for your city instead.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        // About a kilometre of precision: plenty for prayer times, and it means
        // an exact home address is never stored.
        apply({
          latitude: Math.round(pos.coords.latitude * 100) / 100,
          longitude: Math.round(pos.coords.longitude * 100) / 100,
          label: "My location",
          timezone: null,
        });
      },
      () => {
        setLocating(false);
        setGeoError("Couldn't get your location. Search for your city instead.");
      },
      { timeout: 10_000, maximumAge: 600_000 },
    );
  }

  function search(q: string) {
    setQuery(q);
    window.clearTimeout(timer.current);
    if (q.trim().length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    timer.current = window.setTimeout(async () => {
      setResults(await searchPlacesAction(q));
      setSearching(false);
    }, 300);
  }

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const today = useMemo(() => {
    if (!value) return null;
    try {
      const t = prayerTimesFor(value, localDate());
      return FIVE.map((p) => ({ name: LABEL[p], at: time(t[p]) }));
    } catch {
      return null;
    }
  }, [value]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="ob-next" onClick={useMyLocation} disabled={locating}>
          {locating ? "Finding you…" : "Use my location"}
        </button>
        <span className="text-sm text-faint">or</span>
        <div className="relative min-w-[14rem] flex-1">
          <input
            value={query}
            onChange={(e) => search(e.target.value)}
            onKeyDown={(e) => e.stopPropagation()}
            placeholder="Search your city"
            aria-label="Search your city"
            className="cx-input"
          />
          {(results.length > 0 || searching) && (
            <ul className="ps-results" role="listbox">
              {searching && results.length === 0 && <li className="px-3 py-2 text-sm text-faint">Searching…</li>}
              {results.map((r) => (
                <li key={`${r.latitude},${r.longitude}`}>
                  <button type="button" className="ps-result" onClick={() => apply(r)}>
                    {r.label}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      {geoError && <p className="text-sm text-warn">{geoError}</p>}

      <fieldset>
        <legend className="text-sm font-semibold">Which Asr time do you follow?</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {(
            [
              { id: "shafi", title: "Standard", sub: "Shafi'i, Maliki, Hanbali" },
              { id: "hanafi", title: "Hanafi", sub: "A later Asr, by up to an hour or so" },
            ] as const
          ).map((o) => (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={madhab === o.id}
              onClick={() => value && onChange({ ...value, madhab: o.id })}
              disabled={!value}
              className={`ob-option ${madhab === o.id && value ? "is-on" : ""} ${value ? "" : "opacity-50"}`}
            >
              <span className="flex flex-col gap-0.5 text-left">
                <span className="font-semibold">{o.title}</span>
                <span className="text-sm text-muted">{o.sub}</span>
              </span>
            </button>
          ))}
        </div>
        {!value && <p className="mt-2 text-xs text-faint">Choose a location first.</p>}
      </fieldset>

      {value && today && (
        <div className="ps-preview">
          <p className="text-xs font-semibold text-muted">Today in {value.place}</p>
          <ul className="mt-2 grid grid-cols-5 gap-2 text-center">
            {today.map((p) => (
              <li key={p.name}>
                <span className="block text-[0.68rem] text-faint">{p.name}</span>
                <span className="tnum block text-sm font-medium">{p.at}</span>
              </li>
            ))}
          </ul>
          <label className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
            Calculation method
            <select
              className="cx-input !w-auto !py-1 !text-xs"
              value={value.method}
              onChange={(e) => onChange({ ...value, method: e.target.value as PrayerMethod })}
            >
              {PRAYER_METHODS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
          <p className="mt-2 text-[0.68rem] text-faint">Calculated times can differ by a few minutes from your local masjid.</p>
        </div>
      )}
    </div>
  );
}
