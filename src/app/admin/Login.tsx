"use client";

import { useState } from "react";

/**
 * The gate. It says as little as possible: one field, one failure line, and no
 * hint about what the panel behind it is for.
 */
export default function Login() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (response.ok) {
        location.reload();
        return;
      }
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      setError(body.error ?? "no");
    } catch {
      setError("network");
    }
    setBusy(false);
  }

  return (
    <main className="flex min-h-dvh items-center justify-center field px-4">
      <form onSubmit={submit} className="flex w-full max-w-xs flex-col gap-3">
        <span className="font-[var(--font-display)] text-[13px] font-bold tracking-[0.2em] text-fog">
          LAUNCH
        </span>
        <input
          type="password"
          autoFocus
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="password"
          className="w-full rounded border border-line bg-ink px-3 py-2 text-[13px] text-fog transition-colors duration-150 focus:border-edge"
        />
        <button
          type="submit"
          disabled={busy}
          className="rounded bg-accent px-3 py-2 text-[12px] font-medium text-void transition-opacity duration-150 disabled:opacity-50"
        >
          {busy ? "checking" : "unlock"}
        </button>
        {error ? <span className="text-[11px] text-danger">{error}</span> : null}
      </form>
    </main>
  );
}
