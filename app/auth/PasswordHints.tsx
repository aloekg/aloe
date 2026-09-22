"use client";

import { Check, Circle } from "lucide-react";
import { cn } from "@/lib/cn";
import { passwordRules, passwordStrength } from "./validation";

/**
 * The strength bar and requirement checklist shown under a password field while one is being
 * chosen. Rendered wherever a password is *set* — registration, a reset, a change from the
 * profile — so the three screens show the same rules in the same words.
 */
export default function PasswordHints({ password }: { password: string }) {
  if (!password) return null;

  const strength = passwordStrength(password);
  const rules = passwordRules(password);

  return (
    <div className="mt-2">
      <div className="h-1 w-full overflow-hidden rounded-full bg-gray-200">
        <div className={cn("h-full rounded-full transition-all duration-300", strength.barClass)} />
      </div>
      <p className="mt-1 text-xs text-gray-500" aria-live="polite">
        Надёжность: {strength.label}
      </p>
      <ul className="mt-2 space-y-1">
        {rules.map((rule) => (
          <li
            key={rule.label}
            className={cn("flex items-center gap-1.5 text-xs", rule.ok ? "text-green-700" : "text-gray-500")}
          >
            {rule.ok ? <Check className="w-3.5 h-3.5 shrink-0" /> : <Circle className="w-3.5 h-3.5 shrink-0" />}
            {rule.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
