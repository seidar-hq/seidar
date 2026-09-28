"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AuthShell from "@/components/auth-shell";
import { AuthDivider, GoogleAuthButton } from "@/components/google-auth";
import { apiRequest } from "@/lib/api";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await apiRequest("/v1/auth/signup", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      router.push("/organizations/new");
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not create your account. Please try again.");
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="Start operating confidential assets."
      description="Create your Seidar account and set up your organization on Stellar testnet."
    >
      <div className="min-h-0 flex-1">
        <div className="flex h-full min-h-96 w-full flex-col justify-center px-2 sm:px-8">
          <form onSubmit={submit} className="mx-auto flex w-full max-w-sm flex-col">
            <GoogleAuthButton next="/organizations/new" />
            <AuthDivider />
            <label className="text-xs text-neutral-400">
                Email
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  type="email"
                  autoComplete="email"
                  required
                  className="mt-1.5 h-11 w-full rounded-xl border border-white/10 bg-white/[0.03] px-3.5 text-sm text-white placeholder:text-neutral-600 focus:border-white/30 focus:outline-none"
                />
            </label>
            <label className="mt-4 text-xs text-neutral-400">
                Password
                <input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="8+ characters"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  required
                  className="mt-1.5 h-11 w-full rounded-xl border border-white/10 bg-white/[0.03] px-3.5 text-sm text-white placeholder:text-neutral-600 focus:border-white/30 focus:outline-none"
                />
            </label>
            <label className="mt-4 text-xs text-neutral-400">
                Confirm password
                <input
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat your password"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  required
                  className="mt-1.5 h-11 w-full rounded-xl border border-white/10 bg-white/[0.03] px-3.5 text-sm text-white placeholder:text-neutral-600 focus:border-white/30 focus:outline-none"
                />
            </label>
            {error && <p role="alert" className="mt-4 text-sm text-red-300">{error}</p>}
            <button
                type="submit"
                disabled={loading}
                className="mt-5 h-11 rounded-xl bg-white text-sm font-medium text-black transition-opacity disabled:cursor-wait disabled:opacity-60"
              >
                {loading ? "Creating account…" : "Create account"}
            </button>
            <p className="mt-5 text-center text-xs text-neutral-500">
              Already have an account?{" "}
              <Link href="/signin" className="font-medium text-white hover:underline">
                Sign in
              </Link>
            </p>
          </form>
        </div>
      </div>
    </AuthShell>
  );
}
