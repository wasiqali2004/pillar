"use client";

import { useState } from "react";

/** Owner setup, on a server: brings the database from the home install across. */
export function MoveDataIn() {
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    if (!window.confirm("This replaces everything in your account here with the data in that file. Continue?")) return;
    setState("busy");
    setError(null);
    const body = new FormData();
    body.append("file", file);
    try {
      const res = await fetch("/api/account/import", { method: "POST", body });
      if (!res.ok) throw new Error(((await res.json().catch(() => null)) as { error?: string } | null)?.error);
      setState("done");
    } catch (e) {
      setState("idle");
      setError((e instanceof Error && e.message) || "That didn't work. Nothing was changed.");
    }
  }

  if (state === "done") {
    return (
      <p className="mt-3 text-sm text-teal" role="status">
        Your data is here. <a href="/app" className="underline">Open your dashboard</a>.
      </p>
    );
  }

  return (
    <div className="mt-3">
      <label className={`pill inline-flex cursor-pointer ${state === "busy" ? "opacity-60" : ""}`}>
        {state === "busy" ? "Moving your data…" : "Choose pillar.db"}
        <input
          type="file"
          accept=".db"
          className="sr-only"
          disabled={state === "busy"}
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void upload(f);
          }}
        />
      </label>
      {error && (
        <p className="mt-2 text-sm text-bad" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
