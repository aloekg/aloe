"use client";

import { Suspense, useEffect, useId, useState } from "react";
import { FcGoogle } from "react-icons/fc";
import { useRouter, useSearchParams } from "next/navigation";
import Button from "@/components/Button";
import InstallAppIos from "@/components/InstallAppIos";
import MainContainer from "@/components/MainContainer";
import Title from "@/components/Title";
import { cn } from "@/lib/cn";
import { createClient } from "@/lib/supabase-browser";
import { NETWORK_ERROR, translateError } from "./errors";
import PasswordField from "./PasswordField";
import PasswordHints from "./PasswordHints";
import { RESEND_COOLDOWN_SECONDS, validateAuthForm, validateResetForm, type AuthFieldErrors } from "./validation";

export default function AuthPage() {
  return (
    <Suspense>
      <AuthForm />
    </Suspense>
  );
}

function AuthForm() {
  const [mode, setMode] = useState<"login" | "register" | "reset">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [registered, setRegistered] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  /**
   * Field errors stay quiet until the first submit — flagging "введите email" while someone is
   * still typing the first character is noise. After that they update on every keystroke, so a
   * fixed field clears itself immediately.
   */
  const [submitted, setSubmitted] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const confirmed = searchParams.get("confirmed") === "true";
  const confirmError = searchParams.get("error") === "confirmation_failed";
  const emailId = useId();
  const emailErrorId = `${emailId}-error`;
  const supabase = createClient();

  const isRegister = mode === "register";
  const isReset = mode === "reset";
  // The reset form has no password field, so it is validated on the email alone rather than
  // through validateAuthForm, whose contract is "login or register".
  const fieldErrors: AuthFieldErrors = !submitted
    ? {}
    : isReset
      ? validateResetForm(email)
      : validateAuthForm(mode, { email, password, confirm });

  async function handleGoogleSignIn() {
    setError("");
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/auth/confirm?next=/` },
      });
      // On success the browser is already navigating away, so only the failure path lands here.
      if (error) {
        setError(translateError(error));
        setLoading(false);
      }
    } catch {
      setError(NETWORK_ERROR);
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;

    setSubmitted(true);
    setError("");
    const errors = isReset ? validateResetForm(email) : validateAuthForm(mode, { email, password, confirm });
    if (Object.keys(errors).length > 0) return;

    // GoTrue stores addresses lowercased; normalising here keeps "Ivan@" and "ivan@" from looking
    // like two different accounts on the client.
    const normalizedEmail = email.trim().toLowerCase();
    setLoading(true);

    try {
      if (isReset) {
        const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
          redirectTo: `${window.location.origin}/auth/confirm?next=/auth/new-password`,
        });
        // Anything but a rate limit is reported as success on purpose: GoTrue stays silent about
        // whether an address has an account, and saying "нет такого пользователя" here would hand
        // a stranger the account-enumeration oracle the registration form is careful to deny.
        if (error) setError(translateError(error));
        else setResetSent(true);
      } else if (isRegister) {
        const { data, error } = await supabase.auth.signUp({
          email: normalizedEmail,
          password,
          options: { emailRedirectTo: `${window.location.origin}/auth/confirm` },
        });
        if (error) {
          setError(translateError(error));
        } else if (data.user?.identities?.length === 0) {
          // With confirmations on, GoTrue hides "already registered" behind a success response and
          // an empty identities array, so that a stranger cannot probe which emails have accounts.
          setError("Пользователь с таким email уже зарегистрирован");
        } else if (data.session) {
          // A session straight out of signUp means GoTrue auto-confirmed the address (the
          // project's "Confirm email" is off), so no letter was ever sent — showing "проверьте
          // почту" here would leave the user waiting for mail that does not exist.
          router.push("/");
          router.refresh();
        } else {
          setRegistered(true);
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password });
        if (error) {
          setError(translateError(error));
        } else {
          router.push("/");
          router.refresh();
        }
      }
    } catch {
      setError(NETWORK_ERROR);
    } finally {
      setLoading(false);
    }
  }

  function goTo(next: "login" | "register" | "reset") {
    setMode(next);
    setError("");
    setSubmitted(false);
    // The email is almost always the same one — retyping it is pure friction. The passwords are
    // cleared because the rules differ between the two modes.
    setPassword("");
    setConfirm("");
  }

  if (resetSent) {
    return (
      <CheckMailboxNotice
        kind="recovery"
        email={email.trim().toLowerCase()}
        onBackToLogin={() => {
          setResetSent(false);
          goTo("login");
        }}
      />
    );
  }

  if (registered) {
    return (
      <CheckMailboxNotice
        kind="signup"
        email={email.trim().toLowerCase()}
        onBackToLogin={() => {
          setRegistered(false);
          goTo("login");
        }}
      />
    );
  }

  return (
    <MainContainer className="max-w-sm pt-20">
      {confirmed && (
        <div className="mb-4 flex items-center gap-3 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          <span className="text-green-500 text-base">✓</span>
          Email успешно подтверждён! Теперь вы можете войти в аккаунт.
        </div>
      )}
      {confirmError && (
        <div className="mb-4 flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <span className="text-red-500 text-base">✕</span>
          Ссылка для подтверждения недействительна или устарела.
        </div>
      )}
      <Title className="mb-6 text-center">
        {isReset ? "Восстановление пароля" : isRegister ? "Регистрация" : "Вход"}
      </Title>

      {/* A real <form>: Enter submits from any field, and password managers recognise the pair. */}
      <form onSubmit={handleSubmit} noValidate className="border border-gray-300 rounded-xl p-6 flex flex-col gap-4">
        {isReset && (
          <p className="text-sm text-gray-600">
            Укажите email, на который зарегистрирован аккаунт — пришлём ссылку для смены пароля.
          </p>
        )}

        <div>
          <label htmlFor={emailId} className="text-sm text-gray-600 block mb-1">
            Email
          </label>
          <input
            id={emailId}
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={fieldErrors.email ? true : undefined}
            aria-describedby={fieldErrors.email ? emailErrorId : undefined}
            placeholder="you@example.com"
            // text-base, not text-sm: below 16px iOS Safari zooms the viewport on focus.
            className={cn(
              "w-full border rounded-lg px-3 py-2 text-base md:text-sm focus:outline-none focus:ring-2",
              fieldErrors.email ? "border-red-400 focus:ring-red-500" : "border-gray-300 focus:ring-green-500",
            )}
          />
          {fieldErrors.email && (
            <p id={emailErrorId} className="mt-1 text-xs text-red-600">
              {fieldErrors.email}
            </p>
          )}
        </div>

        {!isReset && (
          <PasswordField
            label="Пароль"
            name="password"
            value={password}
            onChange={setPassword}
            autoComplete={isRegister ? "new-password" : "current-password"}
            placeholder={isRegister ? "Придумайте пароль" : "Ваш пароль"}
            error={fieldErrors.password}
          >
            {isRegister && <PasswordHints password={password} />}
            {!isRegister && (
              <p className="mt-2 text-right">
                <Button type="button" variant="ghost" onClick={() => goTo("reset")} className="text-xs hover:underline">
                  Забыли пароль?
                </Button>
              </p>
            )}
          </PasswordField>
        )}

        {isRegister && (
          <PasswordField
            label="Повторите пароль"
            name="confirm-password"
            value={confirm}
            onChange={setConfirm}
            autoComplete="new-password"
            placeholder="Ещё раз"
            error={fieldErrors.confirm}
          />
        )}

        {error && (
          <p role="alert" className="text-red-600 text-sm bg-red-50 border border-red-100 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <Button type="submit" variant="primary" disabled={loading} className="w-full py-2">
          {loading ? "Загрузка..." : isReset ? "Отправить ссылку" : isRegister ? "Зарегистрироваться" : "Войти"}
        </Button>

        {!isReset && (
          <div className="flex items-center gap-3">
            <div className="flex-1 border-t border-gray-200" />
            <span className="text-xs text-gray-400">или</span>
            <div className="flex-1 border-t border-gray-200" />
          </div>
        )}

        {!isReset && (
          <Button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 border border-gray-300 rounded-lg px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors hover:cursor-pointer"
          >
            <FcGoogle className="text-base" />
            Продолжить с Google
          </Button>
        )}

        <p className="text-center text-sm text-gray-500">
          {isReset ? (
            <Button type="button" variant="ghost" onClick={() => goTo("login")} className="hover:underline">
              Вернуться ко входу
            </Button>
          ) : (
            <>
              {isRegister ? "Уже есть аккаунт?" : "Нет аккаунта?"}{" "}
              <Button
                type="button"
                variant="ghost"
                onClick={() => goTo(isRegister ? "login" : "register")}
                className="hover:underline"
              >
                {isRegister ? "Войти" : "Зарегистрироваться"}
              </Button>
            </>
          )}
        </p>
      </form>

      {/* The best page to offer this on, though the copy does not say why: an installed iOS web app
          gets its own storage, so a session started here in Safari does not follow it in. Install
          first and you sign in once. That is our problem to know, not the customer's to read. */}
      <InstallAppIos className="mt-6" />
    </MainContainer>
  );
}

/**
 * "We sent you a letter" — shown after registration and after a reset request. One component
 * because the two differ only in wording and in which call the resend button repeats; the
 * cooldown, the rate-limit handling and the spam-folder hint are the same problem either way.
 */
function CheckMailboxNotice({
  kind,
  email,
  onBackToLogin,
}: {
  kind: "signup" | "recovery";
  email: string;
  onBackToLogin: () => void;
}) {
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS);
  const [status, setStatus] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [sending, setSending] = useState(false);
  const supabase = createClient();

  // The first letter has just gone out, so the countdown starts immediately rather than offering
  // a resend that GoTrue would reject for coming too soon.
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  async function handleResend() {
    if (sending || cooldown > 0) return;
    setSending(true);
    setStatus(null);
    try {
      const { error } =
        kind === "signup"
          ? await supabase.auth.resend({
              type: "signup",
              email,
              options: { emailRedirectTo: `${window.location.origin}/auth/confirm` },
            })
          : await supabase.auth.resetPasswordForEmail(email, {
              redirectTo: `${window.location.origin}/auth/confirm?next=/auth/new-password`,
            });
      if (error) {
        setStatus({ kind: "error", text: translateError(error) });
      } else {
        setStatus({ kind: "ok", text: "Письмо отправлено ещё раз." });
        setCooldown(RESEND_COOLDOWN_SECONDS);
      }
    } catch {
      setStatus({ kind: "error", text: NETWORK_ERROR });
    } finally {
      setSending(false);
    }
  }

  return (
    <MainContainer className="max-w-sm pt-20">
      <div className="border border-gray-300 rounded-xl p-6 text-center flex flex-col gap-4">
        <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto text-green-600 text-2xl">
          ✉
        </div>
        <Title>{kind === "signup" ? "Подтвердите email" : "Письмо отправлено"}</Title>
        <p className="text-sm text-gray-600">
          Мы отправили письмо на <span className="font-medium text-gray-800">{email}</span>.
          <br />
          {kind === "signup"
            ? "Перейдите по ссылке в письме, чтобы завершить регистрацию."
            : "Перейдите по ссылке в письме, чтобы задать новый пароль."}
        </p>
        <p className="text-xs text-gray-400">Не пришло письмо? Проверьте папку «Спам».</p>

        {status && (
          <p
            role="alert"
            className={cn(
              "text-sm rounded-lg px-3 py-2",
              status.kind === "ok" ? "text-green-700 bg-green-50" : "text-red-600 bg-red-50",
            )}
          >
            {status.text}
          </p>
        )}

        <Button
          type="button"
          variant="secondary"
          onClick={handleResend}
          disabled={sending || cooldown > 0}
          className="w-full py-2"
        >
          {sending
            ? "Отправляем..."
            : cooldown > 0
              ? `Отправить повторно через ${cooldown} с`
              : "Отправить письмо ещё раз"}
        </Button>

        <Button type="button" variant="ghost" onClick={onBackToLogin} className="text-sm hover:underline">
          Войти в аккаунт
        </Button>
      </div>
    </MainContainer>
  );
}
