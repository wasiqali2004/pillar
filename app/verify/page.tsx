import type { Metadata } from "next";
import Link from "next/link";
import { Mark } from "@/components/Mark";
import { verifyEmailAction } from "@/lib/auth/actions";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = { title: "Confirm your email" };
export const dynamic = "force-dynamic";

export default async function VerifyPage({ searchParams }: PageProps<"/verify">) {
  const { token, failed } = await searchParams;
  const usable = typeof token === "string" && !failed;
  return (
    <main className="auth-shell">
      <div className="ob-glow" aria-hidden />
      <div className="auth-card">
        <Link href="/" className="flex items-center gap-2.5">
          <Mark className="h-8 w-8" gradientId="verify-mark" />
          <span className="text-lg font-semibold tracking-tight">{BRAND.name}</span>
        </Link>
        <h1 className="mt-6 text-2xl font-semibold tracking-tight">Confirm your email</h1>
        {usable ? (
          <form action={verifyEmailAction} className="mt-6">
            <input type="hidden" name="token" value={token} />
            <button type="submit" className="ob-next w-full justify-center text-center">
              Confirm my email
            </button>
          </form>
        ) : (
          <p className="mt-2 text-sm text-muted">
            That link has expired or was already used. Sign in and you can ask for a new one.{" "}
            <Link href="/app" className="text-teal hover:underline">
              Go to {BRAND.name}
            </Link>
          </p>
        )}
      </div>
    </main>
  );
}
