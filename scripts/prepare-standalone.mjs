import { cp, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";

const root = process.cwd();
const standaloneDir = path.join(root, ".next", "standalone");
const standaloneNextDir = path.join(standaloneDir, ".next");
const publicDir = path.join(root, "public");
const nextStaticDir = path.join(root, ".next", "static");

if (!existsSync(standaloneDir)) {
  console.log("No standalone output found; skipping static asset copy.");
  process.exit(0);
}

await mkdir(standaloneNextDir, { recursive: true });

if (existsSync(publicDir)) {
  await cp(publicDir, path.join(standaloneDir, "public"), {
    recursive: true,
    force: true
  });
}

if (existsSync(nextStaticDir)) {
  await cp(nextStaticDir, path.join(standaloneNextDir, "static"), {
    recursive: true,
    force: true
  });
}

console.log("Standalone static assets copied.");
