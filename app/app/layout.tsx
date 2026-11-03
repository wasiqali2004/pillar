import { TimezoneSync } from "@/components/TimezoneSync";
import { VerifyBanner } from "@/components/auth/VerifyBanner";
import { mailConfigured } from "@/lib/auth/mail";
import { requireUser } from "@/lib/auth/session";

/** Everything under /app needs a real session, not just a cookie that looks like one. */
export default async function AppLayout({ children }: LayoutProps<"/app">) {
  const user = await requireUser();
  return (
    <>
      <TimezoneSync known={user.timezone} />
      {mailConfigured() && !user.emailVerified && <VerifyBanner email={user.email} />}
      {children}
    </>
  );
}
