/**
 * Moves a downloaded Google OAuth client file into .env.local.
 *
 * Deliberately never prints the client secret, and never returns it to
 * whatever is running this script: the values go from the JSON straight into
 * the env file, and only a masked confirmation comes back out. That keeps the
 * secret out of terminal scrollback, logs and transcripts.
 *
 * Usage:
 *   node scripts/install-google-health.mjs <path-to-client_secret.json> [port]
 */
import { readFileSync, writeFileSync, existsSync, copyFileSync } from "node:fs";
import { resolve } from "node:path";

const [, , file, portArg] = process.argv;
if (!file) {
  console.error("Usage: node scripts/install-google-health.mjs <client_secret.json> [port]");
  process.exit(1);
}

const port = portArg ?? "3001";
const envPath = resolve(process.cwd(), ".env.local");

let parsed;
try {
  parsed = JSON.parse(readFileSync(file, "utf8"));
} catch (e) {
  console.error(`Could not read ${file}: ${e.message}`);
  process.exit(1);
}

const cfg = parsed.web ?? parsed.installed;
if (!cfg?.client_id || !cfg?.client_secret) {
  console.error("That file has no web client_id/client_secret. Is it the OAuth client JSON?");
  process.exit(1);
}

const redirect = `http://localhost:${port}/api/auth/google-health/callback`;

// Google lists every redirect URI it will accept. If the one this app will
// send isn't among them, the connection dies at Google's screen with
// redirect_uri_mismatch — far easier to catch here than to debug there.
const allowed = cfg.redirect_uris ?? [];
if (allowed.length > 0 && !allowed.includes(redirect)) {
  console.error(`The client does not allow ${redirect}`);
  console.error(`It allows: ${allowed.join(", ")}`);
  process.exit(1);
}

const vars = {
  GOOGLE_HEALTH_CLIENT_ID: cfg.client_id,
  GOOGLE_HEALTH_CLIENT_SECRET: cfg.client_secret,
  GOOGLE_HEALTH_REDIRECT_URI: redirect,
};

let env = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
if (existsSync(envPath)) copyFileSync(envPath, `${envPath}.bak`);

for (const [key, value] of Object.entries(vars)) {
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, "m");
  env = re.test(env) ? env.replace(re, line) : `${env.replace(/\s*$/, "")}\n${line}\n`;
}

if (!/# Google Health/.test(env)) {
  env = env.replace(
    /^GOOGLE_HEALTH_CLIENT_ID=/m,
    "# Google Health (Fitbit, Pixel Watch, Android) — created in Google Cloud.\nGOOGLE_HEALTH_CLIENT_ID=",
  );
}

writeFileSync(envPath, env);

const mask = (s) => `${s.slice(0, 6)}…${s.slice(-4)} (${s.length} chars)`;
console.log("Written to .env.local (previous version saved as .env.local.bak):");
console.log(`  GOOGLE_HEALTH_CLIENT_ID      ${mask(cfg.client_id)}`);
console.log(`  GOOGLE_HEALTH_CLIENT_SECRET  ${mask(cfg.client_secret)}`);
console.log(`  GOOGLE_HEALTH_REDIRECT_URI   ${redirect}`);
