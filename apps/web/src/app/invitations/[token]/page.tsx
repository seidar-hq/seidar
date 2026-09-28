"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import AuthShell from "@/components/auth-shell";
import { APIError, apiRequest } from "@/lib/api";

export default function AcceptInvitationPage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const [state, setState] = useState<"accepting" | "signin" | "error">("accepting");
  const [message, setMessage] = useState("Accepting your invitation…");

  useEffect(() => {
    (async () => {
      try {
        await apiRequest(`/v1/invitations/${encodeURIComponent(params.token)}/accept`, { method: "POST" });
        router.replace("/organizations");
      } catch (reason) {
        if (reason instanceof APIError && reason.status === 401) {
          setState("signin");
          setMessage("Sign in with the email address that received this invitation.");
          return;
        }
        setState("error");
        setMessage(reason instanceof Error ? reason.message : "This invitation could not be accepted.");
      }
    })();
  }, [params.token, router]);

  const next = `/invitations/${encodeURIComponent(params.token)}`;
  return <AuthShell title="Join your team." description="Accept an invitation to a Seidar organization and project."><div className="flex min-h-96 flex-1 items-center justify-center"><div className="max-w-sm text-center"><p className={state === "error" ? "text-sm text-red-300" : "text-sm text-neutral-300"}>{message}</p>{state === "signin" && <Link href={`/signin?next=${encodeURIComponent(next)}`} className="mt-5 inline-flex h-10 items-center rounded-xl bg-white px-5 text-sm font-medium text-black">Sign in to continue</Link>}</div></div></AuthShell>;
}
