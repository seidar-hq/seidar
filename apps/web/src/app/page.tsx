"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import styles from "./page.module.css";

const stats = [
  [
    "Lending & Borrowing",
    "Boost & Repay in one tx",
    "Supply assets, borrow against your collateral, and mange positions across Stellar lending markets.",
  ],
  [
    "Automation",
    "Keepers + on-chain guards",
    "Protect against liquidation, take profits, reduce exposure, or rebalance your position based on conditions you define",
  ],
  [
    "Loan Shifter",
    "Move without unwinding",
    "Shift collateral, debt, or whole positions across pools and protocols without closing and reopening manually.",
  ],
  [
    "Accounts",
    "Smart accounts + gas credits",
    "Passkey smart accounts with scoped keeper keys, optional multisig policy, and sponsored transactions.",
  ],
    
  [
    "Position Management",
    "Smart accounts + gas credits",
    "Track collateral, debt, health factors, exposure, yields, and activity without switching between multiple applications.",
  ],

  [
    "Dex Aggregation",
    "Smart accounts + gas credits",
    "Swap tokens, set limit orders, and access liquidity across Stellar's leading DEXs with routes optimized for competitive execution.",
  ],
];

const jobs = [
  ["B", "XLM / USDC · Blend", "Active", "3.2x", "Auto-repay on", "Healthy"],
  ["X", "USDC / XLM · XOXNO", "Active", "2.1x", "Stop-loss on", "Healthy"],
  ["P", "XLM / USDC · Peridot", "Review", "1.8x", "No automation", "Attention"],
  ["B", "EURC / USDC · Blend", "Draft", "1.0x", "Not attached", "Pending"],
  ["D", "USDC Vault · DeFindex", "Active", "Yield", "Auto-compound", "Healthy"],
];

const candidates = [
  [
    "Protected",
    "2",
    [
      ["CABX…9F2Q", "XLM leverage", "Health 1.82 · Auto-repay armed"],
      ["CC11…7H4D", "USDC loop", "Health 2.10 · Stop-loss armed"],
    ],
  ],
  [
    "Watch",
    "3",
    [
      ["CB7Q…K9A4", "XLM position", "Health 1.35 · Near threshold"],
      ["GC8M…V1R6", "Peridot loan", "Automation review open"],
      ["GAX2…Q4L8", "New position", "Simulation pending"],
    ],
  ],
  [
    "Attention",
    "1",
    [["GDQ9…P3W5", "Underwater loan", "Keeper repay queued · On-chain"]],
  ],
] as const;

const projects = [
  [
    "Recipe SDK",
    "Compose supply, borrow, swap and flash steps into one atomic Soroban call.",
    "TypeScript SDK · Soroban",
  ],
  [
    "Keeper network",
    "Off-chain watchers trigger; guardian contract re-verifies price + health before acting.",
    "Reflector · RPC events",
  ],
  [
    "Gas credits",
    "Sponsored transactions via OZ Relayer. Balance drains per action, then self-pay.",
    "USDC fees · XLM relay",
  ],
];

const useCases = [
  {
    audience: "Leverage traders",
    title: "Loop XLM and stables without the clicks",
    description:
      "Boost, repay, and close Blend, XOXNO and Peridot positions in one transaction with visible slippage and health preview.",
  },
  {
    audience: "Passive borrowers",
    title: "Borrow without watching charts",
    description:
      "Arm liquidation protection and stop-loss once. Keepers monitor Reflector; the guardian re-checks before every automated repay.",
  },
  {
    audience: "Yield holders",
    title: "Park stables where they earn",
    description:
      "Route USDC and EURC across DeFindex and Templar curated vaults with one-click deposit, rebalance, and withdraw.",
  },
  {
    audience: "Position movers",
    title: "Shift pools without unwinding",
    description:
      "Move collateral, debt, or full positions between Blend, XOXNO and Peridot pools atomically instead of closing and reopening.",
  },
  {
    audience: "Teams & treasuries",
    title: "Share control without sharing keys",
    description:
      "Upgrade the smart account to an optional multisig policy. Keep automation on a scoped, expiring keeper key.",
  },
  {
    audience: "Developers & agents",
    title: "Build on recipes, not raw pools",
    description:
      "Use the SDK to quote and build unsigned XDR. MCP access lands last with read + quote + build tools and no key custody.",
  },
];

