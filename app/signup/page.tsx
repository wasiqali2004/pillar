import { existsSync } from "node:fs";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth/AuthForm";
import { WaitlistForm } from "@/components/auth/WaitlistForm";
import { inviteCode, isHosted } from "@/lib/auth/hosting";
import { legacyDbPath } from "@/lib/auth/paths";
import { getSessionUser } from "@/lib/auth/session";
import { countUsers } from "@/lib/auth/store";

export const metadata: Metadata = { title: "Create your account" };
export const dynamic = "force-dynamic";

export default async function SignupPage({ searchParams }: PageProps<"/signup">) {
  if (await getSessionUser()) redirect("/app");

  const invite = (await searchParams).invite;

  const host = ((await headers()).get("host") ?? "").split(":")[0];
  const local = host === "localhost" || host === "127.0.0.1";
  const claiming = !isHosted() && local && existsSync(legacyDbPath()) && (await countUsers()) === 0;
  const invited = inviteCode() !== null;

  return (
    <AuthForm
      mode="signup"
      inviteRequired={invited}
      invite={typeof invite === "string" ? invite : undefined}
      notice={
        claiming
          ? "This is the first account on this computer, so the data already here (your Fitbit history, prayers and settings) will move into it."
          : invited && !invite
            ? <WaitlistForm />
            : undefined
      }
    />
  );
}
