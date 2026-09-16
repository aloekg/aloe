"use client";

import { useState } from "react";
import Button from "@/components/Button";
import PasswordField from "./PasswordField";
import PasswordHints from "./PasswordHints";
import { validateNewPassword, type AuthFieldErrors } from "./validation";

type Props = {
  submitLabel: string;
  /** Returns an error message to display, or null on success. */
  onSubmit: (password: string) => Promise<string | null>;
  /** Blocks the email-as-password rule from firing where the address is known. */
  email?: string;
  /** Rendered above the new-password fields — the profile puts the current password here. */
  before?: React.ReactNode;
};

/**
 * The "choose a new password" pair, shared by the reset screen and the profile.
 *
 * It owns nothing but the two fields: the caller decides what "submit" means, which is what lets
 * the profile verify the current password first without this component knowing about it.
 */
export default function NewPasswordForm({ submitLabel, onSubmit, email, before }: Props) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Quiet until the first submit, then live on every keystroke — the same behaviour as the
  // registration form, so a fixed field clears its own error immediately.
  const fieldErrors: AuthFieldErrors = submitted ? validateNewPassword({ password, confirm, email }) : {};

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;

    setSubmitted(true);
    setError("");
    if (Object.keys(validateNewPassword({ password, confirm, email })).length > 0) return;

    setLoading(true);
    const message = await onSubmit(password);
    setLoading(false);

    if (message) return setError(message);
    setPassword("");
    setConfirm("");
    setSubmitted(false);
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      {before}

      <PasswordField
        label="Новый пароль"
        name="password"
        value={password}
        onChange={setPassword}
        autoComplete="new-password"
        placeholder="Придумайте пароль"
        error={fieldErrors.password}
      >
        <PasswordHints password={password} />
      </PasswordField>

      <PasswordField
        label="Повторите пароль"
        name="confirm-password"
        value={confirm}
        onChange={setConfirm}
        autoComplete="new-password"
        placeholder="Ещё раз"
        error={fieldErrors.confirm}
      />

      {error && (
        <p role="alert" className="text-red-600 text-sm bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      <Button type="submit" variant="primary" disabled={loading} className="w-full py-2">
        {loading ? "Сохраняем..." : submitLabel}
      </Button>
    </form>
  );
}
