import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 px-5 py-16 text-center">
      <h1 className="text-xl font-semibold">That page doesn&apos;t exist</h1>
      <Link href="/app" className="pill pill-highlight">
        Back to your dashboard
      </Link>
    </main>
  );
}
