"use client";

import { googleSignInURL } from "@/lib/api";

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-[18px] shrink-0">
      <path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.55-.2-2.27H12v4.51h6.45a5.52 5.52 0 0 1-2.39 3.52v2.93h3.87c2.26-2.08 3.56-5.15 3.56-8.69Z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.95-1.07 7.93-2.9l-3.87-2.93c-1.07.72-2.44 1.15-4.06 1.15-3.12 0-5.77-2.11-6.72-4.95H1.29v3.03A12 12 0 0 0 12 24Z" />
      <path fill="#FBBC05" d="M5.28 14.37A7.2 7.2 0 0 1 4.9 12c0-.82.14-1.62.38-2.37V6.6H1.29A12 12 0 0 0 0 12c0 1.93.46 3.75 1.29 5.4l3.99-3.03Z" />
      <path fill="#EA4335" d="M12 4.68c1.76 0 3.34.61 4.58 1.8l3.44-3.44A11.55 11.55 0 0 0 12 0 12 12 0 0 0 1.29 6.6l3.99 3.03C6.23 6.79 8.88 4.68 12 4.68Z" />
    </svg>
  );
}

export function GoogleAuthButton({ next }: { next?: string }) {
  return (
    <button
      type="button"
      onClick={() => {
        const requestedNext =
          next ?? new URLSearchParams(window.location.search).get("next") ?? undefined;
        window.location.assign(googleSignInURL(requestedNext));
      }}
      className="flex h-11 w-full items-center justify-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] text-sm font-medium text-[#eeeeee] transition-colors hover:border-white/20 hover:bg-white/[0.06]"
    >
      <GoogleIcon />
      Continue with Google
    </button>
  );
}

export function AuthDivider() {
  return (
    <div className="my-5 flex items-center gap-3" aria-hidden="true">
      <span className="h-px flex-1 bg-white/10" />
      <span className="text-[10px] font-medium tracking-[0.14em] text-neutral-500 uppercase">or</span>
      <span className="h-px flex-1 bg-white/10" />
    </div>
  );
}
