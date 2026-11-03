import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { contactEmail } from "@/lib/auth/hosting";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = { title: "Terms" };
export const dynamic = "force-dynamic";

/** Plain language first. Needs a lawyer's review before the app takes money. */
export default function TermsPage() {
  const contact = contactEmail();
  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-10 sm:py-14">
      <Link href="/" className="text-sm text-muted hover:text-teal">
        ← {BRAND.name}
      </Link>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight">Terms</h1>
      <p className="mt-2 text-sm text-muted">The short version of what you and {BRAND.name} can expect from each other.</p>

      <Section title="This is a beta">
        <p>
          {BRAND.name} is still being built. Features can change or go away, and things can break. It&apos;s free during the
          beta. If that ever changes, you&apos;ll be told before you&apos;re asked to pay anything.
        </p>
      </Section>

      <Section title="Your account">
        <p>
          You need to be at least 16 to use {BRAND.name}. Keep your password to yourself, and use your own email address.
          One person per account.
        </p>
      </Section>

      <Section title="Your data">
        <p>
          What you put in stays yours. You can download it or delete it from Settings at any time. The{" "}
          <Link href="/privacy" className="text-teal hover:underline">
            Privacy
          </Link>{" "}
          page says how it&apos;s handled. Keep your own copy of anything you can&apos;t afford to lose.
        </p>
      </Section>

      <Section title="What it isn't">
        <p>
          {BRAND.name} and Rafiq don&apos;t give medical, financial, legal or religious advice. Rafiq is an AI and can be
          wrong, so check anything that matters. Prayer times are calculated and can differ from your local mosque. Connected
          figures such as steps, sales and balances can be late or incomplete.
        </p>
      </Section>

      <Section title="Fair use">
        <p>
          Don&apos;t try to get at other people&apos;s data, overload the service, or use it to break the law. Accounts that
          do can be closed. You can leave at any time by deleting your account.
        </p>
      </Section>

      <Section title="Limits">
        <p>
          {BRAND.name} is provided as it is, without guarantees that it will always be available or free of errors. As far as
          the law allows, we aren&apos;t liable for losses from using it. These terms follow the laws of Ontario, Canada, and
          we&apos;ll say so here if they change.
        </p>
      </Section>

      {contact && (
        <Section title="Questions">
          <p>
            Email <a href={`mailto:${contact}`} className="text-teal hover:underline">{contact}</a>.
          </p>
        </Section>
      )}
    </main>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="mt-2 text-sm leading-relaxed text-muted">{children}</div>
    </section>
  );
}
