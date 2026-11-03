import { Amiri_Quran, EB_Garamond } from "next/font/google";
import "./quran.css";
import { requireUser } from "@/lib/auth/session";

/**
 * Fonts load only under /quran — the dashboard never pays for them.
 *
 * Amiri Quran is built for the Uthmani script: it places the small high
 * letters, sukun variants and dagger alef that general Arabic fonts drop or
 * collide. A book serif carries the translation so it reads as a page, not UI.
 */
const quranFont = Amiri_Quran({
  weight: "400",
  subsets: ["arabic"],
  variable: "--font-quran",
  display: "swap",
});

const bookFont = EB_Garamond({
  subsets: ["latin", "latin-ext"],
  variable: "--font-book",
  display: "swap",
});

export default async function QuranLayout({ children }: LayoutProps<"/quran">) {
  await requireUser();
  return (
    <div className={`${quranFont.variable} ${bookFont.variable} flex flex-1 flex-col`}>
      {children}
    </div>
  );
}
