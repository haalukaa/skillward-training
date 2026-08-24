import { spawnSync } from "node:child_process";

function invoke(args) {
  const result = spawnSync("supabase", args, { encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`supabase ${args.join(" ")} failed: ${result.stderr || result.stdout}`);
  }
  return `${result.stdout || ""}${result.stderr || ""}`;
}

const version = invoke(["--version"]).trim();
console.log(`Supabase CLI ${version}`);

const pending = [[]];
const visited = new Set();
while (pending.length) {
  const path = pending.shift();
  const key = path.join(" ");
  if (visited.has(key)) continue;
  visited.add(key);
  const help = invoke([...path, "--help"]);
  console.log(`Inspected: supabase${key ? ` ${key}` : ""} --help`);
  if (path.length >= 4) continue;
  for (const line of help.split(/\r?\n/)) {
    const match = line.match(/^\s{2,}([a-z][a-z0-9-]*)\s{2,}\S/);
    if (!match || ["help"].includes(match[1])) continue;
    pending.push([...path, match[1]]);
  }
}

if (visited.size < 10) throw new Error("Supabase CLI help discovery found too few commands.");
console.log(`Supabase CLI help discovery passed for ${visited.size} command paths.`);
