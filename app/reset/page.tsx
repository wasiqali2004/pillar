import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth/AuthForm";

export const metadata: Metadata = { title: "Choose a new password" };

export default async function ResetPage({ searchParams }: PageProps<"/reset">) {
  const { token } = await searchParams;
  if (typeof token !== "string" || !token) redirect("/forgot");
  return <AuthForm mode="reset" token={token} />;
}
