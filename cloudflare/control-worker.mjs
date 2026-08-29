const CONTROL_PATH_PREFIX = "/control/";
const RUNTIME_CONFIG_PATH = "/runtime-config.js";

const SECURITY_HEADERS = Object.freeze({
  "Cache-Control": "no-store",
  "Content-Security-Policy": "default-src 'self'; connect-src 'self' https://*.supabase.co wss://*.supabase.co; img-src 'self' data:; style-src 'self'; script-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-Robots-Tag": "noindex, nofollow, noarchive, nosnippet"
});

function withSecurityHeaders(response) {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) headers.set(name, value);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

function plainResponse(status, message) {
  return withSecurityHeaders(new Response(message, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8" }
  }));
}

function isAllowedAssetPath(pathname) {
  return pathname === RUNTIME_CONFIG_PATH || pathname.startsWith(CONTROL_PATH_PREFIX);
}

export default {
  async fetch(request, env) {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return plainResponse(405, "Method not allowed");
    }

    const url = new URL(request.url);

    if (url.pathname === "/" || url.pathname === "/control") {
      const assetUrl = new URL(request.url);
      assetUrl.pathname = "/control/";
      assetUrl.search = "";
      return withSecurityHeaders(await env.ASSETS.fetch(new Request(assetUrl, request)));
    }

    if (!isAllowedAssetPath(url.pathname)) {
      return plainResponse(404, "Not found");
    }

    return withSecurityHeaders(await env.ASSETS.fetch(request));
  }
};
