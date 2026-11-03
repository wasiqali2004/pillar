"use server";

import { revalidatePath } from "next/cache";
import {
  savePosition,
  toggleBookmark,
  addNote,
  updateNote,
  deleteNote,
} from "./store";
import type { Bookmark } from "./types";

/**
 * The reader's server boundary. Page turns don't revalidate — the reader
 * holds its own state, and re-rendering the route on every turn would refetch
 * the surah for nothing. The library does need the new position, so it is
 * revalidated.
 */

export async function savePositionAction(surah: number, ayah: number, page: number) {
  await savePosition(surah, ayah, page);
  revalidatePath("/quran");
}

export async function toggleBookmarkAction(
  surah: number,
  ayah: number,
  kind: Bookmark["kind"],
) {
  const r = await toggleBookmark(surah, ayah, kind);
  revalidatePath("/quran");
  return r;
}

export async function addNoteAction(surah: number, ayah: number | null, body: string) {
  return addNote(surah, ayah, body);
}

export async function updateNoteAction(id: number, body: string) {
  return updateNote(id, body);
}

export async function deleteNoteAction(id: number) {
  return deleteNote(id);
}
