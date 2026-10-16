import type { APIRoute } from "astro";

// The panel, the cart and the API are not for search engines; product photos (/img) are.
export const GET: APIRoute = ({ url }) =>
  new Response(
    `User-agent: *
Disallow: /panel
Disallow: /carrito
Disallow: /api/

Sitemap: ${new URL("/sitemap.xml", url.origin).href}
`,
    { headers: { "content-type": "text/plain; charset=utf-8" } },
  );
