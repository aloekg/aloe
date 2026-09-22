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
      {/*
        An <h1>, not a <p>. Ten pages pair this bar with `<Title className="hidden md:block">`, and
        `hidden` is `display: none` — the heading is gone from the accessibility tree, not just from
        view. So on a phone those pages had no heading at all, only this line of text that looked
        like one. The split works because the bar is itself `md:hidden`: exactly one of the two is
        in the tree at any width, so neither duplicates the other.
      */}
      {title ? <h1 className="flex-1 text-center text-xl font-medium">{title}</h1> : null}
      {children}
    </div>
  );
}
