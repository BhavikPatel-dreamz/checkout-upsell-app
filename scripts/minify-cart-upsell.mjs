import { mkdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { minify } from "terser";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const srcDir = join(__dirname, "cart-upsell-src");
const assetsDir = join(repoRoot, "extensions", "cart-upsell", "assets");
const files = ["product-upsell.js", "cart-upsell.js", "cart-drawer-upsell.js"];
const LIMIT = 10_000;

mkdirSync(assetsDir, { recursive: true });

let failed = false;

for (const file of files) {
  const srcPath = join(srcDir, file);
  const outPath = join(assetsDir, file);
  const source = readFileSync(srcPath, "utf8");
  const result = await minify(source, {
    compress: {
      passes: 3,
      drop_console: true,
      pure_getters: true,
    },
    mangle: true,
    toplevel: true,
  });

  if (!result.code) {
    console.error(`[cart-upsell minify] Failed to minify ${file}`);
    failed = true;
    continue;
  }

  writeFileSync(outPath, result.code);
  const size = statSync(outPath).size;
  const status = size <= LIMIT ? "OK" : "FAIL";
  console.log(`[cart-upsell minify] ${file}: ${size} B (${status}, limit ${LIMIT})`);
  if (size > LIMIT) failed = true;
}

if (failed) {
  console.error(
    "[cart-upsell minify] One or more theme JS assets exceed Shopify's 10KB App Block limit.",
  );
  process.exit(1);
}

console.log("[cart-upsell minify] Theme assets ready for deploy.");
