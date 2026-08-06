/** Interactive API explorer — endpoint catalog + multi-language snippets. */

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
export type ApiAuthKind = "none" | "gt" | "gta" | "session";
export type ApiLang = "curl" | "javascript" | "python" | "php" | "ruby" | "java" | "go";

export const API_LANGS: { id: ApiLang; label: string }[] = [
  { id: "curl", label: "cURL" },
  { id: "javascript", label: "Node.js" },
  { id: "python", label: "Python" },
  { id: "php", label: "PHP" },
  { id: "ruby", label: "Ruby" },
  { id: "java", label: "Java" },
  { id: "go", label: "Go" },
];

export type ApiEndpointDemo = {
  id: string;
  group: string;
  title: string;
  description: string;
  method: HttpMethod;
  /** Path with placeholders like {serverId} */
  path: string;
  auth: ApiAuthKind;
  /** Suggested JSON body (POST/PATCH/PUT) */
  body?: unknown;
  /** Query string examples without leading ? */
  query?: string;
  /** Safe to run against live panel without mutation */
  safe: boolean;
  sampleResponse?: unknown;
};

export const API_ENDPOINT_DEMOS: ApiEndpointDemo[] = [
  {
    id: "health",
    group: "Public",
    title: "Health check",
    description: "Liveness probe — no authentication required.",
    method: "GET",
    path: "/api/health",
    auth: "none",
    safe: true,
    sampleResponse: { ok: true },
  },
  {
    id: "api-reference",
    group: "Public",
    title: "Permission catalog",
    description: "Machine-readable Client + Application permission presets.",
    method: "GET",
    path: "/api/account/api-reference",
    auth: "none",
    safe: true,
  },
  {
    id: "account",
    group: "Client API",
    title: "Account profile",
    description: "Current user quotas and active API key metadata.",
    method: "GET",
    path: "/api/account",
    auth: "gt",
    safe: true,
  },
  {
    id: "servers-list",
    group: "Client API",
    title: "List servers",
    description: "All servers visible to this key (JSON array).",
    method: "GET",
    path: "/api/servers",
    auth: "gt",
    safe: true,
  },
  {
    id: "server-get",
    group: "Client API",
    title: "Get server",
    description: "Single server details including status and permissions.",
    method: "GET",
    path: "/api/servers/{serverId}",
    auth: "gt",
    safe: true,
  },
  {
    id: "server-stats",
    group: "Client API",
    title: "Live stats",
    description: "CPU / RAM / network (and optional disk) for one server.",
    method: "GET",
    path: "/api/servers/{serverId}/stats",
    query: "disk=1",
    auth: "gt",
    safe: true,
  },
  {
    id: "server-start",
    group: "Client API",
    title: "Start server",
    description:
      "Start the Minecraft process. Needs permission control.start. Body: none.",
    method: "POST",
    path: "/api/servers/{serverId}/start",
    auth: "gt",
    safe: false,
    sampleResponse: {
      id: "V1StGXR8_Z5j",
      name: "Survival SMP",
      status: "STARTING",
    },
  },
  {
    id: "server-stop",
    group: "Client API",
    title: "Stop server",
    description:
      "Graceful stop (sends stop to the process). Needs permission control.stop.",
    method: "POST",
    path: "/api/servers/{serverId}/stop",
    auth: "gt",
    safe: false,
    sampleResponse: {
      id: "V1StGXR8_Z5j",
      status: "STOPPING",
    },
  },
  {
    id: "server-restart",
    group: "Client API",
    title: "Restart server",
    description:
      "Stop then start. Needs permission control.restart.",
    method: "POST",
    path: "/api/servers/{serverId}/restart",
    auth: "gt",
    safe: false,
    sampleResponse: {
      id: "V1StGXR8_Z5j",
      status: "STARTING",
    },
  },
  {
    id: "server-kill",
    group: "Client API",
    title: "Kill server",
    description:
      "Force-kill the container/process (no graceful save). Needs permission control.kill.",
    method: "POST",
    path: "/api/servers/{serverId}/kill",
    auth: "gt",
    safe: false,
    sampleResponse: {
      id: "V1StGXR8_Z5j",
      status: "STOPPED",
    },
  },
  {
    id: "server-power",
    group: "Client API",
    title: "Power (unified)",
    description:
      "Pterodactyl-style single endpoint. Body signal: start | stop | restart | kill.",
    method: "POST",
    path: "/api/servers/{serverId}/power",
    auth: "gt",
    body: { signal: "start" },
    safe: false,
  },
  {
    id: "server-command",
    group: "Client API",
    title: "Send console command",
    description:
      "One-shot console command over HTTP. Waits briefly and returns captured console lines in the response.",
    method: "POST",
    path: "/api/servers/{serverId}/command",
    auth: "gt",
    body: { command: "list" },
    safe: false,
    sampleResponse: {
      ok: true,
      command: "list",
      lines: [
        "There are 2 of a max of 20 players online: Steve, Alex",
      ],
      output: "There are 2 of a max of 20 players online: Steve, Alex",
      timedOut: false,
    },
  },
  {
    id: "server-websocket",
    group: "Client API",
    title: "WebSocket info",
    description: "Returns console / players WebSocket URLs for API clients.",
    method: "GET",
    path: "/api/servers/{serverId}/websocket",
    auth: "gt",
    safe: true,
  },
  {
    id: "server-files",
    group: "Client API",
    title: "List files",
    description: "Directory listing for the server file manager.",
    method: "GET",
    path: "/api/servers/{serverId}/files",
    query: "path=.",
    auth: "gt",
    safe: true,
  },
  {
    id: "server-files-content",
    group: "Client API",
    title: "Read file content",
    description: "Read a text file from the server data directory.",
    method: "GET",
    path: "/api/servers/{serverId}/files/content",
    query: "path=server.properties",
    auth: "gt",
    safe: true,
  },
  {
    id: "server-patch",
    group: "Client API",
    title: "Update server settings",
    description: "Patch name, server.properties, startup, or limits (permission-gated).",
    method: "PATCH",
    path: "/api/servers/{serverId}",
    auth: "gt",
    body: {
      name: "Survival",
      properties: { motd: "Welcome!", "max-players": "40" },
    },
    safe: false,
  },
  {
    id: "server-addons",
    group: "Client API",
    title: "List installed addons",
    description: "Installed mods/plugins with Modrinth metadata when available.",
    method: "GET",
    path: "/api/servers/{serverId}/addons",
    auth: "gt",
    safe: true,
  },
  {
    id: "server-addons-install",
    group: "Client API",
    title: "Install addon",
    description: "Install a Modrinth project onto the server (addon.update).",
    method: "POST",
    path: "/api/servers/{serverId}/addons/install",
    auth: "gt",
    body: { projectId: "fabric-api" },
    safe: false,
  },
  {
    id: "server-addons-delete",
    group: "Client API",
    title: "Remove addon",
    description: "Uninstall an addon by Modrinth project id.",
    method: "DELETE",
    path: "/api/servers/{serverId}/addons/{projectId}",
    auth: "gt",
    safe: false,
  },
  {
    id: "server-backups",
    group: "Client API",
    title: "List backups",
    description: "Backup inventory for a server.",
    method: "GET",
    path: "/api/servers/{serverId}/backups",
    auth: "gt",
    safe: true,
  },
  {
    id: "server-backups-create",
    group: "Client API",
    title: "Create backup",
    description: "Start a new backup (backup.create).",
    method: "POST",
    path: "/api/servers/{serverId}/backups",
    auth: "gt",
    body: { note: "Pre-update snapshot" },
    safe: false,
  },
  {
    id: "server-allocations",
    group: "Client API",
    title: "List allocations",
    description: "Network ports assigned to this server.",
    method: "GET",
    path: "/api/servers/{serverId}/allocations",
    auth: "gt",
    safe: true,
  },
  {
    id: "server-connect",
    group: "Client API",
    title: "Connect info (game + SFTP)",
    description:
      "Join address, MOTD, and SFTP host/port/username when file.sftp is allowed. Password is an app password (gtap_), not returned here.",
    method: "GET",
    path: "/api/servers/{serverId}/connect",
    auth: "gt",
    safe: true,
    sampleResponse: {
      host: "play.example.com",
      port: 25565,
      address: "play.example.com",
      sftpEnabled: true,
      sftpHost: "node1.example.com",
      sftpPort: 2022,
      sftpUsername: "steve.V1StGXR8_Z5j",
    },
  },
  {
    id: "server-databases",
    group: "Client API",
    title: "List databases",
    description: "MySQL databases for this server (includes password).",
    method: "GET",
    path: "/api/servers/{serverId}/databases",
    auth: "gt",
    safe: true,
  },
  {
    id: "server-db-rotate",
    group: "Client API",
    title: "Rotate database password",
    description: "Generate a new MySQL password (database.update).",
    method: "POST",
    path: "/api/servers/{serverId}/databases/{dbId}/rotate-password",
    auth: "gt",
    safe: false,
  },
  {
    id: "account-app-passwords",
    group: "Client API",
    title: "List SFTP app passwords",
    description: "List gtap_ credentials for FileZilla / SFTP (not HTTP).",
    method: "GET",
    path: "/api/account/app-passwords",
    auth: "gt",
    safe: true,
  },
  {
    id: "account-app-password-create",
    group: "Client API",
    title: "Create SFTP app password",
    description:
      "Mint a one-time gtap_ token. Via API key, body must include your panel password.",
    method: "POST",
    path: "/api/account/app-passwords",
    auth: "gt",
    body: { name: "FileZilla", password: "YOUR_PANEL_PASSWORD" },
    safe: false,
    sampleResponse: {
      password: { id: "ap_…", name: "FileZilla", prefix: "gtap_…" },
      token: "gtap_…",
    },
  },
  {
    id: "app-users",
    group: "Application API",
    title: "List users",
    description: "Machine key: list all panel users (billing / provisioning).",
    method: "GET",
    path: "/api/application/users",
    auth: "gta",
    safe: true,
  },
  {
    id: "app-servers",
    group: "Application API",
    title: "List servers (all)",
    description: "Machine key: list every server on the panel.",
    method: "GET",
    path: "/api/application/servers",
    auth: "gta",
    safe: true,
  },
  {
    id: "app-create-server",
    group: "Application API",
    title: "Create server",
    description: "Provision a server for an owner after payment.",
    method: "POST",
    path: "/api/application/servers",
    auth: "gta",
    body: {
      ownerId: "USER_ID",
      name: "Survival",
      type: "PAPER",
      mcVersion: "1.21.1",
      port: 25565,
      memoryMb: 4096,
      diskMb: 10240,
    },
    safe: false,
  },
  {
    id: "app-power",
    group: "Application API",
    title: "Power (admin)",
    description: "Start/stop any server with servers.power scope.",
    method: "POST",
    path: "/api/application/servers/{serverId}/power",
    auth: "gta",
    body: { signal: "stop" },
    safe: false,
  },
  {
    id: "app-suspend",
    group: "Application API",
    title: "Suspend server",
    description: "Billing suspend — stops the server and blocks start until cleared.",
    method: "PATCH",
    path: "/api/application/servers/{serverId}",
    auth: "gta",
    body: { suspended: true },
    safe: false,
  },
  {
    id: "app-connect",
    group: "Application API",
    title: "Connect info (admin)",
    description: "Join address + SFTP meta for any server (servers.read).",
    method: "GET",
    path: "/api/application/servers/{serverId}/connect",
    auth: "gta",
    safe: true,
  },
  {
    id: "app-files",
    group: "Application API",
    title: "List files (admin)",
    description: "File listing via servers.files scope.",
    method: "GET",
    path: "/api/application/servers/{serverId}/files",
    query: "path=.",
    auth: "gta",
    safe: true,
  },
  {
    id: "app-addons",
    group: "Application API",
    title: "List addons (admin)",
    description: "Installed mods/plugins via servers.addons.",
    method: "GET",
    path: "/api/application/servers/{serverId}/addons",
    auth: "gta",
    safe: true,
  },
  {
    id: "app-backups",
    group: "Application API",
    title: "List backups (admin)",
    description: "Backup inventory via servers.backups.",
    method: "GET",
    path: "/api/application/servers/{serverId}/backups",
    auth: "gta",
    safe: true,
  },
  {
    id: "app-allocations",
    group: "Application API",
    title: "List allocations (admin)",
    description: "Network ports via servers.allocations.",
    method: "GET",
    path: "/api/application/servers/{serverId}/allocations",
    auth: "gta",
    safe: true,
  },
  {
    id: "app-databases",
    group: "Application API",
    title: "List databases (admin)",
    description: "MySQL databases via servers.databases.",
    method: "GET",
    path: "/api/application/servers/{serverId}/databases",
    auth: "gta",
    safe: true,
  },
];

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
  return path
    .replaceAll("{serverId}", serverId || "SERVER_ID")
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
  const token =
    ctx.token ||
    (ctx.auth === "gta" ? "gta_…" : "gt_…");
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
        opts.join(",\n") + ",",
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
        lines.push(
          `b.header("Authorization", "${auth.replace(/^Authorization:\s*/i, "")}");`,
        );
      }
      if (hasBody) lines.push(`b.header("Content-Type", "application/json");`);
      lines.push(`HttpResponse<String> res = client.send(b.build(), HttpResponse.BodyHandlers.ofString());`);
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

export function demoGroups(): string[] {
  return [...new Set(API_ENDPOINT_DEMOS.map((d) => d.group))];
}
