import Link from "next/link";

export default function PrivacyPage() {
  return (
    <div className="pf-card legal-page">
      <h1 className="strat-hero-title">Privacy Policy</h1>
      <p>
        Seidar does not create accounts and does not ask for personal
        information. The app works with the wallet address you choose to
        connect, and reads public on-chain data for it.
      </p>
      <p>
        Positions, balances and quotes are fetched from the Seidar API and
        public Stellar infrastructure; they are not stored against an identity.
        Your wallet connection itself is handled entirely in your browser by
        the wallet extension you use.
      </p>
      <p>
        The full Privacy Policy will be published before the public launch.{" "}
        <Link href="/">Back to the dashboard</Link>.
      </p>
    </div>
  );
}
