"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function MobileHeader({
  children,
  title,
  withBackButton,
  withGoToMainButton,
}: {
  children?: React.ReactNode;
  title?: string;
  withBackButton?: boolean;
  withGoToMainButton?: boolean;
}) {
  const router = useRouter();

  return (
    <div className="flex items-center md:hidden sticky rounded-2xl top-0 bg-linear-to-t from-white to-green-100 p-4 z-50">
      {withBackButton ? (
        <button
          onClick={() => router.back()}
          aria-label="Назад"
          className={"md:hidden absolute flex items-center bg-white rounded-full text-green-700 transition-colors p-2"}
        >
          <ArrowLeft className="size-5" />
        </button>
      ) : null}
      {withGoToMainButton ? (
        <Link href="/" aria-label="На главную" className="absolute">
          <ArrowLeft className="size-5" />
        </Link>
      ) : null}
      {title ? <p className="flex-1 text-center text-xl font-medium">{title}</p> : null}
      {children}
    </div>
  );
}
