import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";
import {
  isValidEmail,
  PASSWORD_MAX_BYTES,
  PASSWORD_MIN_LENGTH,
  passwordRules,
  passwordStrength,
  RESEND_COOLDOWN_SECONDS,
  validateAuthForm,
} from "@/app/auth/validation";

const ok = (password: string) => passwordRules(password).every((rule) => rule.ok);
const register = (values: Partial<{ email: string; password: string; confirm: string }>) =>
  validateAuthForm("register", { email: "user@example.com", password: "Parol123", confirm: "Parol123", ...values });

describe("isValidEmail", () => {
  it.each(["user@example.com", "a.b+tag@sub.example.co.uk", "user@aloe.kg"])("accepts %s", (email) => {
    expect(isValidEmail(email)).toBe(true);
  });

  // The common typos, not an RFC test suite — the confirmation email is the real check.
  it.each(["ivan@gmail", "ivan", "@example.com", "ivan @example.com", "ivan@@example.com", ""])(
    "rejects %j",
    (email) => {
      expect(isValidEmail(email)).toBe(false);
    },
  );
});

describe("passwordRules", () => {
  it("matches the project's lower_upper_letters_digits requirement", () => {
    expect(ok("Parol123")).toBe(true);
    expect(ok("parol123")).toBe(false); // no uppercase
    expect(ok("PAROL123")).toBe(false); // no lowercase
    expect(ok("ParolParol")).toBe(false); // no digit
    expect(ok("Parol12")).toBe(false); // one short of PASSWORD_MIN_LENGTH
  });

  // GoTrue tests against literal a-z / A-Z sets, so a Cyrillic password it would reject as weak
  // must not be shown as satisfying the checklist.
  it("does not count Cyrillic letters as upper/lowercase", () => {
    expect(ok("Пароль123")).toBe(false);
    expect(ok("Пароль123a")).toBe(false); // lowercase ASCII only
    expect(ok("Пароль123aA")).toBe(true);
  });
});

describe("passwordStrength", () => {
  it("says nothing for an empty password", () => {
    expect(passwordStrength("").score).toBe(0);
  });

  // The bar scores what goes beyond the mandatory rules, so the shortest valid password must not
  // already read as strong — otherwise the meter conveys nothing.
  it("rates the minimum valid password as weak and rises with length", () => {
    expect(passwordStrength("Parol123").score).toBe(1);
    expect(passwordStrength("Parol12345").score).toBe(2);
    expect(passwordStrength("Parol123456789").score).toBe(3);
    expect(passwordStrength("Parol1234567890123").score).toBe(4);
  });

  it("credits a symbol", () => {
    expect(passwordStrength("Parol123!").score).toBeGreaterThan(passwordStrength("Parol1234").score);
  });
});

describe("validateAuthForm", () => {
  it("accepts a valid registration", () => {
    expect(register({})).toEqual({});
  });

  it("requires the confirmation to match", () => {
    expect(register({ confirm: "Parol124" }).confirm).toBeDefined();
    expect(register({ confirm: "" }).confirm).toBeDefined();
  });

  it("rejects a password equal to the email", () => {
    expect(
      register({ email: "Parol123@mail.ru", password: "Parol123@mail.ru", confirm: "Parol123@mail.ru" }).password,
    ).toBeDefined();
  });

  // bcrypt ignores everything past 72 bytes, so a longer password is not the password the user
  // thinks they set. Cyrillic is 2 bytes per letter, which is why the limit is counted in bytes.
  it("rejects passwords past the bcrypt truncation limit", () => {
    const long = "Aa1" + "x".repeat(PASSWORD_MAX_BYTES);
    expect(register({ password: long, confirm: long }).password).toBeDefined();

    const cyrillic = "Aa1" + "я".repeat(PASSWORD_MAX_BYTES / 2);
    expect(register({ password: cyrillic, confirm: cyrillic }).password).toBeDefined();
  });

  // Accounts predating these rules have 6-character passwords. Validating them on the login form
  // would lock those users out of the only place they could change the password from.
  it("does not apply the registration rules when logging in", () => {
    expect(validateAuthForm("login", { email: "user@example.com", password: "abc123", confirm: "" })).toEqual({});
  });

  it("still requires both fields when logging in", () => {
    expect(validateAuthForm("login", { email: "", password: "", confirm: "" })).toEqual({
      email: "Введите email",
      password: "Введите пароль",
    });
  });
});

// The client checklist is only useful if it agrees with what the server enforces. These two
// settings live in the Supabase dashboard; supabase/config.toml is the tracked copy of them, and
// this pins the client to it so the pair cannot drift apart unnoticed again.
describe("agreement with supabase/config.toml", () => {
  const config = readFileSync(fileURLToPath(new URL("../supabase/config.toml", import.meta.url)), "utf8");

  it("uses the same minimum password length", () => {
    expect(config).toMatch(new RegExp(`^minimum_password_length = ${PASSWORD_MIN_LENGTH}$`, "m"));
  });

  it("enforces the same character requirements", () => {
    expect(config).toMatch(/^password_requirements = "lower_upper_letters_digits"$/m);
  });

  // Scoped to the [auth.email] block: [auth.sms] carries a max_frequency of its own, and a plain
  // file-wide match would happily pass on the wrong one.
  it("waits at least as long as GoTrue does before allowing a resend", () => {
    const emailSection = config.slice(config.indexOf("[auth.email]")).split(/^\[auth\.(?!email\])/m)[0];
    const maxFrequency = emailSection.match(/^max_frequency = "(\d+)s"$/m);

    expect(maxFrequency, "[auth.email] max_frequency not found or not in whole seconds").not.toBeNull();
    expect(RESEND_COOLDOWN_SECONDS).toBeGreaterThanOrEqual(Number(maxFrequency![1]));
  });
});
