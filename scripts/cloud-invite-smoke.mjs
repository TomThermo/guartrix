/**
 * Local cloud smoke: unverified user must get EMAIL_NOT_VERIFIED on invite accept.
 * Not part of customer packaging — operator/dev helper only.
 */
import { PrismaClient } from "@prisma/client";
import { createHash, randomBytes, scryptSync } from "node:crypto";
import { nanoid } from "nanoid";

const prisma = new PrismaClient();
const API = process.env.SMOKE_API_BASE || "http://127.0.0.1:3001";
const ORIGIN = process.env.SMOKE_ORIGIN || process.env.PUBLIC_BASE_URL || "http://127.0.0.1:3080";

const SCRYPT_OPTS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64, SCRYPT_OPTS).toString("hex");
  return `scrypt$v1$${SCRYPT_OPTS.N}$${SCRYPT_OPTS.r}$${SCRYPT_OPTS.p}$${salt}$${hash}`;
}

function hashInviteToken(raw) {
  return createHash("sha256").update(raw).digest("hex");
}

function cookieFrom(res) {
  const raw = res.headers.getSetCookie?.() ?? [];
  if (raw.length) {
    return raw.map((c) => c.split(";")[0]).join("; ");
  }
  const single = res.headers.get("set-cookie");
  return single
    ? single
        .split(",")
        .map((c) => c.split(";")[0].trim())
        .join("; ")
    : "";
}

const email = `unverified-${Date.now()}@example.com`;
const password = "TestPassw0rd!x";
const username = `u${Date.now().toString(36)}`;

const user = await prisma.user.create({
  data: {
    id: nanoid(),
    username,
    email,
    emailVerified: false,
    passwordHash: hashPassword(password),
    role: "VIEWER",
  },
});

let server = await prisma.server.findFirst();
if (!server) {
  const node = await prisma.node.findFirst();
  const admin = await prisma.user.findFirst({ where: { role: "ADMIN" } });
  if (!node || !admin) {
    console.log(JSON.stringify({ error: "NO_NODE_OR_ADMIN", node: !!node, admin: !!admin }));
    await prisma.$disconnect();
    process.exit(1);
  }
  server = await prisma.server.create({
    data: {
      id: nanoid(12),
      name: "invite-test",
      type: "PAPER",
      ownerId: admin.id,
      nodeId: node.id,
      port: 25565,
      memoryMb: 1024,
      mcVersion: "1.21.1",
    },
  });
}

const raw = randomBytes(24).toString("hex");
await prisma.subUser.create({
  data: {
    id: nanoid(),
    serverId: server.id,
    email,
    permissions: '["control.console"]',
    inviteTokenHash: hashInviteToken(raw),
    inviteExpiresAt: new Date(Date.now() + 86400000),
  },
});

const loginRes = await fetch(`${API}/api/auth/login`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    origin: ORIGIN,
    referer: `${ORIGIN}/`,
  },
  body: JSON.stringify({ username, password }),
});
const loginBody = await loginRes.json().catch(() => ({}));
const cookie = cookieFrom(loginRes);
const csrfToken = loginBody?.csrfToken;
if (!loginRes.ok || !cookie) {
  console.log(
    JSON.stringify({
      error: "LOGIN_FAILED",
      status: loginRes.status,
      body: loginBody,
      userId: user.id,
      origin: ORIGIN,
    }),
  );
  await prisma.$disconnect();
  process.exit(1);
}

const acceptRes = await fetch(`${API}/api/invites/${raw}/accept`, {
  method: "POST",
  headers: {
    cookie,
    "content-type": "application/json",
    origin: ORIGIN,
    referer: `${ORIGIN}/`,
    ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
  },
});
const acceptBody = await acceptRes.json().catch(() => ({}));

const ok = acceptRes.status === 403 && acceptBody?.code === "EMAIL_NOT_VERIFIED";

console.log(
  JSON.stringify({
    ok,
    loginStatus: loginRes.status,
    acceptStatus: acceptRes.status,
    acceptBody,
    email,
    username,
    serverId: server.id,
  }),
);

await prisma.subUser.deleteMany({ where: { email } });
await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
await prisma.$disconnect();
process.exit(ok ? 0 : 1);
