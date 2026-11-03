import type { Metadata, Viewport } from "next";
import { Outfit, Geist_Mono } from "next/font/google";
import "./globals.css";
import { BRAND } from "@/lib/brand";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: `${BRAND.name}: ${BRAND.tagline}`, template: `%s · ${BRAND.name}` },
  description: BRAND.description,
  applicationName: BRAND.name,
  // iPhone "Add to Home Screen": open full screen with the app's own name and icon.
  appleWebApp: { capable: true, title: BRAND.name, statusBarStyle: "black-translucent" },
  icons: { icon: { url: "/favicon.png", type: "image/png" }, apple: "/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: "#15152a",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${outfit.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col text-ink">
        {children}
      </body>
    </html>
  );
}
