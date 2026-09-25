"use client";

import { useMemo, useState } from "react";
import { ShieldCheck, ShieldMinus, ShieldPlus, ShieldUser } from "lucide-react";
import Button from "@/components/Button";
import type { AdminUserRow } from "@/services/user.service";
import { setUserRole } from "./actions";
import { adminInputCls as inp } from "./admin-ui";

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" });
}

export default function AdminUsers({
  users: initial,
  currentUserId,
  truncated,
}: {
  users: AdminUserRow[];
  currentUserId: string;
  truncated: boolean;
}) {
  const [users, setUsers] = useState(initial);
  const [query, setQuery] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => [u.email, u.name, u.phone].some((field) => field?.toLowerCase().includes(q)));
  }, [users, query]);

  const adminCount = users.filter((u) => u.role !== null).length;

  async function toggleRole(user: AdminUserRow) {
    const makeAdmin = user.role === null;
    const who = user.email || user.name || "этого пользователя";
    const question = makeAdmin
      ? `Назначить ${who} администратором? Он получит полный доступ к заказам, товарам и баннерам.`
      : `Снять права администратора у ${who}?`;
    if (!confirm(question)) return;

    setPendingId(user.id);
    setError("");
    const result = await setUserRole(user.id, makeAdmin);
    setPendingId(null);

    if (!result.ok) {
      setError(result.error);
      return;
    }
    setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, role: makeAdmin ? "admin" : null } : u)));
  }

  return (
    <>
      <div className="flex flex-wrap justify-between items-center gap-3 mb-5">
        <p className="text-sm text-gray-500">
          Пользователей: {users.length}
          {truncated ? "+" : ""} · с доступом в админку: {adminCount}
        </p>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Почта, имя или телефон"
          className={`${inp} md:w-72`}
        />
      </div>

      {truncated && (
        <p className="mb-4 text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
          Показаны первые 2000 аккаунтов — остальные в список не попали.
        </p>
      )}

      {error && <p className="mb-4 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

      <div className="space-y-1">
        {filtered.map((user) => {
          const isSelf = user.id === currentUserId;
          const isSuper = user.role === "superadmin";
          return (
            <div
              key={user.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 rounded-lg hover:bg-gray-50"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium truncate">{user.email || "без почты"}</span>
                  {user.role && (
                    <span
                      className={`shrink-0 inline-flex items-center gap-1 text-xs rounded px-1.5 py-0.5 ${
                        isSuper ? "text-amber-700 bg-amber-50" : "text-green-700 bg-green-50"
                      }`}
                    >
                      {isSuper ? <ShieldUser className="size-3" /> : <ShieldCheck className="size-3" />}
                      {isSuper ? "Супер-админ" : "Админ"}
                    </span>
                  )}
                  {isSelf && <span className="shrink-0 text-xs text-gray-500">это вы</span>}
                </div>
                <p className="text-xs text-gray-500 truncate">
                  {[user.name, user.phone].filter(Boolean).join(" · ") || "профиль не заполнен"}
                </p>
              </div>

              <div className="text-xs text-gray-500 text-right">
                <p>Регистрация: {formatDate(user.createdAt)}</p>
                <p>Последний вход: {formatDate(user.lastSignInAt)}</p>
              </div>

              {isSuper ? (
                <span className="text-xs text-gray-500 shrink-0">меняется в Supabase</span>
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={pendingId === user.id}
                  onClick={() => toggleRole(user)}
                  className="flex items-center gap-1.5 shrink-0"
                >
                  {user.role ? <ShieldMinus className="size-3.5" /> : <ShieldPlus className="size-3.5" />}
                  {user.role ? "Снять права" : "Сделать админом"}
                </Button>
              )}
            </div>
          );
        })}

        {filtered.length === 0 && <p className="text-sm text-gray-500 px-3 py-6">Никого не нашлось</p>}
      </div>
    </>
  );
}
