"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import MainContainer from "@/components/MainContainer";
import { safeNextPath } from "@/lib/safe-redirect";
import AuthForm from "./AuthForm";

export default function AuthPage() {
  return (
    <Suspense>
      <AuthPageContent />
    </Suspense>
  );
}

function AuthPageContent() {
  const searchParams = useSearchParams();
  const confirmed = searchParams.get("confirmed") === "true";
  const confirmError = searchParams.get("error") === "confirmation_failed";
  // The page never read this, so `?next=` was silently dropped and everyone who signed in from a
  // review link or from the checkout-success card landed on the home page instead of where they
  // were going. Validated rather than passed through: it reaches router.push, and an unchecked
  // value makes the shop's own sign-in page the bait for an open redirect.
  const next = safeNextPath(searchParams.get("next"));

  return (
    <MainContainer className="max-w-sm pt-20">
      <AuthForm
        next={next}
        installHint
        banner={
          <>
            {confirmed && (
              <div className="mb-4 flex items-center gap-3 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
                <span className="text-green-700 text-base">✓</span>
                Email успешно подтверждён! Теперь вы можете войти в аккаунт.
              </div>
            )}
            {confirmError && (
              <div className="mb-4 flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                <span className="text-red-600 text-base">✕</span>
                Ссылка для подтверждения недействительна или устарела.
              </div>
            )}
          </>
        }
      />
    </MainContainer>
  );
}
