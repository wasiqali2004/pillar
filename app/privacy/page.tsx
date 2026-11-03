import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { contactEmail } from "@/lib/auth/hosting";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = { title: "Privacy" };
export const dynamic = "force-dynamic";

/**
 * Describes what the code actually does. Plain language first; it should get a
 * lawyer's review before the app takes money or opens to the public, and this
 * page must change whenever the data handling does.
 */
export default function PrivacyPage() {
  const contact = contactEmail();
  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-10 sm:py-14">
      <Link href="/" className="text-sm text-muted hover:text-teal">
        ← {BRAND.name}
      </Link>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight">Privacy</h1>
      <p className="mt-2 text-sm text-muted">What {BRAND.name} keeps, where it goes, and how to remove it.</p>

      <Section title="What's stored">
        <p>
          Your email, your name if you give it, and a scrambled form of your password that can&apos;t be turned back into
          the original. Then whatever you log or connect: prayers, habits, workouts, steps, sleep, calories, weight, goals,
          money entries, holdings, sales totals and reflections.
        </p>
      </Section>

      <Section title="How it's kept apart">
        <p>
          Every account has its own separate database file. Keys and tokens for services you connect are encrypted before
          they&apos;re saved. Sign-in uses a private cookie, and nothing about you is sold or used for advertising.
        </p>
      </Section>

      <Section title="Where it lives">
        <p>
          On an encrypted disk in a data centre in Toronto, Canada, run by Fly.io. The disk is copied once a day and each
          copy is kept for 14 days, so we can recover from a failure.
        </p>
      </Section>

      <Section title="Who else sees anything">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <b>Rafiq.</b> When you message Rafiq, your message and the data Rafiq looks up to answer are sent to Anthropic,
            the company that makes the Claude AI that powers Rafiq. Rafiq only reads widgets you&apos;ve put on your dashboard.
          </li>
          <li>
            <b>Services you connect.</b> Pillar only pulls from Google Health, Hevy, Plaid, Shopify, Square or Stripe if you
            connect them, and only what each tile needs. Fitbit data is read-only.
          </li>
          <li>
            <b>Email.</b> Account emails, such as confirming your address or resetting your password, go through Resend, which
            sees your email address and the message. If you join the waitlist, your email is kept only to invite you, and
            is removed when you create an account.
          </li>
          <li>
            <b>Reminders.</b> If you turn them on, your browser&apos;s push service (Google, Apple or Mozilla) delivers them. The
            message is encrypted so the service can&apos;t read it, though it can see that a notification was sent.
          </li>
          <li>
            <b>Public lookups.</b> Stock tickers you add go to a market-price service. A city you search for prayer times
            goes to Open-Meteo. Qur&apos;an text comes from Quran.com. None of these requests carry your name or email.
          </li>
        </ul>
      </Section>

      <Section title="Your control">
        <p>
          In Settings you can download everything as one file, or delete your account. Deleting removes your entire database
          and your sign-in at once, unlinks any bank, and revokes the Google connection. It can&apos;t be undone. The daily
          disk copies age out within 14 days, and after that nothing of yours remains.
        </p>
      </Section>

      <Section title="Google data">
        <p>
          {BRAND.name}&apos;s use of information received from Google APIs follows the{" "}
          <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noreferrer" className="text-teal hover:underline">
            Google API Services User Data Policy
          </a>
          , including its Limited Use requirements. Your Fitbit data is only used to show it back to you and to answer you
          when you ask Rafiq.
        </p>
      </Section>

      <Section title="What Pillar isn't">
        <p>
          It isn&apos;t medical or financial advice, and Rafiq isn&apos;t a scholar. For rulings, ask someone qualified.
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
