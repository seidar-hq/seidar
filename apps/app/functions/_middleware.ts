// Cloudflare Pages middleware, scoped by _routes.json to the page-data files of the static export
// (/<route>.txt) plus /api/*.
// Next's static export loads in-app navigations from /<route>.txt. When that fetch fails (a phone
// dropping its connection while the user is in their wallet app) or the tab is older than the
// current deploy (build-id mismatch), Next falls back to opening the .txt URL as a page, which shows
// raw data or a browser error. A real page visit (Sec-Fetch-Dest: document) is sent to the page.

type Ctx = { request: Request; next: () => Promise<Response> };

export const onRequest = async ({ request, next }: Ctx): Promise<Response> => {
  const url = new URL(request.url);
  if (url.pathname.endsWith(".txt") && request.headers.get("sec-fetch-dest") === "document") {
    const page = url.pathname.slice(0, -".txt".length);
    url.pathname = page === "/index" ? "/" : page;
    url.searchParams.delete("_rsc");
    return Response.redirect(url.toString(), 302);
  }
  return next();
};
