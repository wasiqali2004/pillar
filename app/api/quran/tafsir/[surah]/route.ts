import type { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { getTafsir } from "@/lib/quran/source";
import { isTafsirId } from "@/lib/quran/types";

/**
 * Commentary loads on demand rather than with the page: it is only needed when
 * the context toggle is on, and for a long surah it outweighs the Quran text
 * several times over.
 */
export async function GET(req: NextRequest, ctx: RouteContext<"/api/quran/tafsir/[surah]">) {
  if (!(await getSessionUser())) return Response.json({ error: "Please sign in." }, { status: 401 });

  const surah = Number((await ctx.params).surah);
  const source = Number(req.nextUrl.searchParams.get("source") ?? 169);

  if (!Number.isInteger(surah) || surah < 1 || surah > 114 || !isTafsirId(source)) {
    return Response.json({ error: "Unknown surah or commentary source." }, { status: 400 });
  }

  try {
    const payload = await getTafsir(surah, source);
    return Response.json(payload, {
      headers: { "cache-control": "private, max-age=86400" },
    });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Commentary unavailable." },
      { status: 502 },
    );
  }
}
