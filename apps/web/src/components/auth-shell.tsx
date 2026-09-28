"use client";

import Image from "next/image";
import Link from "next/link";

function Socials() {
  const items = [
    {
      label: "X",
      href: "https://x.com/seidarso",
      path: (
        <>
          <path d="M4 4l11.733 16h4.267l-11.733 -16l-4.267 0"></path>
          <path d="M4 20l6.768 -6.768m2.46 -2.46l6.772 -6.772"></path>
        </>
      ),
    },
    {
      label: "LinkedIn",
      href: "https://www.linkedin.com/company/seidarso",
      path: (
        <>
          <path d="M8 11v5"></path>
          <path d="M8 8v.01"></path>
          <path d="M12 16v-5"></path>
          <path d="M16 16v-3a2 2 0 1 0 -4 0"></path>
          <path d="M3 7a4 4 0 0 1 4 -4h10a4 4 0 0 1 4 4v10a4 4 0 0 1 -4 4h-10a4 4 0 0 1 -4 -4l0 -10"></path>
        </>
      ),
    },
    {
      label: "Instagram",
      href: "https://instagram.com/seidarso",
      path: (
        <>
          <path d="M4 8a4 4 0 0 1 4 -4h8a4 4 0 0 1 4 4v8a4 4 0 0 1 -4 4h-8a4 4 0 0 1 -4 -4l0 -8"></path>
          <path d="M9 12a3 3 0 1 0 6 0a3 3 0 0 0 -6 0"></path>
          <path d="M16.5 7.5v.01"></path>
        </>
      ),
    },
    {
      label: "YouTube",
      href: "https://www.youtube.com/@seidarso",
      path: (
        <>
          <path d="M2 8a4 4 0 0 1 4 -4h12a4 4 0 0 1 4 4v8a4 4 0 0 1 -4 4h-12a4 4 0 0 1 -4 -4v-8"></path>
          <path d="M10 9l5 3l-5 3l0 -6"></path>
        </>
      ),
    },
  ];
  return (
    <div className="flex items-center gap-2 p-5">
      {items.map((s) => (
        <a
          key={s.label}
          href={s.href}
          aria-label={s.label}
          target="_blank"
          rel="noreferrer"
          className="flex size-8 items-center justify-center rounded-lg bg-[#eeeeee]/[0.06] text-[#7b7b7b] transition-colors duration-150 hover:bg-[#eeeeee]/[0.1] hover:text-[#eeeeee]"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-4">
            {s.path}
          </svg>
        </a>
      ))}
    </div>
  );
}

export default function AuthShell({
  title,
  description,
  children,
}: {
  title?: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="dark min-h-screen bg-black text-[#eeeeee]">
      <div className="relative h-screen overflow-hidden p-3 sm:p-6">
        <div className="relative z-10 mx-auto flex h-full w-full max-w-6xl flex-col rounded-[18px] bg-[#181818] p-1 shadow-2xl sm:p-3">
          <div className="flex min-h-0 flex-1 overflow-hidden rounded-2xl border border-[#2a2a2a]">
            <div className="grid h-full w-full grid-cols-1 bg-[#181818] lg:grid-cols-[2fr_3fr]">
              {/* left aside — hidden on mobile, exactly like the original */}
              <aside className="hidden min-w-0 flex-col justify-between overflow-hidden border-r border-[#2a2a2a] lg:flex">
                <div>
                  <Link href="/" aria-label="Seidar home" className="flex items-center gap-2 px-6 py-6">
                    <Image src="/logo.png" alt="Seidar" width={36} height={36} className="size-9 mix-blend-screen" />
                  </Link>
                  {title && (
                    <div className="mt-8 text-sm">
                      <div className="p-5">
                        <h1 className="text-2xl font-[590] tracking-[-0.022em] text-[#eeeeee]">{title}</h1>
                        {description && <p className="mt-2 max-w-xs text-sm leading-5 text-[#7b7b7b]">{description}</p>}
                      </div>
                    </div>
                  )}
                </div>
                <Socials />
              </aside>

              {/* right content */}
              <div className="flex h-full min-h-0 flex-col bg-[#181818]">
                <div className="flex items-center px-8 pt-6 pb-2 lg:hidden">
                  <Link href="/" className="flex items-center gap-2">
                    <Image src="/logo.png" alt="Seidar" width={36} height={36} className="size-9 mix-blend-screen" />
                    <span className="text-base font-semibold tracking-tight text-[#eeeeee]">Seidar</span>
                  </Link>
                </div>
                <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-8 sm:px-8">
                  {title && (
                    <div className="flex flex-col gap-2 text-left lg:hidden">
                      <h1 className="text-2xl font-[590] tracking-[-0.022em] text-[#eeeeee]">{title}</h1>
                      {description && <p className="text-sm leading-5 text-[#7b7b7b]">{description}</p>}
                    </div>
                  )}
                  {children}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
