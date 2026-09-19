// tsc only emits .ts output, so the .sql migrations have to be copied into
// dist/ by hand — otherwise `node dist/db/migrate.js` (the production
// migration command, which can't rely on the dev-only `tsx`) finds nothing.
import { cpSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
mkdirSync(join(root, "dist/db/migrations"), { recursive: true });
cpSync(join(root, "src/db/migrations"), join(root, "dist/db/migrations"), { recursive: true });
console.log("Copied SQL migrations to dist/db/migrations");
