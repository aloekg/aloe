// Prints the Supabase project ref an environment's env file points at, for `supabase link`.
// stdout carries the ref alone; resolveTarget's banner goes to stderr, so `$(...)` stays clean.
//
//   npx supabase link --project-ref $(node scripts/print-ref.mjs --env=stage)

import { resolveTarget } from "./lib/target.mjs";

process.stdout.write(resolveTarget().ref);
