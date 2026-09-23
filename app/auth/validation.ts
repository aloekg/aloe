/**
 * Client-side rules for the auth form. These only shape the UI — Supabase is the authority and
 * enforces `minimum_password_length` / `password_requirements` itself. The rules here mirror
 * those settings (see supabase/config.toml) so the form never accepts a password the server then
 * rejects as weak; tests/auth-validation.test.ts fails if the two drift apart.
 */

export const PASSWORD_MIN_LENGTH = 8;

/**
 * How long the resend button on the "confirm your email" screen stays disabled. Must not be
 * shorter than `[auth.email] max_frequency` in supabase/config.toml (the dashboard calls it SMTP
 * "Minimum interval per user") — re-enabling early only walks the user into a rate-limit error.
 * Kept here rather than in page.tsx so the test suite can pin it to the config.
 */
export const RESEND_COOLDOWN_SECONDS = 60;

/**
 * GoTrue hashes with bcrypt, which ignores everything past 72 *bytes*. A longer password would
 * look accepted while its tail silently does nothing — two passwords differing only after byte 72
 * would both log in. Counted in bytes, not characters: Cyrillic costs 2 bytes per letter in UTF-8,
 * so a 40-character Russian passphrase already sits near the limit.
 */
export const PASSWORD_MAX_BYTES = 72;

/**
 * Deliberately loose. The only authority on whether an address exists is the confirmation email,
 * so this catches typos ("ivan@gmail" with no TLD) without rejecting the valid-but-unusual
 * addresses a stricter pattern always ends up refusing.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email);
}

export function passwordByteLength(password: string): number {
  return new TextEncoder().encode(password).length;
}

export type PasswordRule = { label: string; ok: boolean };

/**
 * The live checklist under the password field while registering. It mirrors the project's
 * `password_requirements = "lower_upper_letters_digits"` exactly.
 *
 * The character classes are ASCII on purpose, not `\p{Ll}`/`\p{Lu}`: GoTrue checks these against
 * literal a-z / A-Z / 0-9 sets, so "Пароль123" satisfies a Unicode test here and is still
 * rejected by the server as weak. Matching its narrower definition keeps the checklist honest —
 * anything shown as ✓ is a password the server will actually accept.
 */
export function passwordRules(password: string): PasswordRule[] {
  return [
    { label: `Минимум ${PASSWORD_MIN_LENGTH} символов`, ok: password.length >= PASSWORD_MIN_LENGTH },
    { label: "Строчная и заглавная латинские буквы", ok: /[a-z]/.test(password) && /[A-Z]/.test(password) },
    { label: "Хотя бы одна цифра", ok: /[0-9]/.test(password) },
  ];
}

export type PasswordStrength = { score: 0 | 1 | 2 | 3 | 4; label: string; barClass: string };

const STRENGTH_LEVELS: Record<1 | 2 | 3 | 4, Omit<PasswordStrength, "score">> = {
  1: { label: "Слабый", barClass: "w-1/4 bg-red-500" },
  2: { label: "Простой", barClass: "w-2/4 bg-orange-500" },
  3: { label: "Средний", barClass: "w-3/4 bg-yellow-500" },
  4: { label: "Надёжный", barClass: "w-full bg-green-700" },
};

/**
 * Advisory only — never gates submission.
 *
 * Beyond the mandatory rules it scores length and a symbol, not the upper/lower/digit mix: awarding
 * points for those would mean every password passing `passwordRules` already reads "Надёжный", and
 * a meter that fills the moment the form is valid tells the user nothing. Length is what is left,
 * and it is what actually buys entropy — far more than swapping an `a` for an `@`.
 *
 * **The bar agrees with the checklist above it, in both directions.** It used to disagree in both:
 * the shortest valid password showed a red "Слабый" beside three green ticks — "you satisfied
 * everything and it is bad" — while a long all-lowercase password showed a green "Надёжный" the
 * form would refuse to accept. So red now means exactly one thing, "this will not be accepted",
 * and a password that clears the rules starts at "Простой" and climbs from there.
 */
export function passwordStrength(password: string): PasswordStrength {
  if (!password) return { score: 0, label: "", barClass: "w-0 bg-transparent" };

  // Nothing else matters while a rule is unmet — length cannot make an invalid password good.
  if (!passwordRules(password).every((rule) => rule.ok)) return { score: 1, ...STRENGTH_LEVELS[1] };

  let points = 0;
  if (password.length >= 10) points++;
  if (password.length >= 14) points++;
  if (password.length >= 18) points++;
  if (/[^a-zA-Z0-9]/.test(password)) points++;

  // +2, so the floor for a valid password is "Простой" rather than the red "Слабый".
  const score = Math.min(4, points + 2) as 1 | 2 | 3 | 4;
  return { score, ...STRENGTH_LEVELS[score] };
}

export type AuthField = "email" | "password" | "confirm";
export type AuthFieldErrors = Partial<Record<AuthField, string>>;

/** The reset form asks for an address and nothing else. */
export function validateResetForm(email: string): AuthFieldErrors {
  const value = email.trim();
  if (!value) return { email: "Введите email" };
  if (!isValidEmail(value)) return { email: "Похоже, в адресе опечатка" };
  return {};
}

/**
 * The rules for a password being *set* — registration, a reset, or a change from the profile.
 * One definition so the three screens cannot drift apart, and so a password accepted by one is
 * accepted by all of them.
 *
 * `email` is optional because the reset screen does not ask for one: at that point the address is
 * established by the recovery link rather than typed.
 */
export function validateNewPassword(values: { password: string; confirm: string; email?: string }): AuthFieldErrors {
  const errors: AuthFieldErrors = {};

  if (!values.password) {
    errors.password = "Введите пароль";
    return errors;
  }

  // No need to spell the failure out — the live checklist sits directly under the field and
  // already marks which requirement is missing.
  if (passwordRules(values.password).some((rule) => !rule.ok)) errors.password = "Пароль не отвечает требованиям ниже";
  else if (passwordByteLength(values.password) > PASSWORD_MAX_BYTES) errors.password = "Пароль слишком длинный";
  else if (values.email && values.password.toLowerCase() === values.email.trim().toLowerCase())
    errors.password = "Пароль не должен совпадать с email";

  if (!values.confirm) errors.confirm = "Повторите пароль";
  else if (values.confirm !== values.password) errors.confirm = "Пароли не совпадают";

  return errors;
}

/**
 * `mode` matters: the registration rules must NOT be applied when signing in. Accounts created
 * before these rules existed have 6-character passwords, and validating them on the login form
 * would lock those users out of their own accounts with a message about a password they cannot
 * change without first logging in.
 *
 * That last clause stopped being true: /auth/new-password now changes a password without one.
 * The reasoning still holds for the login form itself — an old short password must keep working
 * until its owner chooses to replace it.
 */
export function validateAuthForm(
  mode: "login" | "register",
  values: { email: string; password: string; confirm: string },
): AuthFieldErrors {
  const errors: AuthFieldErrors = {};
  const email = values.email.trim();

  if (!email) errors.email = "Введите email";
  else if (!isValidEmail(email)) errors.email = "Похоже, в адресе опечатка";

  if (!values.password) {
    errors.password = "Введите пароль";
    return errors;
  }

  if (mode === "login") return errors;

  return { ...errors, ...validateNewPassword({ ...values, email }) };
}
