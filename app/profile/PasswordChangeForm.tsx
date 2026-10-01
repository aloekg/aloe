"use client";

import { useState } from "react";
import { NETWORK_ERROR, translateError } from "@/app/auth/errors";
import NewPasswordForm from "@/app/auth/NewPasswordForm";
import PasswordField from "@/app/auth/PasswordField";
import { createClient } from "@/lib/supabase-browser";

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
      // Re-authenticate first: secure_password_change is off, so a stolen session could otherwise set a new password.
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
