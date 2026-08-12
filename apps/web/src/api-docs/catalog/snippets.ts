/** Interactive API explorer — multi-language request snippets. */

import type { ApiAuthKind, ApiLang, HttpMethod } from "./types";

export type SnippetContext = {
  panel: string;
  token: string;
  serverId: string;
  method: HttpMethod;
  path: string;
  query?: string;
  body?: unknown;
  auth: ApiAuthKind;
};

function resolvePath(path: string, serverId: string): string {
  const id = serverId || "SERVER_ID";
  return path
    .replaceAll("{serverId}", id)
    .replaceAll("{nodeId}", serverId || "NODE_ID")
    .replaceAll("{storageId}", serverId || "STORAGE_ID")
    .replaceAll("{projectId}", "PROJECT_ID")
    .replaceAll("{dbId}", "DATABASE_ID")
    .replaceAll("{backupId}", "BACKUP_ID");
}

function fullUrl(ctx: SnippetContext): string {
  const base = ctx.panel.replace(/\/$/, "");
  const path = resolvePath(ctx.path, ctx.serverId);
  const q = ctx.query ? `?${ctx.query}` : "";
  return `${base}${path}${q}`;
}

function authHeader(ctx: SnippetContext): string | null {
  if (ctx.auth === "none" || ctx.auth === "session") return null;
  const token = ctx.token || (ctx.auth === "gta" ? "gta_…" : "gt_…");
  return `Authorization: Bearer ${token}`;
}

function bodyJson(body: unknown | undefined): string | null {
  if (body === undefined) return null;
  return JSON.stringify(body, null, 2);
}

