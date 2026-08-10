import type { UserRole } from "@guartrix/shared";
import { toAuthUser } from "../auth/auth.js";
import {
  countUsers,
  createUser,
  deleteUser,
  findManyUsers,
  findUser,
  findUserByUsernameInsensitive,
  updateUser,
  type User,
} from "../repositories/users.js";
import { updateManyServers } from "./servers.js";

export async function listPanelUsersWithUsage() {
  const users = await findManyUsers({
    orderBy: { createdAt: "asc" },
    include: {
      servers: {
        select: {
          memoryMb: true,
          _count: { select: { databases: true } },
        },
      },
    },
  });
  return users.map((u) =>
    toAuthUser(u, {
      serverCount: u.servers.length,
      memoryUsedMb: u.servers.reduce((sum, s) => sum + s.memoryMb, 0),
      databaseCount: u.servers.reduce((sum, s) => sum + s._count.databases, 0),
    }),
  );
}

export {
  countUsers,
  createUser,
  deleteUser,
  findManyUsers,
  findUser,
  findUserByUsernameInsensitive,
  updateManyServers,
  updateUser,
  type User,
  type UserRole,
};
