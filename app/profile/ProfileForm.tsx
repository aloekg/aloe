"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import Button from "@/components/Button";
import { saveProfile } from "./actions";

type Props = {
  initial: { name: string; phone: string; address: string };
};

export default function ProfileForm({ initial }: Props) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(initial.name);
  const [phone, setPhone] = useState(initial.phone);
  const [address, setAddress] = useState(initial.address);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const nameId = useId();
  const phoneId = useId();
  const addressId = useId();

  useEffect(() => () => clearTimeout(savedTimerRef.current), []);

  function handleCancel() {
    setName(initial.name);
    setPhone(initial.phone);
    setAddress(initial.address);
    setError("");
    setEditing(false);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaved(false);
    startTransition(async () => {
      try {
        await saveProfile({ name, phone, address });
        setSaved(true);
        setEditing(false);
        savedTimerRef.current = setTimeout(() => setSaved(false), 3000);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Ошибка сохранения");
      }
    });
  }

  const inputCls = (active: boolean) =>
    `w-full border border-gray-500 rounded-lg px-3 py-2 text-base md:text-sm transition-colors ${
      active
        ? "focus:outline-none focus:ring-2 focus:ring-green-700 bg-white"
        : "bg-gray-50 text-gray-500 cursor-default"
    }`;

  return (
    <form onSubmit={handleSubmit} className="border border-gray-300 rounded-xl p-5 mb-8 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Личные данные</h2>
        {!editing && (
          <Button type="button" variant="ghost" onClick={() => setEditing(true)} className="text-sm font-medium">
            Изменить
          </Button>
        )}
      </div>

      {!editing && !initial.name && !initial.phone && !initial.address && (
        <p className="text-sm text-gray-500">Данные не заполнены. Нажмите «Изменить» чтобы добавить.</p>
      )}

      {/*
        The three labels used to be bare <label> elements with no `htmlFor` and no `id` on the
        inputs, and they do not wrap them either — so nothing tied caption to control and all three
        fields were announced as unnamed. `autoComplete` goes with them: these are the visitor's own
        name, phone and address, which is exactly what WCAG 2.1's "Identify Input Purpose" asks be
        marked, and it lets the browser fill them. app/checkout/CheckoutForm.tsx already does both.
      */}
      <div>
        <label htmlFor={nameId} className="block text-sm font-medium text-gray-700 mb-1">
          Имя
        </label>
        <input
          id={nameId}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={!editing}
          autoComplete="name"
          placeholder="Ваше имя"
          className={inputCls(editing)}
        />
      </div>

      <div>
        <label htmlFor={phoneId} className="block text-sm font-medium text-gray-700 mb-1">
          Телефон
        </label>
        <input
          id={phoneId}
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          disabled={!editing}
          autoComplete="tel"
          placeholder="+996 700 000 000"
          className={inputCls(editing)}
        />
      </div>

      <div>
        <label htmlFor={addressId} className="block text-sm font-medium text-gray-700 mb-1">
          Адрес доставки
        </label>
        <input
          id={addressId}
          type="text"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          disabled={!editing}
          autoComplete="street-address"
          placeholder="Город, улица, дом, квартира"
          className={inputCls(editing)}
        />
      </div>

      {/*
        Both outcomes were announced to nobody: plain <p> elements appearing after the save, with no
        role and no live region, so a screen reader user pressed "Сохранить" and got silence either
        way. The wrappers are always mounted and hidden by `empty:hidden` while they hold nothing —
        a live region that appears together with its text is the same bug as the one in
        components/Toaster.tsx, and the empty element would otherwise take a slot in `space-y-4`.
      */}
      <div role="alert" className="empty:hidden">
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
      <div role="status" className="empty:hidden">
        {saved && <p className="text-sm text-green-700">Данные сохранены ✓</p>}
      </div>

      {editing && (
        <div className="flex gap-2">
          <Button type="submit" variant="primary" disabled={isPending} className="px-5">
            {isPending ? "Сохранение..." : "Сохранить"}
          </Button>
          <Button type="button" variant="secondary" onClick={handleCancel} className="px-5">
            Отмена
          </Button>
        </div>
      )}
    </form>
  );
}