const faqs = [
  [
    "What does Seidar do?",
    "Seidar is the position layer for Stellar lending: create, leverage, shift and automate Blend, XOXNO and Peridot positions in one Soroban transaction.",
  ],
  [
    "Do I need a smart account?",
    "Manual supply, borrow and swaps work with a normal Freighter wallet. Automation, recipes and shifting require a passkey smart account so keepers get scoped, revocable permission.",
  ],
  [
    "How does automation stay trustless?",
    "Keepers watch Reflector prices and pool health off-chain, but the guardian contract re-verifies trigger + health on-chain before any repay or swap. No valid trigger, no action.",
  ],
  [
    "What does it cost?",
    "Plain supply and borrow are free of Seidar fees. Complex one-tx actions take a small swap-based service fee; automated executions add a small automation fee. Soroban resource fees still apply — spend gas credits first, then pay in USDC or XLM.",
  ],
];

function Arrow({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </svg>
  );
}

function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <header className={styles.header}>
      <nav className={`${styles.container} ${styles.nav}`}>
        <Link href="/" className={styles.brand} aria-label="Seidar home">
          <Image
            src="/logo.png"
            alt="Seidar logo"
            width={36}
            height={36}
            priority
          />
        </Link>
        <div className={styles.navLinks}>
          <div className={styles.navGroup}>
            <button type="button">
              Products <span>↓</span>
            </button>
            <div className={styles.dropdown}>
              <a href="#community">
                <b>Leverage</b>
                <small>Boost and repay Blend, XOXNO, Peridot in one tx</small>
              </a>
              <a href="#community">
                <b>Automation</b>
                <small>Liquidation protection, stop-loss, auto-leverage</small>
              </a>
              <a href="#community">
                <b>Shifter</b>
                <small>Move collateral, debt and positions atomically</small>
              </a>
              <a href="#community">
                <b>Savings</b>
                <small>DeFindex and Templar vault yield in one place</small>
              </a>
              <a href="#community">
                <b>Smart accounts</b>
                <small>Passkeys, keeper keys, optional multisig</small>
              </a>
            </div>
          </div>
          <div className={styles.navGroup}>
            <button type="button">
              Resources <span>↓</span>
            </button>
            <div className={styles.dropdown}>
              <a href="#footer">
                <b>Blog</b>
                <small>Insights from the Seidar team</small>
              </a>
              <Link href="/docs#sdk">
                <b>API &amp; SDK</b>
                <small>Quote and build unsigned recipe XDR</small>
              </Link>
              <Link href="/docs">
                <b>Documentation</b>
                <small>Guides, concepts, and API references</small>
              </Link>
            </div>
          </div>
          <Link href="/docs">Docs</Link>
        </div>
        <div className={styles.headerActions}>
          <Link href="/signin" className={styles.lightButton}>
            Launch app <Arrow size={14} />
          </Link>
        </div>
        <button
          className={styles.menuButton}
          type="button"
          aria-label="Open menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen(!menuOpen)}
        >
          <span />
          <span />
          <span />
        </button>
        {menuOpen && (
          <div className={styles.mobileMenu}>
            <a href="#community">Leverage</a>
            <a href="#community">Automation</a>
            <a href="#community">Shifter</a>
            <a href="#community">Savings</a>
            <a href="#community">Smart accounts</a>
            <a href="#footer">Blog</a>
            <Link href="/docs#sdk">API &amp; SDK</Link>
            <Link href="/docs">Documentation</Link>
            <Link href="/docs">Docs</Link>
          </div>
        )}
      </nav>
    </header>
  );
}

