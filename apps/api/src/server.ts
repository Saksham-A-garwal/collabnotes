import { createServer } from "node:http";
import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { attachRealtime } from "./realtime/index.js";

const app = createApp();
const server = createServer(app);

attachRealtime(server);

server.listen(env.PORT, () => {
  console.log(JSON.stringify({ level: "info", message: `API listening on :${env.PORT}` }));
});
