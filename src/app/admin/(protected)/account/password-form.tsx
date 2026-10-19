"use client";

import { useActionState } from "react";
import { changePasswordAction, type FormState } from "../../actions";

const fields = [
  { name: "current", label: "현재 비밀번호", autoComplete: "current-password" },
  { name: "next", label: "새 비밀번호 (12자 이상)", autoComplete: "new-password" },
  { name: "confirm", label: "새 비밀번호 확인", autoComplete: "new-password" },
] as const;

export function PasswordForm() {
  const [state, formAction, pending] = useActionState<FormState, FormData>(changePasswordAction, {});
  return (
    <form action={formAction} className="mt-4 flex flex-col gap-4">
      {fields.map((f) => (
        <label key={f.name} className="flex flex-col gap-1 text-sm font-medium">
          {f.label}
          <input
            name={f.name}
            type="password"
            autoComplete={f.autoComplete}
            required
            className="rounded-lg border border-line bg-surface px-3 py-2 font-normal"
          />
          {state.fieldErrors?.[f.name] && <span className="text-xs text-danger">{state.fieldErrors[f.name]}</span>}
        </label>
      ))}
      {state.error && (
        <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
          {state.error}
        </p>
      )}
      {state.ok && (
        <p role="status" className="rounded-lg bg-ok-soft px-3 py-2 text-sm text-ok">
          {state.ok}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-ink hover:opacity-90 disabled:opacity-60"
      >
        {pending ? "변경 중…" : "비밀번호 변경"}
      </button>
    </form>
  );
}
