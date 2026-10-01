// Mirrors the password settings in supabase/config.toml; tests/auth-validation.test.ts pins them.

export const PASSWORD_MIN_LENGTH = 8;

// Must not be shorter than [auth.email] max_frequency in supabase/config.toml.
export const RESEND_COOLDOWN_SECONDS = 60;

// bcrypt ignores everything past 72 bytes; counted in bytes, not characters.
export const PASSWORD_MAX_BYTES = 72;

// Deliberately loose: the confirmation email is the real check.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email);
}

export function passwordByteLength(password: string): number {
  return new TextEncoder().encode(password).length;
}

export type PasswordRule = { label: string; ok: boolean };

// ASCII classes on purpose: GoTrue checks literal a-z/A-Z/0-9, so Cyrillic must not pass here.
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

// Advisory only — never gates submission.
export function passwordStrength(password: string): PasswordStrength {
  if (!password) return { score: 0, label: "", barClass: "w-0 bg-transparent" };

  if (!passwordRules(password).every((rule) => rule.ok)) return { score: 1, ...STRENGTH_LEVELS[1] };

  let points = 0;
  if (password.length >= 10) points++;
  if (password.length >= 14) points++;
  if (password.length >= 18) points++;
  if (/[^a-zA-Z0-9]/.test(password)) points++;

  // +2, so the floor for a valid password is «Простой», never the red «Слабый».
  const score = Math.min(4, points + 2) as 1 | 2 | 3 | 4;
  return { score, ...STRENGTH_LEVELS[score] };
}

export type AuthField = "email" | "password" | "confirm";
export type AuthFieldErrors = Partial<Record<AuthField, string>>;

export function validateResetForm(email: string): AuthFieldErrors {
  const value = email.trim();
  if (!value) return { email: "Введите email" };
  if (!isValidEmail(value)) return { email: "Похоже, в адресе опечатка" };
  return {};
}

export function validateNewPassword(values: { password: string; confirm: string; email?: string }): AuthFieldErrors {
  const errors: AuthFieldErrors = {};

  if (!values.password) {
    errors.password = "Введите пароль";
    return errors;
  }

  if (passwordRules(values.password).some((rule) => !rule.ok)) errors.password = "Пароль не отвечает требованиям ниже";
  else if (passwordByteLength(values.password) > PASSWORD_MAX_BYTES) errors.password = "Пароль слишком длинный";
  else if (values.email && values.password.toLowerCase() === values.email.trim().toLowerCase())
    errors.password = "Пароль не должен совпадать с email";

  if (!values.confirm) errors.confirm = "Повторите пароль";
  else if (values.confirm !== values.password) errors.confirm = "Пароли не совпадают";

  return errors;
}

// Registration rules must not apply to login: older accounts have 6-character passwords.
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
