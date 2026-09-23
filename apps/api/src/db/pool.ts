import pg from "pg";
import { env } from "../config/env.js";

export const pool = new pg.Pool({ connectionString: env.DATABASE_URL });

pool.on("error", (err) => {
  console.error(JSON.stringify({ level: "warn", message: "idle postgres client error", error: err.message }));
});
