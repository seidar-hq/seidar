"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import AuthShell from "@/components/auth-shell";
import { apiRequest } from "@/lib/api";

function Verify() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [state, setState] = useState<"loading" | "done" | "error">(token ? "loading" : "error");
  const [message, setMessage] = useState(token ? "" : "The verification link is missing its token.");
  useEffect(() => {
    if (!token) return;
    void apiRequest("/v1/auth/verification/confirm", {
      method: "POST",
      body: JSON.stringify({ token }),
    })
      .then(() => setState("done"))
      .catch((e) => {
        setState("error");
        setMessage(
          e instanceof Error ? e.message : "Could not verify this email.",
        );
      });
  }, [token]);
  return (
    <div className="m-auto max-w-sm text-center">
      <h2 className="text-xl">
        {state === "loading"
          ? "Verifying email…"
          : state === "done"
            ? "Email verified"
            : "Verification failed"}
      </h2>
      <p
        className={`mt-3 text-sm ${state === "error" ? "text-red-300" : "text-neutral-500"}`}
      >
        {state === "done" ? "Your Seidar account is now verified." : message}
      </p>
      {state !== "loading" && (
        <Link
          href={state === "done" ? "/organizations" : "/signin"}
          className="mt-5 inline-block rounded-xl bg-white px-5 py-3 text-sm text-black"
        >
          {state === "done" ? "Continue to Seidar" : "Back to sign in"}
        </Link>
      )}
    </div>
  );
}
export default function VerifyEmailPage() {
  return (
    <AuthShell
      title="Verify your email."
      description="Confirm the address associated with your Seidar account."
    >
      <div className="flex min-h-96 flex-1 px-2 sm:px-8">
        <Suspense
          fallback={<p className="m-auto text-sm text-neutral-500">Loading…</p>}
        >
          <Verify />
        </Suspense>
      </div>
    </AuthShell>
  );
}
