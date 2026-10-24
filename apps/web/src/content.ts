// Loads all content JSON from the repo /content tree at build time (Vite glob)
// and builds the indexed Content object the engine consumes.
import { buildContent } from "@zero-day/engine";
import type { Content } from "@zero-day/engine";

const modules = import.meta.glob("../../../content/**/*.json", { eager: true, import: "default" });

const files: Record<string, unknown> = {};
for (const [key, value] of Object.entries(modules)) {
  const marker = "/content/";
  const idx = key.indexOf(marker);
  const rel = idx >= 0 ? key.slice(idx + marker.length) : key;
  if (rel.startsWith("schemas/")) continue;
  files[rel] = value;
}

export const content: Content = buildContent(files as Record<string, any>);
