import { build } from "esbuild";
import { cp, mkdir, rm } from "node:fs/promises";
await rm("dist", { recursive: true, force: true }); await mkdir("dist");
for (const file of ["index.html","styles.css","app.js","data.js","management-data.js","management.js","manifest.webmanifest","runtime-config.js","apple-touch-icon.png","icon-192.png","icon-512.png","skillward-app-icon.svg"]) await cp(file, `dist/${file}`);
await build({ entryPoints:["src/auth-service.js"], bundle:true, minify:true, format:"iife", outfile:"dist/auth-bundle.js", target:"es2020" });
