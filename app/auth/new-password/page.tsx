import Link from "next/link";
import { MainContainer, Title } from "@/components";
import { createClient } from "@/lib/supabase-server";
import NewPasswordScreen from "./NewPasswordScreen";

export const metadata = { title: "Новый пароль", robots: { index: false, follow: false } };

// getUser(), not getSession(): ask the Auth server rather than trust the cookie.
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

  // The chrome belongs to NewPasswordScreen: a heading here would stay above its success state.
  return <NewPasswordScreen email={user.email} />;
}