function ProductPreview() {
  const [tab, setTab] = useState<"assets" | "controls">("assets");
  return (
    <div className={styles.heroPreviewWrap}>
      <div className={`${styles.container} ${styles.productPreview}`}>
        <div className={styles.previewTabs}>
          <button
            type="button"
            className={tab === "assets" ? styles.activeTab : ""}
            onClick={() => setTab("assets")}
          >
            <span>⌘</span> Leveraged positions
          </button>
          <button
            type="button"
            className={tab === "controls" ? styles.activeTab : ""}
            onClick={() => setTab("controls")}
          >
            <span>ϟ</span> Automation &amp; guard controls
          </button>
        </div>
        <div className={styles.previewImage}>
          <Image
            src={
              tab === "assets"
                ? "/product/confidential-assets-dashboard.png"
                : "/product/policy-auditor-dashboard.png"
            }
            alt={
              tab === "assets"
                ? "Seidar leveraged position dashboard"
                : "Seidar automation and guard controls"
            }
            width={1536}
            height={1024}
            priority
          />
        </div>
      </div>
    </div>
  );
}

const protocols = [
  { code: "Bl", name: "Blend", kind: "Lending", isNew: false },
  { code: "Xo", name: "XOXNO", kind: "Lending", isNew: true },
  { code: "Pe", name: "Peridot", kind: "Lending", isNew: true },
  { code: "Te", name: "Templar", kind: "Vaults", isNew: true },
  { code: "So", name: "Soroswap", kind: "DEX", isNew: false },
  { code: "Aq", name: "Aqua", kind: "DEX", isNew: false },
  { code: "Ph", name: "Phoenix", kind: "DEX", isNew: false },
  { code: "De", name: "DeFindex", kind: "Vaults", isNew: false },
  { code: "Re", name: "Reflector", kind: "Oracle", isNew: false },
  { code: "Xl", name: "Stellar DEX", kind: "Native", isNew: false },
];

