import Link from "next/link";
import { MainContainer, Title } from "@/components";
import { createClient } from "@/lib/supabase-server";
import NewPasswordScreen from "./NewPasswordScreen";

export const metadata = { title: "Новый пароль", robots: { index: false, follow: false } };

/**
 * Where a password-reset link lands. The session was established by verifyOtp in
 * /auth/confirm — this page spends it on one updateUser call and then gets out of the way.
 *
 * The session check is done here rather than in the browser so that an expired link says so in the
 * first response, instead of every visitor watching a "проверяем ссылку" placeholder while the
 * client asks. getUser(), not getSession(): it asks the Auth server rather than trusting whatever
 * cookie arrived, the same reason lib/auth.ts does.
 */
export default async function NewPasswordPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    return (
      <MainContainer className="max-w-sm pt-20">
        <div className="border border-gray-300 rounded-xl p-6 text-center flex flex-col gap-4">
          <Title>Ссылка недействительна</Title>
          <p className="text-sm text-gray-600">
            Ссылка для восстановления пароля устарела или уже была использована. Запросите новую.
          </p>
          <Link href="/auth" className="text-sm text-green-700 hover:underline">
            Вернуться ко входу
          </Link>
        </div>
      </MainContainer>
    );
  }

  return (
    <MainContainer className="max-w-sm pt-20">
      <Title className="mb-6 text-center">Новый пароль</Title>
      <div className="border border-gray-300 rounded-xl p-6">
        <p className="mb-4 text-sm text-gray-600">
          Аккаунт <span className="font-medium text-gray-800">{user.email}</span>
        </p>
        <NewPasswordScreen email={user.email} />
      </div>
    </MainContainer>
  );
}
