#!/usr/bin/env node
/**
 * Upsert docs/openapi.yaml components.schemas from apps/api/src/schemas/servers.ts
 * (mechanical Zod → OpenAPI for the shared server contracts).
 *
 * Usage: node scripts/sync-openapi-server-schemas.mjs [--check]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const schemaPath = path.join(root, "apps/api/src/schemas/servers.ts");
const openapiPath = path.join(root, "docs/openapi.yaml");
const checkOnly = process.argv.includes("--check");

const SERVER_TYPES = [
  "VANILLA",
  "PAPER",
  "FABRIC",
  "FORGE",
  "PURPUR",
  "NEOFORGE",
  "QUILT",
  "BEDROCK",
  "BEDROCK_PREVIEW",
  "POCKETMINE",
  "NUKKIT",
];

/** Schemas derived from schemas/servers.ts — keep names stable for $ref. */
function buildSchemas() {
  const filePath = {
    type: "string",
    minLength: 1,
    maxLength: 512,
  };
  const serverType = {
    type: "string",
    enum: [...SERVER_TYPES],
  };
  const extraMount = {
    type: "object",
    required: ["host", "container"],
    properties: {
      host: { type: "string", minLength: 1, maxLength: 512 },
      container: { type: "string", minLength: 1, maxLength: 512 },
      readOnly: { type: "boolean" },
    },
  };

  return {
    PowerSignal: {
      type: "string",
      enum: ["start", "stop", "restart", "kill"],
    },
    ServerType: serverType,
    FilePath: filePath,
    FileWrite: {
      type: "object",
      required: ["path", "content"],
      properties: {
        path: { $ref: "#/components/schemas/FilePath" },
        content: { type: "string", maxLength: 2_000_000 },
      },
    },
    FileMkdir: {
      type: "object",
      required: ["path"],
      properties: {
        path: { $ref: "#/components/schemas/FilePath" },
      },
    },
    FileRename: {
      type: "object",
      required: ["from", "to"],
      properties: {
        from: { $ref: "#/components/schemas/FilePath" },
        to: { $ref: "#/components/schemas/FilePath" },
      },
    },
    FileDelete: {
      type: "object",
      required: ["path"],
      properties: {
        path: { $ref: "#/components/schemas/FilePath" },
      },
    },
    FileCompress: {
      type: "object",
      required: ["paths", "destination"],
      properties: {
        paths: {
          type: "array",
          minItems: 1,
          maxItems: 100,
          items: { $ref: "#/components/schemas/FilePath" },
        },
        destination: { $ref: "#/components/schemas/FilePath" },
      },
    },
    FileDownloadZip: {
      type: "object",
      required: ["paths"],
      properties: {
        paths: {
          type: "array",
          minItems: 1,
          maxItems: 100,
          items: { $ref: "#/components/schemas/FilePath" },
        },
      },
    },
    FileDecompress: {
      type: "object",
      required: ["path"],
      properties: {
        path: { $ref: "#/components/schemas/FilePath" },
        destination: { $ref: "#/components/schemas/FilePath" },
      },
    },
    CreateServerBase: {
      type: "object",
      required: ["name", "type", "mcVersion", "port", "memoryMb"],
      properties: {
        name: { type: "string", minLength: 1, maxLength: 64 },
        type: { $ref: "#/components/schemas/ServerType" },
        mcVersion: { type: "string", minLength: 1 },
        port: { type: "integer", minimum: 1024, maximum: 65535 },
        memoryMb: { type: "integer", minimum: 512, maximum: 65536 },
        nodeId: { type: "string", minLength: 1 },
      },
    },
    CreateServerClient: {
      allOf: [
        { $ref: "#/components/schemas/CreateServerBase" },
        {
          type: "object",
          properties: {
            diskMb: { type: "integer", minimum: 256, maximum: 10_485_760 },
            cpuLimit: { type: "integer", minimum: 0, maximum: 10_000 },
            seed: { type: "string", maxLength: 128 },
            gamemode: {
              type: "string",
              enum: ["survival", "creative", "adventure", "spectator"],
            },
            difficulty: {
              type: "string",
              enum: ["peaceful", "easy", "normal", "hard"],
            },
            worldPreset: {
              type: "string",
              enum: ["DEFAULT", "FLAT", "VOID"],
            },
            keepCount: { type: "integer", minimum: 1, maximum: 50 },
            extraMounts: {
              type: "array",
              maxItems: 8,
              nullable: true,
              items: extraMount,
            },
          },
        },
      ],
    },
    CreateServerApplication: {
      allOf: [
        { $ref: "#/components/schemas/CreateServerBase" },
        {
          type: "object",
          required: ["ownerId"],
          properties: {
            ownerId: { type: "string", minLength: 1 },
            mcVersion: { type: "string", minLength: 1, maxLength: 32 },
            diskMb: { type: "integer", minimum: 1024, maximum: 10_485_760 },
            cpuLimit: { type: "integer", minimum: 0, maximum: 6400 },
          },
        },
      ],
    },
    CloneServer: {
      type: "object",
      required: ["name", "port"],
      properties: {
        name: { type: "string", minLength: 1, maxLength: 64 },
        port: { type: "integer", minimum: 1024, maximum: 65535 },
        memoryMb: { type: "integer", minimum: 512, maximum: 65536 },
        diskMb: { type: "integer", minimum: 256, maximum: 10_485_760 },
        cpuLimit: { type: "integer", minimum: 0, maximum: 10_000 },
        nodeId: { type: "string", minLength: 1 },
      },
    },
    PowerRequest: {
      type: "object",
      required: ["signal"],
      properties: {
        signal: { $ref: "#/components/schemas/PowerSignal" },
      },
    },
  };
}

