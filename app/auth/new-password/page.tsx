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

  // The chrome — container, heading, card, "Аккаунт …" — belongs to NewPasswordScreen, which owns
  // both of its states: on success it replaces the form entirely with "Пароль изменён", and a
  // heading held here would still read "Новый пароль" above it. Rendering it in both places is what
  // put two headings, two account lines and a card inside a card on the screen.
  return <NewPasswordScreen email={user.email} />;
}
