import type { Metadata } from "next";
import { AuthForm } from "@/components/auth/AuthForm";
import { mailConfigured } from "@/lib/auth/mail";

export const metadata: Metadata = { title: "Reset your password" };
export const dynamic = "force-dynamic";

export default function ForgotPage() {
  return (
    <AuthForm
      mode="forgot"
      notice={
        mailConfigured()
          ? undefined
          : process.env.NODE_ENV === "production"
            ? "Email isn't switched on for this copy of Pillar yet, so reset links can't be sent."
            : "Email isn't switched on yet. On this computer the reset link appears in the server's log instead."
      }
    />
  );
}
