import { build } from "esbuild";
import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { pages } from "../src/public-pages.mjs";
await rm("dist", { recursive: true, force: true }); await mkdir("dist");
for (const file of ["index.html","marketing.css","marketing.js","styles.css","app.js","data.js","management-data.js","management.js","manifest.webmanifest","runtime-config.js","apple-touch-icon.png","icon-192.png","icon-512.png","skillward-app-icon.svg"]) await cp(file, `dist/${file}`);
await mkdir("dist/app", { recursive: true }); await cp("app/index.html", "dist/app/index.html");
for (const page of pages) { const target = `dist/${page.path}`; await mkdir(dirname(target), { recursive: true }); await writeFile(target, page.html); }
await mkdir("dist/demo", { recursive: true });
await writeFile("dist/demo/index.html", `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Opening SkillWard Demo</title><meta http-equiv="refresh" content="0;url=/app/?demo=1"><link rel="canonical" href="https://skillwardtraining.com/demo/"></head><body><p>Opening the <a href="/app/?demo=1">SkillWard guided demo</a>…</p><script>location.replace('/app/?demo=1')</script></body></html>`);
await writeFile("dist/robots.txt", "User-agent: *\nAllow: /\nDisallow: /app/\nDisallow: /demo/\nSitemap: https://skillwardtraining.com/sitemap.xml\n");
const publicUrls = ["/", ...pages.filter(page => !page.path.includes("404")).map(page => `/${page.path.replace(/index\.html$/, "")}`)];
await writeFile("dist/sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${publicUrls.map(path => `<url><loc>https://skillwardtraining.com${path}</loc></url>`).join("")}</urlset>`);
await writeFile("dist/_redirects", "/legal.html /legal/privacy/ 301\n/skillward-training/* /app/:splat 302\n/* /404.html 404\n");
await build({ entryPoints:["src/auth-service.js"], bundle:true, minify:true, format:"iife", outfile:"dist/auth-bundle.js", target:"es2020" });

const browserConfig = {
  supabaseUrl: process.env.SUPABASE_URL?.trim() || "",
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY?.trim() || ""
};
await writeFile(
  "dist/runtime-config.js",
  `window.SKILLWARD_CONFIG = Object.freeze(${JSON.stringify(browserConfig)});\n`
);
