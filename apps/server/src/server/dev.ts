import { env } from "../lib/config.js";
import { createApp } from "./app.js";

const app = createApp();

app.listen(env.PORT, () => {
  console.log(`Agent Sandbox API listening on http://localhost:${env.PORT}`);
});

