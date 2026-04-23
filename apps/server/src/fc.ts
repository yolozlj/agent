import { handleRunAgentPayload } from "./routes/run-agent.js";

type HttpEvent = {
  body?: string;
  headers?: Record<string, string>;
  isBase64Encoded?: boolean;
  rawPath?: string;
  requestContext?: {
    http?: {
      method?: string;
      path?: string;
    };
  };
};

type RawEvent = HttpEvent | string | Buffer;

type HttpResponse = {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  isBase64Encoded: boolean;
};

const defaultHeaders = {
  "Content-Type": "application/json; charset=utf-8",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
};

function jsonResponse(statusCode: number, body: unknown): HttpResponse {
  return {
    statusCode,
    headers: defaultHeaders,
    body: JSON.stringify(body),
    isBase64Encoded: false
  };
}

function normalizeEvent(event: RawEvent): HttpEvent {
  if (typeof event === "string") {
    return JSON.parse(event) as HttpEvent;
  }

  if (Buffer.isBuffer(event)) {
    return JSON.parse(event.toString("utf8")) as HttpEvent;
  }

  return event;
}

function getMethod(event: HttpEvent): string {
  return event.requestContext?.http?.method ?? "GET";
}

function getPath(event: HttpEvent): string {
  return event.requestContext?.http?.path ?? event.rawPath ?? "/";
}

function parseBody(event: HttpEvent): unknown {
  const rawBody = event.body ?? "";

  if (!rawBody) {
    return {};
  }

  const bodyText = event.isBase64Encoded ? Buffer.from(rawBody, "base64").toString("utf8") : rawBody;

  return JSON.parse(bodyText);
}

export async function handler(rawEvent: RawEvent): Promise<HttpResponse> {
  let event: HttpEvent;

  try {
    event = normalizeEvent(rawEvent);
  } catch (error) {
    return jsonResponse(400, {
      error: error instanceof Error ? error.message : "Invalid event payload."
    });
  }

  const method = getMethod(event).toUpperCase();
  const path = getPath(event);

  if (method === "OPTIONS") {
    return {
      statusCode: 204,
      headers: defaultHeaders,
      body: "",
      isBase64Encoded: false
    };
  }

  if (method === "GET" && path === "/api/health") {
    return jsonResponse(200, { ok: true });
  }

  if (method === "POST" && path === "/api/run-agent") {
    try {
      const payload = parseBody(event);
      const result = await handleRunAgentPayload(payload);
      return jsonResponse(result.status, result.body);
    } catch (error) {
      return jsonResponse(400, {
        error: error instanceof Error ? error.message : "Invalid JSON request body."
      });
    }
  }

  return jsonResponse(404, {
    error: "Not found."
  });
}
