#!/usr/bin/env node
/**
 * Upsert docs/openapi.yaml components.schemas from packages/shared/src/schemas/*
 * (mechanical Zod → OpenAPI for shared contracts).
 *
 * Usage: node scripts/sync-openapi-server-schemas.mjs [--check]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sharedSchemasDir = path.join(root, "packages/shared/src/schemas");
const schemaPath = path.join(sharedSchemasDir, "servers.ts");
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

/** Account, auth, nodes, billing, allocations, backups — from shared/schemas/*. */
function buildContractSchemas() {
  const serverType = { $ref: "#/components/schemas/ServerType" };
  const iso2 = { type: "string", minLength: 2, maxLength: 2 };
  const nullableString = { type: "string", nullable: true };
  const optionalNullableString = { type: "string", nullable: true };

  return {
    Username: {
      type: "string",
      minLength: 3,
      maxLength: 32,
      pattern: "^[a-zA-Z0-9_-]+$",
    },
    UserRole: {
      type: "string",
      enum: ["ADMIN", "OPERATOR", "VIEWER"],
    },
    QuotaLimit: {
      type: "integer",
      minimum: 0,
      maximum: 10_000,
      nullable: true,
    },
    ProfilePatch: {
      type: "object",
      properties: {
        email: { type: "string", format: "email", maxLength: 254, nullable: true },
        displayName: { type: "string", maxLength: 120, nullable: true },
        phoneCountry: iso2,
        phoneNational: { type: "string", maxLength: 32, nullable: true },
        addressLine1: { type: "string", maxLength: 191, nullable: true },
        addressLine2: { type: "string", maxLength: 191, nullable: true },
        addressCity: { type: "string", maxLength: 120, nullable: true },
        addressPostalCode: { type: "string", maxLength: 32, nullable: true },
        addressCountry: iso2,
        addressLat: { type: "number", minimum: -90, maximum: 90, nullable: true },
        addressLon: { type: "number", minimum: -180, maximum: 180, nullable: true },
        clearAddressVerification: { type: "boolean" },
      },
    },
    CreateSubUser: {
      type: "object",
      required: ["email", "permissions"],
      properties: {
        email: { type: "string", format: "email", maxLength: 255 },
        permissions: { type: "array", items: { type: "string" } },
      },
    },
    UpdateSubUser: {
      type: "object",
      required: ["permissions"],
      properties: {
        permissions: { type: "array", items: { type: "string" } },
      },
    },
    PlanBody: {
      type: "object",
      required: ["slug", "name", "priceCents", "maxServers", "maxMemoryMb", "maxDatabases"],
      properties: {
        slug: {
          type: "string",
          minLength: 2,
          maxLength: 64,
          pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$",
        },
        name: { type: "string", minLength: 1, maxLength: 80 },
        description: { type: "string", maxLength: 2000, nullable: true },
        priceCents: { type: "integer", minimum: 0, maximum: 10_000_000 },
        currency: { type: "string", minLength: 3, maxLength: 3, default: "EUR" },
        maxServers: { type: "integer", minimum: 0, maximum: 10_000 },
        maxMemoryMb: { type: "integer", minimum: 0, maximum: 10_485_760 },
        maxDatabases: { type: "integer", minimum: 0, maximum: 10_000 },
        defaultMemoryMb: { type: "integer", minimum: 512, maximum: 65536 },
        defaultDiskMb: { type: "integer", minimum: 1024, maximum: 10_485_760 },
        autoCreateServer: { type: "boolean" },
        defaultServerType: serverType,
        defaultMcVersion: { type: "string", minLength: 1, maxLength: 32 },
        recurringInterval: { type: "string", nullable: true },
        enabled: { type: "boolean" },
        sortOrder: { type: "integer", minimum: 0, maximum: 10_000 },
      },
    },
    NodeCreate: {
      type: "object",
      required: ["name", "fqdn"],
      properties: {
        name: { type: "string", minLength: 1, maxLength: 64 },
        fqdn: { type: "string", minLength: 1, maxLength: 255 },
        scheme: { type: "string", enum: ["http", "https"], default: "http" },
        daemonPort: { type: "integer", minimum: 1, maximum: 65535, default: 8081 },
        behindProxy: { type: "boolean", default: false },
        memoryMb: { type: "integer", minimum: 0, default: 0 },
        location: optionalNullableString,
      },
    },
    NodeUpdate: {
      type: "object",
      properties: {
        name: { type: "string", minLength: 1, maxLength: 64 },
        fqdn: { type: "string", minLength: 1, maxLength: 255 },
        scheme: { type: "string", enum: ["http", "https"] },
        daemonPort: { type: "integer", minimum: 1, maximum: 65535 },
        behindProxy: { type: "boolean" },
        memoryMb: { type: "integer", minimum: 0, maximum: 100_000_000 },
        memoryOverallocate: { type: "integer", minimum: 0, maximum: 1000 },
        diskMb: { type: "integer", minimum: 0, maximum: 100_000_000 },
        diskOverallocate: { type: "integer", minimum: 0, maximum: 1000 },
        cpuLimit: { type: "integer", minimum: 0, maximum: 100_000 },
        cpuOverallocate: { type: "integer", minimum: 0, maximum: 1000 },
        uploadLimitMb: { type: "integer", minimum: 1, maximum: 20_480 },
        daemonBaseDirectory: { type: "string", minLength: 1, maxLength: 255 },
        sftpPort: { type: "integer", minimum: 1, maximum: 65535 },
        sftpAlias: nullableString,
        tags: { type: "array", maxItems: 32, items: { type: "string", minLength: 1, maxLength: 32 } },
        deployable: { type: "boolean" },
        maintenanceMode: { type: "boolean" },
        location: optionalNullableString,
      },
    },
    AllocationProtocol: {
      type: "string",
      enum: ["tcp", "udp"],
    },
    AllocationCreateRange: {
      type: "object",
      required: ["portStart"],
      properties: {
        portStart: { type: "integer", minimum: 1024, maximum: 65535 },
        portEnd: { type: "integer", minimum: 1024, maximum: 65535 },
        protocol: { $ref: "#/components/schemas/AllocationProtocol" },
        ip: { type: "string", minLength: 1, maxLength: 64 },
        notes: { type: "string", maxLength: 255 },
      },
    },
    AllocationAssign: {
      type: "object",
      properties: {
        allocationId: { type: "string", minLength: 1, maxLength: 64 },
        port: { type: "integer", minimum: 1024, maximum: 65535 },
        protocol: { $ref: "#/components/schemas/AllocationProtocol" },
        notes: { type: "string", maxLength: 255 },
        alsoUdp: { type: "boolean" },
      },
    },
    AllocationPatch: {
      type: "object",
      properties: {
        notes: { type: "string", maxLength: 255, nullable: true },
        isPrimary: { type: "boolean" },
        alsoUdp: { type: "boolean" },
      },
    },
    BackupSchedule: {
      type: "object",
      required: ["mode"],
      properties: {
        mode: { type: "string", enum: ["off", "interval", "daily", "cron"] },
        intervalHours: { type: "integer", minimum: 1, maximum: 168 },
        dailyAt: { type: "string" },
        cronExpression: { type: "string", maxLength: 120 },
        keepCount: { type: "integer", minimum: 1, maximum: 50 },
      },
    },
    BackupUploadInit: {
      type: "object",
      required: ["fileName", "sizeBytes"],
      properties: {
        fileName: { type: "string", minLength: 1, maxLength: 255 },
        sizeBytes: { type: "integer", minimum: 1, maximum: 21_474_836_480 },
        note: { type: "string", maxLength: 120 },
      },
    },
  };
}

function buildAllSchemas() {
  return { ...buildSchemas(), ...buildContractSchemas() };
}

const EXPECTED_NAMES = Object.keys(buildAllSchemas());

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
  const requiredFiles = [
    "servers.ts",
    "account.ts",
    "auth.ts",
    "nodes.ts",
    "billing.ts",
    "allocations.ts",
    "backups.ts",
  ];
  for (const file of requiredFiles) {
    const p = path.join(sharedSchemasDir, file);
    if (!fs.existsSync(p)) {
      throw new Error(`missing packages/shared/src/schemas/${file}`);
    }
  }
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
const schemas = buildAllSchemas();
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
