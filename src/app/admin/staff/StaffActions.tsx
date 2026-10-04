"use client";

import { useState, useTransition } from "react";
import { btnSecondary } from "@/components/ui/styles";
import { resendAccess, setStaffActive } from "./actions";

export function StaffActions({
  userId,
  active,
  isSelf,
}: {
  userId: string;
  active: boolean;
  isSelf: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  const run = (fn: () => Promise<string | void>) =>
    startTransition(async () => {
      try {
        setMessage((await fn()) ?? null);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Algo deu errado.");
      }
    });

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap justify-end gap-2">
        <button className={btnSecondary} disabled={pending} onClick={() => run(() => resendAccess(userId))}>
          Reenviar acesso
        </button>
        {!isSelf && (
          <button
            className={`${btnSecondary} ${active ? "text-danger-ink" : "text-success-ink"}`}
            disabled={pending}
            onClick={() => run(() => setStaffActive(userId, !active))}
          >
            {active ? "Desativar" : "Reativar"}
          </button>
        )}
      </div>
      {message && (
        <p role="status" className="text-xs text-cool-gray">
          {message}
        </p>
      )}
    </div>
  );
}
