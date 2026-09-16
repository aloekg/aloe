"use client";

import { useState } from "react";
import { NETWORK_ERROR, translateError } from "@/app/auth/errors";
import NewPasswordForm from "@/app/auth/NewPasswordForm";
import PasswordField from "@/app/auth/PasswordField";
import { createClient } from "@/lib/supabase-browser";

/**
 * Changing the password from inside the account. Shares its fields, rules and wording with the
 * reset screen — the components live under app/auth because that is where a password is otherwise
 * set, not because this belongs to the auth route.
 */
export default function PasswordChangeForm({ email }: { email: string }) {
  const [current, setCurrent] = useState("");
  const [currentError, setCurrentError] = useState("");
  const [done, setDone] = useState(false);
  const supabase = createClient();

  async function handleSubmit(password: string): Promise<string | null> {
    setCurrentError("");
    setDone(false);

    if (!current) {
      setCurrentError("Введите текущий пароль");
      return null;
    }

    try {
      // Re-authenticate before changing anything. The project has `secure_password_change = false`
      // (supabase/config.toml), so GoTrue itself would accept the change on the strength of the
      // session cookie alone — which means a stolen session could set a new password and lock the
      // owner out of their own account. There is no "verify my password" endpoint, so signing in
      // is the check; on success it simply refreshes the session for the same user.
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password: current });
      if (authError) {
        setCurrentError(
          authError.code === "invalid_credentials" ? "Неверный текущий пароль" : translateError(authError),
        );
        return null;
      }

      if (password === current) {
        setCurrentError("Новый пароль совпадает с текущим");
        return null;
      }

      const { error } = await supabase.auth.updateUser({ password });
      if (error) return translateError(error);

      // Other devices keep working here, unlike after a reset: a deliberate change from inside a
      // live session is not evidence that anything leaked, and silently signing someone out of
      // their phone because they tidied up their password is its own kind of surprise.
      setCurrent("");
      setDone(true);
      return null;
    } catch {
      return NETWORK_ERROR;
    }
  }

  return (
    <div className="border border-gray-300 rounded-xl p-5 mb-8">
      <h3 className="font-medium mb-4">Сменить пароль</h3>

      <NewPasswordForm
        submitLabel="Сохранить пароль"
        onSubmit={handleSubmit}
        email={email}
        before={
          <PasswordField
            label="Текущий пароль"
            name="password"
            value={current}
            onChange={(value) => {
              setCurrent(value);
              setCurrentError("");
            }}
            autoComplete="current-password"
            placeholder="Ваш пароль"
            error={currentError || undefined}
          />
        }
      />

      {done && (
        <p role="status" className="mt-3 text-sm text-green-700 bg-green-50 rounded-lg px-3 py-2">
          Пароль изменён.
        </p>
      )}
    </div>
  );
}
