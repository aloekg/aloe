"use client";

import { useActionState } from "react";
import { Button } from "@/components";
import { claimOrder } from "./actions";

/**
 * The one control on /order/<token> for a signed-in visitor. `useActionState` gives the pending
 * state and the failure message without a second round trip; success never returns here, because
 * the action redirects to /profile.
 */
export default function ClaimOrderButton({ token }: { token: string }) {
  const [state, submit, pending] = useActionState(async () => claimOrder(token), null);

  return (
    <form action={submit} className="mt-4">
      <Button type="submit" variant="primary" className="w-full px-4 py-3 text-sm" disabled={pending}>
        {pending ? "Привязываем…" : "Привязать к моему аккаунту"}
      </Button>
      {state && !state.ok && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {state.error}
        </p>
      )}
    </form>
  );
}
