// Shared plumbing for the old-site (JoomShopping) scrape + sync scripts:
// env loading, the two-step admin login, and cookie-jar-aware fetches.

import { existsSync, readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { resolveTarget } from "../lib/target.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const ROOT = path.join(__dirname, "..", "..");
export const OUT_DIR = path.join(__dirname, "data");

function parseEnvFile(file) {
  if (!existsSync(file)) return {};
  return Object.fromEntries(
    readFileSync(file, "utf8")
      .split("\n")
      .filter((line) => line.includes("=") && !line.trim().startsWith("#"))
      .map((line) => {
        const i = line.indexOf("=");
        return [line.slice(0, i).trim(), line.slice(i + 1).trim()];
      }),
  );
}

export function readJoomlaEnv() {
  const env = { ...parseEnvFile(path.join(__dirname, ".env.joomla")), ...process.env };
  const missing = ["JOOMLA_BASE", "JOOMLA_ADMIN_KEY", "JOOMLA_USER", "JOOMLA_PASS"].filter((k) => !env[k]);
  if (missing.length) throw new Error(`Missing in scripts/joomla/.env.joomla: ${missing.join(", ")}`);
  return env;
}

/**
 * Which Supabase project the sync writes into. Pass --env=prod: syncing the live catalogue from the
 * old shop is the whole point, and .env.local now names staging, so without the flag these scripts
 * would quietly rewrite the wrong catalogue and report success.
 */
export function readSupabaseEnv() {
  const { url, key } = resolveTarget({ destructive: true });
  return { url, key };
}

// Minimal cookie jar — Joomla only needs its session cookie echoed back.
export function makeJar() {
  return new Map();
}

function absorb(jar, res) {
  for (const raw of res.headers.getSetCookie?.() ?? []) {
    const [pair] = raw.split(";");
    const i = pair.indexOf("=");
    if (i > 0) jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
  }
}

function cookieHeader(jar) {
  return [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
}

export async function jarFetch(jar, url, init = {}) {
  const res = await fetch(url, {
    ...init,
    redirect: "manual",
    headers: { cookie: cookieHeader(jar), ...(init.headers ?? {}) },
  });
  absorb(jar, res);

  // Joomla redirects after login and after some list actions.
  if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
    return jarFetch(jar, new URL(res.headers.get("location"), url).href, { headers: init.headers });
  }
  return res;
}

/**
 * /administrator is gated twice: an AdminExile-style secret query key has to be
 * present to even reach the login form, then Joomla's own CSRF-token login.
 */
export async function loginToJoomla(env) {
  const jar = makeJar();
  const loginUrl = `${env.JOOMLA_BASE}/administrator/index.php?${env.JOOMLA_ADMIN_KEY}`;

  const form = await (await jarFetch(jar, loginUrl)).text();
  const token = form.match(/name="([a-f0-9]{32})" value="1"/)?.[1];
  if (!token) throw new Error("No CSRF token on the admin login page — is JOOMLA_ADMIN_KEY still valid?");

  const body = new URLSearchParams({
    username: env.JOOMLA_USER,
    // The admin login form posts `passwd`, not `password`.
    passwd: env.JOOMLA_PASS,
    option: "com_login",
    task: "login",
    [token]: "1",
  });

  const html = await (
    await jarFetch(jar, loginUrl, {
      method: "POST",
      body,
      headers: { "content-type": "application/x-www-form-urlencoded" },
    })
  ).text();

  if (html.includes("form-login")) throw new Error("Joomla admin login failed (login form returned)");
  console.log(`Logged in to ${env.JOOMLA_BASE}/administrator as ${env.JOOMLA_USER}`);
  return jar;
}

export async function adminGet(env, jar, query) {
  const res = await jarFetch(jar, `${env.JOOMLA_BASE}/administrator/index.php?${query}`);
  const html = await res.text();
  if (html.includes("form-login")) throw new Error("Admin session expired mid-scrape");
  return html;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Runs `worker` over `items` with at most `concurrency` in flight. */
export async function pool(items, concurrency, worker) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await worker(items[i], i);
      }
    }),
  );
  return results;
}
