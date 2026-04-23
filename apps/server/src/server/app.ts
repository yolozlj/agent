import path from "node:path";

import cors from "cors";
import express from "express";

import { runAgentRoute } from "../routes/run-agent.js";

export function createApp() {
  const app = express();
  const webDir = path.resolve(__dirname, "../../../web");

  app.use(cors());
  app.use(express.json({ limit: "1mb" }));

  app.get("/api/health", (_request, response) => {
    response.json({ ok: true });
  });

  app.post("/api/run-agent", (request, response) => {
    void runAgentRoute(request, response);
  });

  app.use(express.static(webDir));

  app.get("*", (_request, response) => {
    response.sendFile(path.join(webDir, "index.html"));
  });

  return app;
}
