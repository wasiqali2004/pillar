// Checks a running Pillar from the outside, with no account: node scripts/smoke.mjs https://your-app.fly.dev
const base = (process.argv[2] ?? "http://localhost:3001").replace(/\/+$/, "");
let failed = 0;

function check(name, ok, detail = "") {
  if (!ok) failed += 1;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${!ok && detail ? ` (${detail})` : ""}`);
}

const get = (path, init) => fetch(base + path, { redirect: "manual", signal: AbortSignal.timeout(20_000), ...init });

const health = await get("/api/health");
check("server and disk are healthy", health.status === 200 && (await health.json()).ok === true, `status ${health.status}`);

for (const path of ["/", "/login", "/signup", "/forgot", "/privacy", "/terms", "/manifest.webmanifest", "/sw.js"]) {
  const res = await get(path);
  check(`${path} is public`, res.status === 200, `status ${res.status}`);
}

for (const path of ["/app", "/app/setup", "/app/settings", "/quran", "/welcome"]) {
  const res = await get(path);
  check(`${path} sends strangers to sign in`, res.status === 307 && (res.headers.get("location") ?? "").includes("/login"), `status ${res.status}`);
}

for (const [path, method] of [["/api/account/export", "GET"], ["/api/account/import", "POST"], ["/api/rafiq", "POST"], ["/api/plaid/link-token", "POST"], ["/api/plaid/exchange", "POST"], ["/api/plaid/unlink", "POST"], ["/api/quran/tafsir/1", "GET"]]) {
  const res = await get(path, { method });
  check(`${path} refuses strangers`, res.status === 401, `status ${res.status}`);
  const forged = await get(path, { method, headers: { Cookie: "pillar_session=forged" } });
  check(`${path} refuses a forged cookie`, forged.status === 401, `status ${forged.status}`);
}

for (const path of ["/api/refresh", "/api/cron/unlink-inactive"]) {
  const res = await get(path);
  check(`${path} needs its secret`, res.status === 401 || res.status === 403 || res.status === 503, `status ${res.status}`);
}

for (const path of ["/.env", "/.env.local", "/pillar.db", "/data/auth.db", "/.vapid.json"]) {
  const res = await get(path);
  check(`${path} isn't served`, res.status === 404, `status ${res.status}`);
}

const home = await get("/");
for (const header of ["strict-transport-security", "x-frame-options", "x-content-type-options"]) {
  check(`${header} header is set`, home.headers.has(header));
}
check("the server doesn't advertise what it runs", !home.headers.has("x-powered-by"));

if (base.startsWith("https://")) {
  const plain = await fetch(base.replace("https://", "http://"), { redirect: "manual", signal: AbortSignal.timeout(20_000) });
  check("plain http is sent to https", plain.status >= 300 && plain.status < 400 && (plain.headers.get("location") ?? "").startsWith("https://"), `status ${plain.status}`);
}

console.log(failed ? `\n${failed} check(s) failed.` : "\nAll checks passed.");
process.exit(failed ? 1 : 0);
