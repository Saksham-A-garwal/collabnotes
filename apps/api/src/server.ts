import { createServer } from "node:http";
import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { attachRealtime } from "./realtime/index.js";
import { backfillSearchIndex } from "./realtime/searchIndex.js";

const app = createApp();
const server = createServer(app);

attachRealtime(server);

server.listen(env.PORT, () => {
  console.log(JSON.stringify({ level: "info", message: `API listening on :${env.PORT}` }));

  // Index documents that predate search (or were edited moments before a restart).
  // In the background: serving requests never waits on it.
  backfillSearchIndex()
    .then((count) => {
      if (count > 0) console.log(JSON.stringify({ level: "info", message: "search backfill complete", documents: count }));
    })
    .catch((err: unknown) => {
      console.error(JSON.stringify({ level: "error", message: "search backfill failed", error: (err as Error).message }));
    });
});
