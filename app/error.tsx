"use client";

import Link from "next/link";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 px-5 py-16 text-center">
      <h1 className="text-xl font-semibold">Something went wrong</h1>
      <p className="text-sm text-muted">Your data is safe. This page just couldn&apos;t load. Try again in a moment.</p>
      <div className="flex gap-2">
        <button type="button" className="pill pill-highlight" onClick={reset}>
          Try again
        </button>
        <Link href="/app" className="pill">
          Dashboard
        </Link>
      </div>
    </main>
  );
}
