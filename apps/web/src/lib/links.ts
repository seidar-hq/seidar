// External destinations used across the site. Configure them in .env.local (see .env.example).
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "";
export const DOCS_URL = process.env.NEXT_PUBLIC_DOCS_URL ?? "";
export const X_URL = process.env.NEXT_PUBLIC_X_URL ?? "https://x.com";
export const DROPPO_URL = process.env.NEXT_PUBLIC_DROPPO_URL ?? "";
export const CONTACT_ENDPOINT = process.env.NEXT_PUBLIC_CONTACT_ENDPOINT ?? "";

export const openInNewTab = (url: string) => {
  if (!url) return;
  window.open(url, "_blank", "noopener,noreferrer");
};

export const openApp = () => openInNewTab(APP_URL);
export const openDocs = () => openInNewTab(DOCS_URL);
