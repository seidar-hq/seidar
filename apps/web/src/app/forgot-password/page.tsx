"use client";
import Link from "next/link";
import { useState } from "react";
import AuthShell from "@/components/auth-shell";
import { apiRequest } from "@/lib/api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      const response = await apiRequest<{ message: string }>(
        "/v1/auth/password/forgot",
        { method: "POST", body: JSON.stringify({ email }) },
      );
      setMessage(response.message);
    } catch (x) {
      setError(x instanceof Error ? x.message : "Could not request a reset.");
    }
  };
  return (
    <AuthShell
      title="Reset your password."
      description="We'll send a time-limited recovery link if an account exists for this address."
    >
      <div className="flex min-h-96 flex-1 items-center px-2 sm:px-8">
        <form
          onSubmit={submit}
          className="mx-auto flex w-full max-w-sm flex-col"
        >
          <label className="text-xs text-neutral-400">
            Email
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              required
              autoComplete="email"
              placeholder="you@company.com"
              className="mt-1.5 h-11 w-full rounded-xl border border-white/10 bg-white/[0.03] px-3.5 text-sm text-white placeholder:text-neutral-600 focus:border-white/30 focus:outline-none"
            />
          </label>
          {message && (
            <p className="mt-4 text-sm text-emerald-300">{message}</p>
          )}
          {error && <p className="mt-4 text-sm text-red-300">{error}</p>}
          <button className="mt-5 h-11 rounded-xl bg-white text-sm font-medium text-black">
            Send reset link
          </button>
          <Link
            href="/signin"
            className="mt-5 text-center text-xs text-neutral-500 hover:text-white"
          >
            Back to sign in
          </Link>
        </form>
      </div>
    </AuthShell>
  );
}
