"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import AuthShell from "@/components/auth-shell";
import { apiRequest } from "@/lib/api";

function ResetForm() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    try {
      await apiRequest("/v1/auth/password/reset", {
        method: "POST",
        body: JSON.stringify({ token, password }),
      });
      setDone(true);
    } catch (x) {
      setError(
        x instanceof Error ? x.message : "Could not reset the password.",
      );
    }
  };
  if (done)
    return (
      <div className="m-auto max-w-sm text-center">
        <h2 className="text-xl">Password updated</h2>
        <p className="mt-2 text-sm text-neutral-500">
          You can now sign in with your new password.
        </p>
        <Link
          className="mt-5 inline-block rounded-xl bg-white px-5 py-3 text-sm text-black"
          href="/signin"
        >
          Sign in
        </Link>
      </div>
    );
  return (
    <form onSubmit={submit} className="m-auto flex w-full max-w-sm flex-col">
      <label className="text-xs text-neutral-400">
        New password
        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          type="password"
          minLength={8}
          maxLength={128}
          required
          autoComplete="new-password"
          className="mt-1.5 h-11 w-full rounded-xl border border-white/10 bg-white/[0.03] px-3.5 text-sm text-white focus:border-white/30 focus:outline-none"
        />
      </label>
      <label className="mt-4 text-xs text-neutral-400">
        Confirm password
        <input
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          type="password"
          minLength={8}
          maxLength={128}
          required
          autoComplete="new-password"
          className="mt-1.5 h-11 w-full rounded-xl border border-white/10 bg-white/[0.03] px-3.5 text-sm text-white focus:border-white/30 focus:outline-none"
        />
      </label>
      {!token && (
        <p className="mt-4 text-sm text-red-300">
          The reset link is missing its token.
        </p>
      )}
      {error && <p className="mt-4 text-sm text-red-300">{error}</p>}
      <button
        disabled={!token}
        className="mt-5 h-11 rounded-xl bg-white text-sm font-medium text-black disabled:opacity-50"
      >
        Update password
      </button>
    </form>
  );
}
export default function ResetPasswordPage() {
  return (
    <AuthShell
      title="Choose a new password."
      description="Recovery links expire after one hour and can only be used once."
    >
      <div className="flex min-h-96 flex-1 px-2 sm:px-8">
        <Suspense
          fallback={<p className="m-auto text-sm text-neutral-500">Loading…</p>}
        >
          <ResetForm />
        </Suspense>
      </div>
    </AuthShell>
  );
}
