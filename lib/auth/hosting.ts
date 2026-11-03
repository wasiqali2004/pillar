import "server-only";

/**
 * What changes once Pillar runs on a public server. PILLAR_URL is the switch:
 * with it set, nothing about a request (its Host header, who signed up first)
 * is trusted to decide who owns the place or where a reset link points.
 */
export function hostedUrl() {
  return process.env.PILLAR_URL?.replace(/\/+$/, "") || null;
}

export function isHosted() {
  return hostedUrl() !== null;
}

/** On a server, only the named email is the owner. At home, the first account is. */
export function isOwnerSignup(email: string, firstAccount: boolean) {
  if (!isHosted()) return firstAccount;
  const owner = process.env.PILLAR_OWNER_EMAIL?.trim().toLowerCase();
  return Boolean(owner) && email.trim().toLowerCase() === owner;
}

/**
 * While set, signing up needs this code. Every account can spend Rafiq messages
 * on the owner's bill and emails aren't verified yet, so sign-ups stay closed
 * until the owner removes it.
 */
export function inviteCode() {
  return process.env.PILLAR_INVITE_CODE?.trim() || null;
}

/** Shown on the privacy and terms pages. */
export function contactEmail() {
  return process.env.PILLAR_CONTACT_EMAIL?.trim() || null;
}
