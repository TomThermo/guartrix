import net from "node:net";

export interface StatusPlayerSample {
  name: string;
  id: string;
}

export interface ServerStatusPing {
  online: boolean;
  versionName: string | null;
  protocol: number | null;
  playersOnline: number;
  playersMax: number;
  sample: StatusPlayerSample[];
  description: string | null;
  latencyMs: number | null;
}

function writeVarInt(value: number): Buffer {
  const bytes: number[] = [];
  let v = value >>> 0;
  do {
    let temp = v & 0x7f;
    v >>>= 7;
    if (v !== 0) temp |= 0x80;
    bytes.push(temp);
  } while (v !== 0);
  return Buffer.from(bytes);
}

function readVarInt(buffer: Buffer, offset: number): { value: number; size: number } {
  let value = 0;
  let size = 0;
  let byte: number;
  do {
    if (offset + size >= buffer.length) {
      throw new Error("Unexpected end of VarInt");
    }
    byte = buffer[offset + size]!;
    value |= (byte & 0x7f) << (7 * size);
    size += 1;
    if (size > 5) throw new Error("VarInt too big");
  } while ((byte & 0x80) !== 0);
  return { value, size };
}

function writeString(str: string): Buffer {
  const data = Buffer.from(str, "utf8");
  return Buffer.concat([writeVarInt(data.length), data]);
}

function writeUnsignedShort(n: number): Buffer {
  const buf = Buffer.alloc(2);
  buf.writeUInt16BE(n & 0xffff, 0);
  return buf;
}

function packet(id: number, data: Buffer): Buffer {
  const idBuf = writeVarInt(id);
  const length = writeVarInt(idBuf.length + data.length);
  return Buffer.concat([length, idBuf, data]);
}

function stripMotd(desc: unknown): string | null {
  if (desc == null) return null;
  if (typeof desc === "string") return desc;
  if (typeof desc === "object") {
    const obj = desc as { text?: string; extra?: unknown[] };
    let text = obj.text ?? "";
    if (Array.isArray(obj.extra)) {
      for (const part of obj.extra) {
        if (typeof part === "string") text += part;
        else if (part && typeof part === "object" && "text" in part) {
          text += String((part as { text: string }).text ?? "");
        }
      }
    }
    return text || null;
  }
  return null;
}

/**
 * Minecraft Server List Ping (modern protocol).
 * Connects to host:port and returns online player count + sample.
 */
export function pingMinecraftServer(
  host: string,
  port: number,
  timeoutMs = 3000,
): Promise<ServerStatusPing> {
  const started = Date.now();
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    let buffer = Buffer.alloc(0);
    let settled = false;

    const finish = (result: ServerStatusPing) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };

    const empty = (partial?: Partial<ServerStatusPing>): ServerStatusPing => ({
      online: false,
      versionName: null,
      protocol: null,
      playersOnline: 0,
      playersMax: 0,
      sample: [],
      description: null,
      latencyMs: null,
      ...partial,
    });

    socket.setTimeout(timeoutMs);

    socket.on("connect", () => {
      // Handshake: protocol -1 (status), next state 1
      const handshake = packet(
        0x00,
        Buffer.concat([
          writeVarInt(-1),
          writeString(host),
          writeUnsignedShort(port),
          writeVarInt(1),
        ]),
      );
      const statusRequest = packet(0x00, Buffer.alloc(0));
      socket.write(Buffer.concat([handshake, statusRequest]));
    });

    socket.on("data", (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      try {
        const { value: length, size: lengthSize } = readVarInt(buffer, 0);
        if (buffer.length < lengthSize + length) return;

        const packetBuf = buffer.subarray(lengthSize, lengthSize + length);
        const { value: packetId, size: idSize } = readVarInt(packetBuf, 0);
        if (packetId !== 0x00) {
          finish(empty());
          return;
        }

        const { value: jsonLen, size: jsonLenSize } = readVarInt(packetBuf, idSize);
        const jsonStart = idSize + jsonLenSize;
        const jsonEnd = jsonStart + jsonLen;
        if (packetBuf.length < jsonEnd) return;

        const json = packetBuf.subarray(jsonStart, jsonEnd).toString("utf8");
        const data = JSON.parse(json) as {
          version?: { name?: string; protocol?: number };
          players?: {
            max?: number;
            online?: number;
            sample?: { name?: string; id?: string }[];
          };
          description?: unknown;
        };

        finish({
          online: true,
          versionName: data.version?.name ?? null,
          protocol: data.version?.protocol ?? null,
          playersOnline: data.players?.online ?? 0,
          playersMax: data.players?.max ?? 0,
          sample: (data.players?.sample ?? [])
            .filter((p) => p.name)
            .map((p) => ({
              name: p.name!,
              id: p.id ?? "",
            })),
          description: stripMotd(data.description),
          latencyMs: Date.now() - started,
        });
      } catch {
        finish(empty());
      }
    });

    socket.on("timeout", () => finish(empty()));
    socket.on("error", () => finish(empty()));
    socket.on("close", () => finish(empty()));
  });
}
