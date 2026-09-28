import Image from "next/image";
import Link from "next/link";
import styles from "./docs.module.css";

const request = `import { Seidar } from "@seidar/sdk";

const seidar = new Seidar({ apiKey: process.env.SEIDAR_API_KEY });
const project = seidar.project(process.env.SEIDAR_PROJECT_ID!);
const assets = await project.assets();
const recovery = await project.recovery(assets[0].id);
const events = await project.events(assets[0].id, { limit: 100 });`;

const boundary = `import { ChainClient } from "@ctd/sdk";

// Wallet-side only: canonical CT proofs and signing.
const ct = new ChainClient({ rpcUrl, networkPassphrase, contracts });
const registered = await ct.isRegistered(wallet.publicKey);

// Operational API: wallet keys never enter this request.
const accounts = await project.accounts(asset.id);`;

export default function DocsPage() {
  return (
    <main className={styles.page}>
      <header>
        <Link href="/" className={styles.brand}>
          <Image src="/logo.png" alt="" width={34} height={34} />
          <span>Seidar</span>
        </Link>
        <nav>
          <a href="#api">API</a>
          <a href="#sdk">SDK</a>
          <a href="#webhooks">Webhooks</a>
          <Link href="/signin">Dashboard</Link>
        </nav>
      </header>
      <section className={styles.hero}>
        <span>DEVELOPER PREVIEW · STELLAR TESTNET</span>
        <h1>
          Build around confidential assets,
          <br />
          not operational gaps.
        </h1>
        <p>
          Use Seidar for project access, asset configuration, policy state,
          durable events, alerts, disclosures, and webhooks. Use the canonical
          CT client for keys, proofs, transfers, recovery, and auditor
          decryption.
        </p>
        <div>
          <a href="/openapi.json">Download OpenAPI</a>
          <Link href="/signup">Create a project</Link>
        </div>
      </section>
      <section className={styles.grid} id="api">
        <aside>
          <span>01</span>
          <h2>Operational API</h2>
        </aside>
        <div>
          <h3>Project-scoped by default</h3>
          <p>
            Every key belongs to one project and carries explicit scopes such as{" "}
            <code>assets:read</code>, <code>activity:read</code>, or{" "}
            <code>disclosures:write</code>. Secret values are shown once and only
            hashes are retained.
          </p>
          <pre>
            <code>{request}</code>
          </pre>
        </div>
      </section>
      <section className={styles.grid} id="sdk">
        <aside>
          <span>02</span>
          <h2>Client boundary</h2>
        </aside>
        <div>
          <h3>Keep cryptography and signing in the wallet</h3>
          <p>
            Seidar deliberately does not reimplement Confidential Token
            cryptography. The reference integration is pinned to the
            documentation-linked <code>@ctd/sdk</code> source and Seidar&apos;s
            typed SDK.
          </p>
          <pre>
            <code>{boundary}</code>
          </pre>
          <div className={styles.note}>
            <b>Never send private material</b>
            <span>
              Wallet signing keys, CT spending/viewing keys, auditor private
              keys, decrypted openings, and proof witnesses do not belong in
              Seidar API requests.
            </span>
          </div>
        </div>
      </section>
      <section className={styles.grid} id="webhooks">
        <aside>
          <span>03</span>
          <h2>Signed webhooks</h2>
        </aside>
        <div>
          <h3>Retry-safe operational delivery</h3>
          <p>
            Webhook requests include a timestamped HMAC-SHA256 signature. Verify
            the raw body, enforce timestamp tolerance, return 2xx only after
            durable processing, and deduplicate by payload ID.
          </p>
          <pre>
            <code>{`import { verifyWebhook } from "@seidar/sdk";

const valid = await verifyWebhook(rawBody, signature, secret);
if (!valid) return new Response("invalid", { status: 401 });`}</code>
          </pre>
        </div>
      </section>
      <footer>
        <span>
          Confidential Tokens are currently an unaudited testnet developer
          preview.
        </span>
        <Link href="/">← Back to Seidar</Link>
      </footer>
    </main>
  );
}
