import Link from "next/link";
import AuthShell from "@/components/auth-shell";

export default function ContactPage() {
  return (
    <AuthShell
      title="Talk to the Seidar team."
      description="Tell us what you are building with Stellar Confidential Tokens and where you need operational infrastructure."
    >
      <div className="flex min-h-full items-center justify-center py-8">
        <section className="w-full max-w-xl rounded-xl border border-white/10 bg-white/[0.02] p-6 sm:p-8">
          <p className="text-xs font-medium tracking-[0.16em] text-neutral-500 uppercase">
            Email support
          </p>
          <h2 className="mt-5 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            Start a conversation about confidential assets.
          </h2>
          <p className="mt-3 max-w-lg text-sm leading-6 text-neutral-400">
            Share your asset, testnet integration, or issuer workflow with us.
            We&apos;ll get back to you within 24 hours.
          </p>

          <a
            href="mailto:team@seidar.so"
            className="mt-8 block rounded-xl border border-white/10 bg-black/30 p-5 transition-colors hover:border-white/20 hover:bg-black/50"
          >
            <span className="block text-xs text-neutral-500">Email</span>
            <strong className="mt-1 block text-base font-medium text-white">
              team@seidar.so
            </strong>
          </a>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/signin"
              className="inline-flex h-10 items-center rounded-xl bg-white px-5 text-sm font-medium text-black"
            >
              Start building
            </Link>
            <Link
              href="/docs"
              className="inline-flex h-10 items-center rounded-xl border border-white/10 px-5 text-sm font-medium text-neutral-300 transition-colors hover:bg-white/[0.05]"
            >
              Read the docs
            </Link>
          </div>
        </section>
      </div>
    </AuthShell>
  );
}
