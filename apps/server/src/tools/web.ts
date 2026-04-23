import dns from "node:dns/promises";
import net from "node:net";

import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";

import { env } from "../lib/config.js";
import type { ToolContext } from "../lib/types.js";

const PRIVATE_IPV4_RANGES = [
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^192\.168\./
];

function isPrivateIp(address: string): boolean {
  if (net.isIP(address) === 4) {
    return PRIVATE_IPV4_RANGES.some((pattern) => pattern.test(address));
  }

  const lowered = address.toLowerCase();
  return (
    lowered === "::1" ||
    lowered.startsWith("fc") ||
    lowered.startsWith("fd") ||
    lowered.startsWith("fe80")
  );
}

async function assertPublicUrl(rawUrl: string): Promise<URL> {
  const url = new URL(rawUrl);
  const allowedProtocols = env.ALLOWED_WEB_PROTOCOLS.split(",").map((item) => item.trim());

  if (!allowedProtocols.includes(url.protocol.replace(":", ""))) {
    throw new Error("Only http/https URLs are allowed.");
  }

  const hostname = url.hostname.toLowerCase();
  if (hostname === "localhost") {
    throw new Error("Localhost is not allowed.");
  }

  if (net.isIP(hostname) && isPrivateIp(hostname)) {
    throw new Error("Private IP addresses are not allowed.");
  }

  const lookupResult = await dns.lookup(hostname, { all: true });
  if (lookupResult.some((entry) => isPrivateIp(entry.address))) {
    throw new Error("Resolved private network address is not allowed.");
  }

  return url;
}

function normalizeText(input: string): string {
  return input.replace(/\s+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function parseClientRedirect(html: string, baseUrl: URL): URL | null {
  const metaRefreshMatch = html.match(
    /<meta[^>]+http-equiv=["']refresh["'][^>]+content=["'][^"']*url=([^"'>]+)["']/i
  );
  if (metaRefreshMatch?.[1]) {
    return new URL(metaRefreshMatch[1].trim(), baseUrl);
  }

  const locationReplaceMatch = html.match(
    /location\.(?:replace|href)\((?:location\.href\.replace\([^,]+,\s*["']([^"']+)["']\)|["']([^"']+)["'])\)/i
  );
  if (locationReplaceMatch?.[1]) {
    const nextUrl = baseUrl.toString().replace(/^https:\/\//i, `${locationReplaceMatch[1]}`);
    return new URL(nextUrl);
  }

  if (locationReplaceMatch?.[2]) {
    return new URL(locationReplaceMatch[2], baseUrl);
  }

  return null;
}

function extractFallbackContent(dom: JSDOM): string {
  const document = dom.window.document;

  document
    .querySelectorAll("script, style, noscript, iframe, svg, canvas, form")
    .forEach((node) => node.remove());

  const prioritizedSelectors = [
    "main",
    "article",
    "[role='main']",
    ".result, .results, .search-result, .search-results",
    "#content_left, #content, #main"
  ];

  for (const selector of prioritizedSelectors) {
    const node = document.querySelector(selector);
    const text = normalizeText(node?.textContent ?? "");
    if (text.length >= 80) {
      return text;
    }
  }

  return normalizeText(document.body.textContent ?? "");
}

function looksLikeBotCheck(title: string, content: string): boolean {
  const combined = `${title}\n${content}`.toLowerCase();
  const patterns = [
    "安全验证",
    "captcha",
    "verify",
    "robot",
    "访问受限",
    "访问异常",
    "人机验证"
  ];

  return patterns.some((pattern) => combined.includes(pattern.toLowerCase()));
}

async function fetchHtmlWithRedirectHandling(
  initialUrl: URL,
  context: ToolContext
): Promise<{ url: URL; contentType: string; html: string }> {
  let currentUrl = initialUrl;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(currentUrl, {
      redirect: "follow",
      signal: AbortSignal.timeout(context.timeoutMs)
    });

    if (!response.ok) {
      throw new Error(`Page fetch failed with ${response.status}.`);
    }

    const contentType = response.headers.get("content-type") ?? "";
    const html = await response.text();

    const redirectUrl = parseClientRedirect(html, currentUrl);
    if (redirectUrl && redirectUrl.toString() !== currentUrl.toString()) {
      currentUrl = await assertPublicUrl(redirectUrl.toString());
      continue;
    }

    return {
      url: currentUrl,
      contentType,
      html
    };
  }

  throw new Error("Page redirected too many times before content could be read.");
}

export async function readWebPage(
  input: Record<string, unknown>,
  context: ToolContext
): Promise<Record<string, unknown>> {
  const rawUrl = String(input.url ?? "").trim();
  if (!rawUrl) {
    throw new Error("Web reader requires a URL.");
  }

  const initialUrl = await assertPublicUrl(rawUrl);
  const { url, contentType, html } = await fetchHtmlWithRedirectHandling(initialUrl, context);

  if (contentType.includes("text/plain")) {
    return {
      url: url.toString(),
      title: url.hostname,
      content: normalizeText(html).slice(0, 12000)
    };
  }

  const dom = new JSDOM(html, { url: url.toString() });
  const reader = new Readability(dom.window.document);
  const article = reader.parse();
  const content = normalizeText(article?.textContent ?? extractFallbackContent(dom));

  if (looksLikeBotCheck(article?.title ?? dom.window.document.title ?? "", content)) {
    throw new Error("Target page returned a security verification or anti-bot page, so readable content is unavailable.");
  }

  if (!content) {
    throw new Error("Could not extract readable content from the page.");
  }

  return {
    url: url.toString(),
    title: article?.title ?? dom.window.document.title ?? url.hostname,
    excerpt: content.slice(0, 280),
    content: content.slice(0, 12000)
  };
}
