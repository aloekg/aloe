// Sets a user's password directly through the Auth admin API.
//
// It exists because there is no other way. The dashboard's user row offers "send password
// recovery", and that link is a dead end on this site: app/auth/confirm/route.ts verifies the
// recovery token and then immediately signs the session out, and there is no "set a new password"
// page to land on — nor a "forgot password" link on the sign-in form. So an admin who loses their
// password currently has no route back in, and a password that needs rotating has nowhere to be
// rotated.
//
// The new password is read from the terminal with echo off, or generated with --generate. It is
// never a command-line argument: argv is visible to `ps` and lands in shell history.
//
// Usage:
//   node scripts/set-user-password.mjs --env=prod --email=someone@example.com                      dry run
//   node scripts/set-user-password.mjs --env=prod --email=... --execute --i-know-this-is-production
//   node scripts/set-user-password.mjs --env=stage --email=... --execute --generate
//
//   --generate          make a 20-character password and print it once, instead of prompting
//   --revoke-sessions   also sign the account out everywhere, so cookies issued under the old
//                       password stop working (changing a password does not do this by itself)

import { randomInt } from "node:crypto";
import { createInterface } from "node:readline";
import { Writable } from "node:stream";
import { createClient } from "@supabase/supabase-js";
import { resolveTarget } from "./lib/target.mjs";

const target = resolveTarget({ destructive: true, allow: ["stage", "prod"] });
const email = process.argv.find((a) => a.startsWith("--email="))?.slice(8);
if (!email) die("Pass --email=<address>.");

const GENERATE = process.argv.includes("--generate");
const REVOKE = process.argv.includes("--revoke-sessions");

/**
 * Mirrors GoTrue's configured rules (supabase/config.toml: minimum_password_length = 8,
 * password_requirements = "lower_upper_letters_digits"), which app/auth/validation.ts mirrors on
 * the client. Duplicated rather than imported because these scripts are plain ESM with no TS step —
 * if the config changes, all three move together.
 */
function passwordProblem(value) {
  if (value.length < 8) return "shorter than 8 characters";
  if (!/[a-z]/.test(value)) return "no lowercase latin letter";
  if (!/[A-Z]/.test(value)) return "no uppercase latin letter";
  if (!/[0-9]/.test(value)) return "no digit";
  return null;
}

/** Excludes the character pairs that get misread when a password is copied off a screen. */
function generatePassword(length = 20) {
  const alphabet = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  do {
    out = Array.from({ length }, () => alphabet[randomInt(alphabet.length)]).join("");
  } while (passwordProblem(out));
  return out;
}

function ask(question, { hidden = false } = {}) {
  return new Promise((resolve) => {
    let muted = false;
    const output = new Writable({
      write(chunk, encoding, callback) {
        if (!muted) process.stdout.write(chunk, encoding);
        callback();
      },
    });
    const rl = createInterface({ input: process.stdin, output, terminal: true });
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write("\n");
      resolve(answer);
    });
    muted = hidden;
  });
}

const db = createClient(target.url, target.key, { auth: { persistSession: false } });

// listUsers rather than a filter: the admin API has no lookup-by-email, and these projects hold
// tens of accounts, not thousands.
const { data, error } = await db.auth.admin.listUsers({ perPage: 1000 });
if (error) die(`Could not list users: ${error.message}`);

const user = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
if (!user) die(`No account with email ${email} on ${target.name}.`);

console.log(`\n${user.email}`);
console.log(`  id:   ${user.id}`);
console.log(`  role: ${user.app_metadata?.role ?? "(none)"}`);
console.log(`  last sign-in: ${user.last_sign_in_at ?? "never"}`);

if (!target.execute) {
  console.log("\nDry run. Re-run with --execute to set a new password.");
  process.exit(0);
}

let password;
if (GENERATE) {
  password = generatePassword();
  console.log(`\nGenerated password: ${password}`);
  console.log("Copy it now — it is printed once and stored nowhere.");
} else {
  password = await ask("\nNew password (not shown): ", { hidden: true });
  const problem = passwordProblem(password);
  if (problem) die(`That password would be rejected by the server: ${problem}.`);
  const again = await ask("Repeat it: ", { hidden: true });
  if (again !== password) die("The two entries differ. Nothing was changed.");
}

const { error: updateError } = await db.auth.admin.updateUserById(user.id, { password });
if (updateError) die(`Could not set the password: ${updateError.message}`);
console.log(`\nPassword updated for ${user.email}.`);

if (REVOKE) {
  const { error: signOutError } = await db.auth.admin.signOut(user.id, "global");
  if (signOutError) console.error(`Password changed, but sessions were not revoked: ${signOutError.message}`);
  else console.log("All existing sessions revoked — every device has to sign in again.");
} else {
  console.log("Sessions issued under the old password are still valid. Pass --revoke-sessions to end them.");
}

function die(message) {
  console.error(`\n${message}\n`);
  process.exit(1);
}
