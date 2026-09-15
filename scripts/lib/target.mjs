// Resolves which Supabase project a maintenance script is about to open, and refuses the
// combinations that lose data.
//
// Every script here used to hand-parse the repo-root .env.local at a fixed path. That was fine
// while there was one database. With two it is a loaded gun, and prune-orphan-images.mjs shows why:
// it lists the objects in a storage bucket, subtracts everything `products` references, and deletes
// the remainder. Point it at staging's rows while its URL still names production and it erases the
// whole catalogue's photography — from a dry run that looked entirely normal, against the one thing
// in this project that has no backup (backups/backup-db.mjs copies tables, never storage).
//
// So: --env is mandatory and has no default, because every default is wrong for some caller. A
// backup wants production. A seed must never see it.
//
//   node scripts/<name>.mjs --env=stage
//   node scripts/<name>.mjs --env=prod --execute --i-know-this-is-production

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Production's project ref, written down once so a check against it cannot drift. */
export const PROD_REF = "dnlburbuchxzxdmhuczu";

/**
 * .env.prod rather than .env.production: Next auto-loads .env.production and .env.production.local,
 * so production credentials under either name would be picked up by a local `npm run build`.
 */
const ENV_FILES = { stage: ".env.local", prod: ".env.prod" };

export function parseEnvFile(file) {
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

/**
 * @param {object}   [options]
 * @param {boolean}  [options.destructive] writing to production needs --i-know-this-is-production
 * @param {string[]} [options.allow]       environments this script may open at all
 * @returns {{name: string, ref: string, isProd: boolean, url: string, key: string, execute: boolean, env: Record<string,string>}}
 */
export function resolveTarget({ destructive = false, allow = ["stage", "prod"] } = {}) {
  const named = process.argv.find((a) => a.startsWith("--env="))?.slice(6);
  if (!named) die(`Pass --env=${allow.join(" or --env=")}. There is no default.`);
  if (!ENV_FILES[named]) die(`Unknown --env=${named}. Use --env=stage or --env=prod.`);
  if (!allow.includes(named)) die(`This script may only run against: ${allow.join(", ")}.`);

  const file = path.join(ROOT, ENV_FILES[named]);
  if (!existsSync(file)) {
    die(`${ENV_FILES[named]} does not exist. See .env.example — it explains which file holds what.`);
  }

  const env = parseEnvFile(file);
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) die(`${ENV_FILES[named]} is missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.`);

  // The ref is re-derived from the URL that was actually loaded, never inferred from the file name.
  // An .env.local someone pointed back at production is caught here, not three thousand deletes
  // later. Callers build their storage prefixes from this same `url`, so the table and the bucket
  // can no longer disagree about which project they mean.
  let ref;
  try {
    ref = new URL(url).hostname.split(".")[0];
  } catch {
    die(`${ENV_FILES[named]}: NEXT_PUBLIC_SUPABASE_URL is not a URL ("${url}").`);
  }
  const isProd = ref === PROD_REF;

  if (named === "prod" && !isProd) die(`--env=prod, but ${ENV_FILES.prod} points at "${ref}", not production.`);
  if (named === "stage" && isProd) die(`--env=stage, but ${ENV_FILES.stage} points at PRODUCTION. Refusing.`);
  if (!allow.includes("prod") && isProd) die(`This script must never touch production (${ref}). Refusing.`);

  const execute = process.argv.includes("--execute");
  if (destructive && execute && isProd && !process.argv.includes("--i-know-this-is-production")) {
    die(
      `Refusing to write to PRODUCTION (${ref}).\n` +
        `If that is genuinely the intent, add --i-know-this-is-production.`,
    );
  }

  // stderr, every run, dry or not. The commonest way to lose data with these scripts is simply not
  // knowing which database just opened.
  console.error(`→ ${named} (${ref})  ${execute ? "EXECUTE" : "dry run"}`);

  return { name: named, ref, isProd, url, key, execute, env };
}

function die(message) {
  console.error(`\n${message}\n`);
  process.exit(1);
}
