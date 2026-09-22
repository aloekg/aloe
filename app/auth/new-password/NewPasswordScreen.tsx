"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@/components/Button";
import MainContainer from "@/components/MainContainer";
import Title from "@/components/Title";
import { createClient } from "@/lib/supabase-browser";
import { NETWORK_ERROR, translateError } from "../errors";
import NewPasswordForm from "../NewPasswordForm";

/**
 * The interactive half of the reset screen. Whether there is a session to spend was already
 * decided on the server — by the time this renders, `email` is proof of one.
 */
export default function NewPasswordScreen({ email }: { email: string }) {
  const [done, setDone] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleSubmit(password: string): Promise<string | null> {
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) return translateError(error);

      // A reset usually means the old password was lost — or learned by someone else. Ending the
      // other sessions is the difference between changing a lock and changing it while a copy of
      // the old key is still in circulation. `others` keeps this device signed in.
      const { error: signOutError } = await supabase.auth.signOut({ scope: "others" });
      if (signOutError) console.error("[auth] could not revoke other sessions", signOutError.message);

      setDone(true);
      router.refresh();
      return null;
    } catch {
      return NETWORK_ERROR;
    }
  }

  if (done) {
    return (
      <MainContainer className="max-w-sm pt-20">
        <div className="border border-gray-300 rounded-xl p-6 text-center flex flex-col gap-4">
          <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto text-green-700 text-2xl">
            ✓
          </div>
          <Title>Пароль изменён</Title>
          <p className="text-sm text-gray-600">
            Вы вошли в аккаунт с новым паролём. На других устройствах потребуется войти заново.
          </p>
          <Button type="button" variant="primary" onClick={() => router.push("/")} className="w-full py-2">
            Перейти в магазин
          </Button>
        </div>
      </MainContainer>
    );
  }

  return (
    <MainContainer className="max-w-sm pt-20">
      <Title className="mb-6 text-center">Новый пароль</Title>
      <div className="border border-gray-300 rounded-xl p-6">
        {email && (
          <p className="mb-4 text-sm text-gray-600">
            Аккаунт <span className="font-medium text-gray-800">{email}</span>
          </p>
        )}
        <NewPasswordForm submitLabel="Сохранить пароль" onSubmit={handleSubmit} email={email} />
      </div>
    </MainContainer>
  );
}
