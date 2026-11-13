import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/** Run at build time so replacing a public service image also changes its URL. */
export function versionServiceImage(source: string): string {
  if (!source.startsWith("/assets/services/")) return source;

  const url = new URL(source, "https://assets.local");
  const file = readFileSync(resolve("public", decodeURIComponent(url.pathname.slice(1))));
  const version = createHash("sha256").update(file).digest("hex").slice(0, 12);
  url.searchParams.set("v", version);
  return `${url.pathname}${url.search}${url.hash}`;
}