function ProtocolGrid() {
  return (
    <section className={styles.statsSection} style={{ paddingTop: 8 }}>
      <div className={styles.container}>
        <p
          style={{
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: "0.14em",
            color: "#8a8a91",
            marginBottom: 18,
          }}
        >
          ALL THE TOP TIER PROTOCOLS ON STELLAR
        </p>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
            borderTop: "1px solid #282828",
            borderLeft: "1px solid #282828",
          }}
        >
          {protocols.map((p) => (
            <div
              key={p.name}
              style={{
                position: "relative",
                borderRight: "1px solid #282828",
                borderBottom: "1px solid #282828",
                padding: "28px 12px 20px",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 12,
                background: "#000",
              }}
            >
              {p.isNew && (
                <span
                  style={{
                    position: "absolute",
                    top: 8,
                    left: 10,
                    fontSize: 11,
                    fontWeight: 600,
                    color: "#57c36b",
                  }}
                >
                  New
                </span>
              )}
              <span style={{ fontSize: 30, fontWeight: 800, color: "#f7f7f7", letterSpacing: "-0.02em" }}>
                {p.code}
              </span>
              <span style={{ textAlign: "center" }}>
                <span style={{ display: "block", fontSize: 13.5, color: "#ddd" }}>{p.name}</span>
                <span style={{ display: "block", fontSize: 11, color: "#666", marginTop: 2 }}>{p.kind}</span>
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function CandidateCard({
  kind,
}: {
  kind: "profile" | "applications" | "teams";
}) {
  const content = {
    profile: {
      image: "/decor/seidar-assets-bg.png",
      title: "Every position in one view",
      desc: "Track health, leverage, automation state and gas credits across Blend, XOXNO and Peridot.",
      panel: (
        <div className={styles.profilePanel}>
          <small>Open positions</small>
          <strong>5</strong>
          <span>↗ 2 protected · 1 needs attention</span>
          <footer>■ 3 Leveraged　 ■ 1 Loan　 ■ 1 Vault</footer>
        </div>
      ),
    },
    applications: {
      image: "/decor/seidar-policy-bg.png",
      title: "Automation without babysitting",
      desc: "Arm protection once. Keepers watch; the guardian verifies price and health before acting.",
      panel: (
        <div className={styles.applicationPanel}>
          <header>
            <span>Keeper activity⌄</span>
            <small>Last 7 days</small>
          </header>
          <b>14 executions</b>
          <em>0 missed liquidations</em>
          <div className={styles.sparkline} />
          <footer>
            Mon　 Tue　 Wed　 Thu　 Fri
            <br />
            <strong>All triggers verified on-chain</strong>
          </footer>
        </div>
      ),
    },
    teams: {
      image: "/decor/seidar-auditor-bg.png",
      title: "Shared control stays explicit",
      desc: "Add co-signers under an optional multisig policy while automation keeps its scoped keeper key.",
      panel: (
        <div className={styles.teamsPanel}>
          <header>
            Multisig policy <small>2-of-3</small>
          </header>
          <p>
            <b>◉</b> Owner passkey <span>Active</span>
          </p>
          <p>
            <b>♣</b> Co-signer <span>Configured</span>
          </p>
          <p>
            <b>✣</b> Keeper key <span>Scoped · 24h</span>
          </p>
        </div>
      ),
    },
  }[kind];
  return (
    <article className={styles.candidateCard}>
      <div
        className={styles.candidateVisual}
        style={{
          backgroundImage: `linear-gradient(rgba(0,0,0,.4),rgba(0,0,0,.88)),url(${content.image})`,
        }}
      >
        {content.panel}
      </div>
      <h3>{content.title}</h3>
      <p>{content.desc}</p>
    </article>
  );
}

function BrowserFrame({
  path,
  title,
  children,
}: {
  path: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className={styles.browserFrame}>
      <div className={styles.browserBar}>
        <span className={styles.dots}>● ● ●</span>
        <span>◐</span>
        <div>▣ {path}</div>
      </div>
      <div className={styles.browserTitle}>
        <span>▣</span>
        <b>{title}</b>
      </div>
      {children}
    </div>
  );
}

function JobsBoard() {
  return (
    <BrowserFrame path="app.seidar.xyz/portfolio" title="Positions">
      <div className={styles.jobsHeader}>
        TRACKED POSITIONS <b>5</b>
      </div>
      <div className={styles.jobsTable}>
        <div className={styles.jobsColumns}>
          <span>POSITION</span>
          <span>LEVERAGE</span>
          <span>AUTOMATION</span>
          <span>HEALTH</span>
        </div>
        {jobs.map((job) => (
          <div className={styles.jobRow} key={job[1]}>
            <i>{job[0]}</i>
            <b>
              {job[1]} {job[2] && <small>{job[2]}</small>}
            </b>
            <span>{job[3]}</span>
            <span>{job[4]}</span>
            <span>{job[5]}</span>
          </div>
        ))}
      </div>
    </BrowserFrame>
  );
}

function HiringBoard() {
  return (
    <BrowserFrame path="app.seidar.xyz/automate" title="Automation Registry">
      <div className={styles.pipeline}>
        {candidates.map(([stage, count, cards], index) => (
          <div className={styles.pipelineColumn} key={stage}>
            <header
              style={{
                borderLeftColor:
                  index === 0 ? "#57c36b" : index === 1 ? "#ffad15" : "#e66b6b",
              }}
            >
              {stage} <small>{count}</small>
            </header>
            {cards.map(([id, name, meta]) => (
              <article key={id}>
                <small>{id}</small>
                <b>{name}</b>
                <span>✦ {meta}</span>
              </article>
            ))}
          </div>
        ))}
      </div>
    </BrowserFrame>
  );
}

function ProfileBoard() {
  return (
    <BrowserFrame
      path="app.seidar.xyz/developers"
      title="Developer Infrastructure"
    >
      <div className={styles.person}>
        <div className={styles.avatar}>SDK</div>
        <div>
          <b>Recipe integration　✹</b>
          <small>● Testnet　·　▣ recipes:build　·　♟ positions:read</small>
        </div>
      </div>
      <div className={styles.aboutBox}>
        <b>Integration boundary</b>
        <p>
          Wallets sign; Seidar builds unsigned recipe XDR, tracks positions,
          and runs keepers. Keys never leave the client.
        </p>
      </div>
      <div className={styles.proofBox}>
        <b>Infrastructure</b>
        <div>
          {projects.map(([title, desc, tags]) => (
            <article key={title}>
              <strong>{title}</strong>
              <p>{desc}</p>
              <small>{tags}</small>
            </article>
          ))}
        </div>
      </div>
    </BrowserFrame>
  );
}

function FeatureRow({
  number,
  title,
  description,
  detailTitle,
  detail,
  visual,
}: {
  number: string;
  title: string;
  description: string;
  detailTitle: string;
  detail: string;
  visual: React.ReactNode;
}) {
  return (
    <div className={styles.featureRow}>
      <div className={styles.featureCopy}>
        <div>
          <small>{number}</small>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        <div className={styles.featureDetail}>
          <h3>{detailTitle}</h3>
          <p>{detail}</p>
        </div>
      </div>
      <div className={styles.featureVisual}>{visual}</div>
    </div>
  );
}

function UseCaseGrid() {
  return (
    <div className={styles.testimonialGrid}>
      {useCases.map((item, index) => (
        <article key={item.audience}>
          <span>{String(index + 1).padStart(2, "0")}</span>
          <div>
            <h3>{item.audience}</h3>
            <strong>{item.title}</strong>
            <p>{item.description}</p>
          </div>
        </article>
      ))}
    </div>
  );
}

function Footer() {
  const columns = [
    [
      "PRODUCT",
      "Leverage",
      "Automation",
      "Shifter",
      "Savings",
      "Smart accounts",
    ],
    ["DEVELOPERS", "API", "TypeScript SDK", "Keeper", "Documentation"],
    ["COMPANY", "About", "Contact", "Terms", "Privacy"],
    ["NETWORK", "Stellar", "Soroban", "Testnet status"],
  ];
  return (
    <>
      <section className={styles.askRow}>
        <div className={styles.container}>
          <span>Manage, leverage and automate DeFi on Stellar</span>
          <div>
            <b>◎</b>
            <b>✺</b>
            <b>⌁</b>
            <b>✦</b>
            <b>◒</b>
          </div>
        </div>
      </section>
      <footer className={styles.footer} id="footer">
        <div className={styles.container}>
          <div className={styles.footerGrid}>
            <div className={styles.footerIntro}>
              <b>Seidar</b>
              <p>
                The position layer for Stellar lending: leverage, automation,
                shifting, savings, smart accounts and gas credits.
              </p>
              <small>Testnet first · Soroban</small>
            </div>
            {columns.map(([title, ...links]) => (
              <div className={styles.footerColumn} key={title}>
                <b>{title}</b>
                {links.map((link) => (
                  <a href="#" key={link}>
                    {link}
                  </a>
                ))}
              </div>
            ))}
          </div>
          <div className={styles.footerBottom}>
            <span>© 2026 Seidar. All rights reserved.</span>
            <div>
              <a href="#">Terms</a>
              <a href="#">Privacy</a>
            </div>
          </div>
        </div>
      </footer>
    </>
  );
}

export default function Home() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  return (
    <div className={styles.site}>
      <Header />
      <main>
        <section className={styles.hero}>
          <div className={`${styles.container} ${styles.heroGrid}`}>
            <h1>Manage, leverage and automate DeFi on Stellar.</h1>
            <div className={styles.heroAside}>
              <p>
                Seidar gives borrowers the boost, protection, shifting and
                automation to run Blend, XOXNO and Peridot positions in one
                transaction.
              </p>
              <div>
                <Link href="/docs" className={styles.darkButton}>
                  Read the docs
                </Link>
                <Link href="/signin" className={styles.lightButton}>
                  Launch app <Arrow />
                </Link>
              </div>
            </div>
          </div>
        </section>
        <ProductPreview />
        <ProtocolGrid />
        <section className={styles.statsSection} id="community">
          <div className={styles.container}>
            <h2>One place to manage your Stellar Defi.</h2>
            <p className={styles.sectionLead}>
              Seidar brings the tools you need to manage and automate your
              <br />
              Defi positions across Stellar into a single interface
            </p>
            <div className={styles.statsGrid}>
              {stats.map(([label, title, desc]) => (
                <article key={label}>
                  <span>{label}</span>
                  <div>
                    <h3>{title}</h3>
                    <p>{desc}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>
        <section className={styles.candidateSection}>
          <div className={styles.container}>
            <div className={styles.sectionHeading}>
              <h2>Build your own strategy.</h2>
              <p>
                Combine Defi actions, create unique strategies, explore existing ones and execute in a single transaction.
              </p>
            </div>
            <div className={styles.candidateGrid}>
              <CandidateCard kind="profile" />
              <CandidateCard kind="applications" />
              <CandidateCard kind="teams" />
            </div>
          </div>
        </section>
        <section className={styles.features} id="developers">
          <div className={styles.featuresInner}>
            <FeatureRow
              number="01"
              title="Do more in one transaction"
              description="Compose flash liquidity, Soroswap routing and pool calls into a single atomic recipe with health preview."
              detailTitle="Every step understood"
              detail="Inspect quote, slippage, fees and resulting health before signing. Panic anywhere reverts everything."
              visual={<JobsBoard />}
            />
            <FeatureRow
              number="02"
              title="Stay protected with evidence"
              description="Arm auto-repay, stop-loss and auto-leverage through keepers backed by on-chain guardian checks."
              detailTitle="Triggers, not blind bots"
              detail="Keepers propose; the guardian verifies Reflector price and pool health on-chain before any automated repay or swap."
              visual={<HiringBoard />}
            />
            <FeatureRow
              number="03"
              title="Integrate without rebuilding positions"
              description="Use scoped APIs, the recipe SDK, gas credits and unsigned XDR around canonical Stellar wallets."
              detailTitle="Wallet-aware infrastructure"
              detail="Keep keys client-side while Seidar handles quoting, simulation, keeper monitoring, credits and compatibility boundaries."
              visual={<ProfileBoard />}
            />
          </div>
        </section>
        <section className={styles.testimonials} id="use-cases">
          <div className={styles.container}>
            <h2>
              Discover opportunities across Stellar
            </h2>
            <p className={styles.sectionLead}>
              Explore lending markets, trading opportunities, yields, and strategies<br />across the stellar ecosystem before even connecting your wallet
            </p>
            <UseCaseGrid />
          </div>
        </section>
        <section className={styles.faq} id="faq">
          <div className={`${styles.container} ${styles.faqGrid}`}>
            <div>
              <span>[ FAQ ]</span>
              <h2>
                Frequently asked
                <br />
                questions
              </h2>
              <p>
                What Seidar manages, where the protocol boundary sits, and what
                is safe to use on testnet first.
              </p>
            </div>
            <div className={styles.faqList}>
              {faqs.map(([question, answer], index) => (
                <div className={styles.faqItem} key={question}>
                  <button
                    type="button"
                    onClick={() => setOpenFaq(openFaq === index ? null : index)}
                  >
                    <b>{question}</b>
                    <span>{openFaq === index ? "−" : "⌄"}</span>
                  </button>
                  {openFaq === index && <p>{answer}</p>}
                </div>
              ))}
              <a href="#developers">
                Read More <Arrow />
              </a>
            </div>
          </div>
        </section>
        <section className={styles.cta}>
          <Image src="/cta-confidential-assets.png" alt="" fill sizes="100vw" />
          <div className={styles.ctaShade} />
          <div className={`${styles.container} ${styles.ctaContent}`}>
            <h2>
              Built for the next generation of Stellar Defi.
            </h2>
            <div>
              <Link href="/signin" className={styles.lightButton}>
                Launch app <Arrow />
              </Link>
              <Link href="/contact">Talk to us</Link>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
