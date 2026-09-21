"use client";

import { useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { LogInIcon, User as UserIcon } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase-browser";

export default function AuthButton() {
  const [user, setUser] = useState<User | null>(null);
  const supabaseAuth = useMemo(() => createClient().auth, []);

  useEffect(() => {
    supabaseAuth.getUser().then(({ data }) => setUser(data.user));

    const {
      data: { subscription },
    } = supabaseAuth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, [supabaseAuth]);

  if (user) {
    return (
      <Link
        href="/profile"
        title={user.email ?? "Профиль"}
        className="p-2 rounded-full flex items-center justify-center text-gray-400 hover:text-green-600 transition-colors"
      >
        <UserIcon className="size-5" />
      </Link>
    );
  }

  return (
    <Link
      href="/auth"
      title="Войти"
      className="p-2 rounded-full flex items-center justify-center text-gray-400 hover:text-green-600 transition-colors"
    >
      <LogInIcon className="size-5" />
    </Link>
  );
}
