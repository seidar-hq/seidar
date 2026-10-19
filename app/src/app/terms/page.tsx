import Link from "next/link";

export default function TermsPage() {
  return (
    <div className="pf-card legal-page">
      <h1 className="strat-hero-title">Terms of Use</h1>
      <p>
        Seidar is a non-custodial interface for Stellar DeFi markets, currently
        a preview build under active development. Nothing in the app is
        financial advice, and every transaction is quoted and signed in your
        own wallet — Seidar never takes custody of funds.
      </p>
      <p>
        Markets move. Quotes, APYs and positions shown here come from live
        on-chain sources and can change between the moment you see them and the
        moment a transaction settles. Always review what your wallet asks you
        to sign.
      </p>
      <p>
        The full Terms of Use will be published before the public launch.
        Until then, use the preview at your own risk.{" "}
        <Link href="/">Back to the dashboard</Link>.
      </p>
    </div>
  );
}