const EXPECTED_NAMES = Object.keys(buildSchemas());

function yamlScalar(v) {
  if (typeof v === "boolean" || typeof v === "number") return String(v);
  if (v == null) return "null";
  const s = String(v);
  if (/[:#{}[\],&*?|>!%@`]/.test(s) || s.includes("\n") || s === "") {
    return JSON.stringify(s);
  }
  return s;
}

function dumpYaml(value, indent = 0) {
  const pad = "  ".repeat(indent);
  if (Array.isArray(value)) {
    if (value.length === 0) return `${pad}[]\n`;
    let out = "";
    for (const item of value) {
      if (item !== null && typeof item === "object") {
        const nested = dumpYaml(item, indent + 1);
        const lines = nested.replace(/\n$/, "").split("\n");
        out += `${pad}- ${lines[0].trimStart()}\n`;
        for (let i = 1; i < lines.length; i++) out += `${lines[i]}\n`;
      } else {
        out += `${pad}- ${yamlScalar(item)}\n`;
      }
    }
    return out;
  }
  if (value !== null && typeof value === "object") {
    let out = "";
    for (const [k, v] of Object.entries(value)) {
      if (v !== null && typeof v === "object") {
        out += `${pad}${k}:\n${dumpYaml(v, indent + 1)}`;
      } else {
        out += `${pad}${k}: ${yamlScalar(v)}\n`;
      }
    }
    return out;
  }
  return `${pad}${yamlScalar(value)}\n`;
}

function upsertSchemas(yaml, schemas) {
  const marker = "  schemas:\n";
  const idx = yaml.indexOf(marker);
  if (idx < 0) throw new Error("components.schemas not found in openapi.yaml");

  const after = yaml.slice(idx + marker.length);
  // Find next top-level key under components (parameters already before) or paths:
  // schemas section ends at the first line that matches `^[a-z]` at indent 0 or `paths:`
  const endMatch = after.match(/\n(?=paths:)/);
  const schemasBody = endMatch ? after.slice(0, endMatch.index) : after;
  const rest = endMatch ? after.slice(endMatch.index) : "";

  // Parse existing schema names (indent 4)
  const existing = new Map();
  let current = null;
  let buf = [];
  for (const line of schemasBody.split("\n")) {
    const m = line.match(/^    ([A-Za-z][A-Za-z0-9_]*):\s*$/);
    if (m) {
      if (current) existing.set(current, buf.join("\n"));
      current = m[1];
      buf = [line];
    } else if (current) {
      buf.push(line);
    }
  }
  if (current) existing.set(current, buf.join("\n").replace(/\n+$/, ""));

  for (const [name, schema] of Object.entries(schemas)) {
    const body = dumpYaml(schema, 3).replace(/\n+$/, "");
    existing.set(name, `    ${name}:\n${body}`);
  }

  // Stable order: Error first if present, then alphabetical with synced names grouped
  const names = [...existing.keys()].sort((a, b) => {
    if (a === "Error") return -1;
    if (b === "Error") return 1;
    return a.localeCompare(b);
  });

  const rebuilt = names.map((n) => existing.get(n)).join("\n") + "\n";
  return yaml.slice(0, idx + marker.length) + rebuilt + rest.replace(/^\n/, "\n");
}

function verifySourceMatches() {
  const src = fs.readFileSync(schemaPath, "utf8");
  for (const t of SERVER_TYPES) {
    if (!src.includes(`"${t}"`)) {
      throw new Error(`schemas/servers.ts missing SERVER_TYPES entry ${t}`);
    }
  }
  for (const name of [
    "powerSignalSchema",
    "fileWriteSchema",
    "createServerClientSchema",
    "createServerApplicationSchema",
    "cloneServerSchema",
  ]) {
    if (!src.includes(`export const ${name}`)) {
      throw new Error(`schemas/servers.ts missing ${name}`);
    }
  }
}

verifySourceMatches();
const schemas = buildSchemas();
const before = fs.readFileSync(openapiPath, "utf8");
const after = upsertSchemas(before, schemas);

if (checkOnly) {
  if (before !== after) {
    console.error("OpenAPI server schemas are out of sync. Run: node scripts/sync-openapi-server-schemas.mjs");
    process.exit(1);
  }
  for (const name of EXPECTED_NAMES) {
    if (!before.includes(`\n    ${name}:\n`) && !before.includes(`\n    ${name}:`)) {
      console.error(`Missing components.schemas.${name}`);
      process.exit(1);
    }
  }
  console.log(`sync-openapi-server-schemas: ok (${EXPECTED_NAMES.length} schemas)`);
  process.exit(0);
}

fs.writeFileSync(openapiPath, after);
console.log(`sync-openapi-server-schemas: wrote ${EXPECTED_NAMES.length} schemas`);