export function generateSnippet(lang: ApiLang, ctx: SnippetContext): string {
  const url = fullUrl(ctx);
  const auth = authHeader(ctx);
  const body = bodyJson(ctx.body);
  const hasBody = body !== null && ctx.method !== "GET" && ctx.method !== "DELETE";

  switch (lang) {
    case "curl": {
      const lines = [`curl -sS -X ${ctx.method} '${url}'`];
      if (auth) lines.push(`  -H '${auth}'`);
      if (hasBody) {
        lines.push(`  -H 'Content-Type: application/json'`);
        lines.push(`  -d '${JSON.stringify(ctx.body)}'`);
      }
      return lines.join(" \\\n");
    }
    case "javascript": {
      const headers: Record<string, string> = {};
      if (auth) headers.Authorization = auth.replace(/^Authorization:\s*/i, "");
      if (hasBody) headers["Content-Type"] = "application/json";
      const opts = [
        `  method: '${ctx.method}'`,
        `  headers: ${JSON.stringify(headers, null, 2).replace(/\n/g, "\n  ")}`,
      ];
      if (hasBody) opts.push(`  body: JSON.stringify(${body})`);
      return [
        `const res = await fetch('${url}', {`,
        `${opts.join(",\n")},`,
        `});`,
        `const data = await res.json();`,
        `console.log(res.status, data);`,
      ].join("\n");
    }
    case "python": {
      const headers: string[] = [];
      if (auth) headers.push(`    "Authorization": "${auth.replace(/^Authorization:\s*/i, "")}",`);
      if (hasBody) headers.push(`    "Content-Type": "application/json",`);
      const lines = [
        `import requests`,
        ``,
        `res = requests.request(`,
        `    "${ctx.method}",`,
        `    "${url}",`,
      ];
      if (headers.length) {
        lines.push(`    headers={`);
        lines.push(...headers);
        lines.push(`    },`);
      }
      if (hasBody) lines.push(`    json=${body.replace(/\n/g, "\n    ")},`);
      lines.push(`)`);
      lines.push(`print(res.status_code, res.json())`);
      return lines.join("\n");
    }
    case "php": {
      const lines = [
        `<?php`,
        `$ch = curl_init('${url}');`,
        `curl_setopt_array($ch, [`,
        `  CURLOPT_RETURNTRANSFER => true,`,
        `  CURLOPT_CUSTOMREQUEST => '${ctx.method}',`,
      ];
      const hdrs: string[] = [];
      if (auth) hdrs.push(auth);
      if (hasBody) hdrs.push("Content-Type: application/json");
      if (hdrs.length) {
        lines.push(`  CURLOPT_HTTPHEADER => [`);
        for (const h of hdrs) lines.push(`    '${h}',`);
        lines.push(`  ],`);
      }
      if (hasBody) {
        lines.push(`  CURLOPT_POSTFIELDS => json_encode(${phpArray(ctx.body)}),`);
      }
      lines.push(`]);`);
      lines.push(`$response = curl_exec($ch);`);
      lines.push(`$status = curl_getinfo($ch, CURLINFO_HTTP_CODE);`);
      lines.push(`curl_close($ch);`);
      lines.push(`echo $status, "\\n", $response;`);
      return lines.join("\n");
    }
    case "ruby": {
      const lines = [
        `require "net/http"`,
        `require "json"`,
        `require "uri"`,
        ``,
        `uri = URI("${url}")`,
        `http = Net::HTTP.new(uri.host, uri.port)`,
        `http.use_ssl = uri.scheme == "https"`,
        ``,
        `req = Net::HTTP::${rubyClass(ctx.method)}.new(uri)`,
      ];
      if (auth) lines.push(`req["Authorization"] = "${auth.replace(/^Authorization:\s*/i, "")}"`);
      if (hasBody) {
        lines.push(`req["Content-Type"] = "application/json"`);
        lines.push(`req.body = ${JSON.stringify(JSON.stringify(ctx.body))}`);
      }
      lines.push(`res = http.request(req)`);
      lines.push(`puts res.code, res.body`);
      return lines.join("\n");
    }
    case "java": {
      const lines = [
        `// Java 11+ HttpClient`,
        `HttpClient client = HttpClient.newHttpClient();`,
        `HttpRequest.Builder b = HttpRequest.newBuilder()`,
        `    .uri(URI.create("${url}"))`,
        `    .method("${ctx.method}", ${
          hasBody
            ? `HttpRequest.BodyPublishers.ofString(${JSON.stringify(JSON.stringify(ctx.body))})`
            : "HttpRequest.BodyPublishers.noBody()"
        });`,
      ];
      if (auth) {
        lines.push(`b.header("Authorization", "${auth.replace(/^Authorization:\s*/i, "")}");`);
      }
      if (hasBody) lines.push(`b.header("Content-Type", "application/json");`);
      lines.push(
        `HttpResponse<String> res = client.send(b.build(), HttpResponse.BodyHandlers.ofString());`,
      );
      lines.push(`System.out.println(res.statusCode());`);
      lines.push(`System.out.println(res.body());`);
      return lines.join("\n");
    }
    case "go": {
      const lines = [
        `package main`,
        ``,
        `import (`,
        `  "bytes"`,
        `  "fmt"`,
        `  "io"`,
        `  "net/http"`,
        `)`,
        ``,
        `func main() {`,
      ];
      if (hasBody) {
        lines.push(`  body := []byte(${JSON.stringify(JSON.stringify(ctx.body))})`);
        lines.push(`  req, _ := http.NewRequest("${ctx.method}", "${url}", bytes.NewReader(body))`);
        lines.push(`  req.Header.Set("Content-Type", "application/json")`);
      } else {
        lines.push(`  req, _ := http.NewRequest("${ctx.method}", "${url}", nil)`);
      }
      if (auth) {
        lines.push(
          `  req.Header.Set("Authorization", "${auth.replace(/^Authorization:\s*/i, "")}")`,
        );
      }
      lines.push(`  res, err := http.DefaultClient.Do(req)`);
      lines.push(`  if err != nil { panic(err) }`);
      lines.push(`  defer res.Body.Close()`);
      lines.push(`  b, _ := io.ReadAll(res.Body)`);
      lines.push(`  fmt.Println(res.StatusCode, string(b))`);
      lines.push(`}`);
      return lines.join("\n");
    }
  }
}

function rubyClass(method: HttpMethod): string {
  switch (method) {
    case "GET":
      return "Get";
    case "POST":
      return "Post";
    case "PUT":
      return "Put";
    case "PATCH":
      return "Patch";
    case "DELETE":
      return "Delete";
  }
}

/** Rough PHP array literal from JSON-ish value. */
function phpArray(value: unknown, indent = 0): string {
  const pad = "  ".repeat(indent);
  const pad1 = "  ".repeat(indent + 1);
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    return `[\n${value.map((v) => `${pad1}${phpArray(v, indent + 1)},`).join("\n")}\n${pad}]`;
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return "[]";
    return `[\n${entries
      .map(([k, v]) => `${pad1}${JSON.stringify(k)} => ${phpArray(v, indent + 1)},`)
      .join("\n")}\n${pad}]`;
  }
  return "null";
}
