import { env } from "cloudflare:workers";
import type { APIRoute } from "astro";
import { sitemapUrls } from "../lib/pages";

const escapeXml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const GET: APIRoute = async ({ url }) => {
  const urls = await sitemapUrls(env, url.origin);
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${escapeXml(u)}</loc></url>`).join("\n")}
</urlset>
`;
  return new Response(body, { headers: { "content-type": "application/xml; charset=utf-8" } });
};
