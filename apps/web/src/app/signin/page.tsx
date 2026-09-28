"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AuthShell from "@/components/auth-shell";
import { AuthDivider, GoogleAuthButton } from "@/components/google-auth";
import { apiRequest } from "@/lib/api";

export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      await apiRequest("/v1/auth/signin", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      const next = new URLSearchParams(window.location.search).get("next");
      router.push(next?.startsWith("/") && !next.startsWith("//") ? next : "/organizations");
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not sign in. Please try again.");
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="Welcome back."
      description="Sign in to your Seidar account to operate confidential assets."
    >
      <div className="min-h-0 flex-1">
        <div className="flex h-full min-h-96 w-full flex-col justify-center px-2 sm:px-8">
          <form onSubmit={submit} className="mx-auto flex w-full max-w-sm flex-col">
            <GoogleAuthButton />
            <AuthDivider />
            <label className="text-xs text-neutral-400">
              Email
              <input
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@company.com"
                type="email"
                autoComplete="email"
                required
                className="mt-1.5 h-11 w-full rounded-xl border border-white/10 bg-white/[0.03] px-3.5 text-sm text-white placeholder:text-neutral-600 focus:border-white/30 focus:outline-none"
              />
            </label>
            <label className="mt-4 text-xs text-neutral-400">
              Password
              <span className="relative mt-1.5 block">
                <input
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="••••••••"
                  type={show ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.03] px-3.5 pr-16 text-sm text-white placeholder:text-neutral-600 focus:border-white/30 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShow((current) => !current)}
                  className="absolute top-1/2 right-3 -translate-y-1/2 text-xs font-medium text-neutral-500 hover:text-white"
                >
                  {show ? "Hide" : "Show"}
                </button>
              </span>
            </label>
            <div className="mt-3 text-right">
              <Link href="/forgot-password" className="text-xs text-neutral-500 hover:text-white">
                Forgot password?
              </Link>
            </div>
            {error && <p role="alert" className="mt-4 text-sm text-red-300">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="mt-4 h-11 rounded-xl bg-white text-sm font-medium text-black transition-opacity disabled:cursor-wait disabled:opacity-60"
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>
            <p className="mt-5 text-center text-xs text-neutral-500">
              New to Seidar?{" "}
              <Link href="/signup" className="font-medium text-white hover:underline">
                Create an account
              </Link>
            </p>
          </form>
        </div>
      </div>
    </AuthShell>
  );
}
