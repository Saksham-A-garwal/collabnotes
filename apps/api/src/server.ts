import { createServer } from "node:http";
import { createApp } from "./app.js";
import { env } from "./config/env.js";

const app = createApp();
const server = createServer(app);

// WebSocket upgrade handling (sync + awareness) is wired here in Phase 2:
// attachWsServer(server);

server.listen(env.PORT, () => {
  console.log(JSON.stringify({ level: "info", message: `API listening on :${env.PORT}` }));
});
