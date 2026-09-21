import pg from "pg";
import { env } from "../config/env.js";

export const pool = new pg.Pool({ connectionString: env.DATABASE_URL });

// Serverless Postgres (Neon) suspends idle compute and drops connections,
// and managed hosts recycle them too. When an *idle* pooled client errors,
// pg emits "error" on the pool — with no listener, Node treats that as an
// unhandled error event and the whole process exits. The pool discards the
// dead client itself; we only need to not crash.
pool.on("error", (err) => {
  console.error(JSON.stringify({ level: "warn", message: "idle postgres client error", error: err.message }));
});
