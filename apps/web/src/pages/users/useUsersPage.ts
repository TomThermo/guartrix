import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { AuthUser, UserRole } from "@guartrix/shared";
import { roleLabel } from "@guartrix/shared";
import { api } from "../../api";
import { useAuth } from "../../auth";
import { useI18n } from "../../i18n/react";

export const USER_ROLES: UserRole[] = ["ADMIN", "OPERATOR", "VIEWER"];

export function roleBadge(role: UserRole): "primary" | "success" | "secondary" {
  if (role === "ADMIN") return "primary";
  if (role === "OPERATOR") return "success";
  return "secondary";
}

export function roleHintKey(
  role: UserRole,
): "users.roleHintAdmin" | "users.roleHintOperator" | "users.roleHintViewer" {
  switch (role) {
    case "ADMIN":
      return "users.roleHintAdmin";
    case "OPERATOR":
      return "users.roleHintOperator";
    case "VIEWER":
      return "users.roleHintViewer";
  }
}

export function quotaText(u: AuthUser, unlimitedLabel: string): string {
  if (u.role === "ADMIN") return unlimitedLabel;
  const servers =
    u.maxServers == null
      ? `${u.serverCount ?? 0} servers (no limit)`
      : `${u.serverCount ?? 0}/${u.maxServers} servers`;
  const usedGb = ((u.memoryUsedMb ?? 0) / 1024).toFixed(
    u.memoryUsedMb && u.memoryUsedMb % 1024 === 0 ? 0 : 1,
  );
  const ram =
    u.maxMemoryMb == null
      ? `${usedGb} GB RAM used (no limit)`
      : `${usedGb}/${(u.maxMemoryMb / 1024).toFixed(u.maxMemoryMb % 1024 === 0 ? 0 : 1)} GB RAM`;
  const dbs =
    u.maxDatabases == null
      ? `${u.databaseCount ?? 0} DBs (no limit)`
      : `${u.databaseCount ?? 0}/${u.maxDatabases} DBs`;
  return `${servers} · ${ram} · ${dbs}`;
}

export function useUsersPage() {
  const { user: me } = useAuth();
  const { t } = useI18n();
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [hostMemoryGb, setHostMemoryGb] = useState(4);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [quotaUser, setQuotaUser] = useState<AuthUser | null>(null);
  const [activityUser, setActivityUser] = useState<AuthUser | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("OPERATOR");
  const [maxServers, setMaxServers] = useState(1);
  const [maxMemoryGb, setMaxMemoryGb] = useState(4);
  const [maxDatabases, setMaxDatabases] = useState(3);
  const [unlimitedServers, setUnlimitedServers] = useState(false);
  const [unlimitedRam, setUnlimitedRam] = useState(false);
  const [unlimitedDatabases, setUnlimitedDatabases] = useState(false);
  const [filter, setFilter] = useState("");

  const refresh = useCallback(async () => {
    const [list, system] = await Promise.all([api.listUsers(), api.getSystem()]);
    setUsers(list);
    setHostMemoryGb(system.totalMemoryGb);
    setMaxMemoryGb(
      (prev) => Math.min(prev, system.totalMemoryGb) || Math.min(4, system.totalMemoryGb),
    );
  }, []);

  useEffect(() => {
    setLoading(true);
    void refresh()
      .catch((err) => setError(err instanceof Error ? err.message : t("users.loadFailed")))
      .finally(() => setLoading(false));
  }, [refresh, t]);

  function resetCreateForm() {
    setUsername("");
    setPassword("");
    setRole("OPERATOR");
    setMaxServers(1);
    setMaxMemoryGb(Math.min(4, hostMemoryGb));
    setMaxDatabases(3);
    setUnlimitedServers(false);
    setUnlimitedRam(false);
    setUnlimitedDatabases(false);
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await api.createUser({
        username: username.trim(),
        password,
        role,
        maxServers: role === "ADMIN" || unlimitedServers ? null : maxServers,
        maxMemoryMb: role === "ADMIN" || unlimitedRam ? null : maxMemoryGb * 1024,
        maxDatabases: role === "ADMIN" || unlimitedDatabases ? null : maxDatabases,
      });
      resetCreateForm();
      setShowCreate(false);
      setNotice(t("users.createdNotice"));
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("users.createFailed"));
    } finally {
      setBusy(false);
    }
  }

  async function onChangeRole(user: AuthUser, next: UserRole) {
    if (user.role === next) return;
    setError(null);
    setNotice(null);
    try {
      await api.updateUser(user.id, { role: next });
      setNotice(t("users.roleUpdated", { username: user.username, role: roleLabel(next) }));
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("users.updateFailed"));
    }
  }

  async function onDelete(user: AuthUser) {
    if (!confirm(t("users.deleteConfirm", { username: user.username }))) {
      return;
    }
    setError(null);
    setNotice(null);
    try {
      await api.deleteUser(user.id);
      setNotice(t("users.deletedNotice", { username: user.username }));
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("users.deleteFailed"));
    }
  }

  async function onResetTwoFactor(user: AuthUser) {
    if (!confirm(t("users.reset2faConfirm", { username: user.username }))) {
      return;
    }
    setError(null);
    setNotice(null);
    try {
      await api.updateUser(user.id, { disableTwoFactor: true });
      setNotice(t("users.reset2faNotice", { username: user.username }));
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("users.reset2faFailed"));
    }
  }

  const filtered = users.filter((u) => {
    const q = filter.trim().toLowerCase();
    if (!q) return true;
    return (
      u.username.toLowerCase().includes(q) ||
      u.role.toLowerCase().includes(q) ||
      roleLabel(u.role).toLowerCase().includes(q)
    );
  });

  return {
    t,
    me,
    users,
    filtered,
    hostMemoryGb,
    loading,
    error,
    setError,
    notice,
    setNotice,
    busy,
    quotaUser,
    setQuotaUser,
    activityUser,
    setActivityUser,
    showCreate,
    setShowCreate,
    username,
    setUsername,
    password,
    setPassword,
    role,
    setRole,
    maxServers,
    setMaxServers,
    maxMemoryGb,
    setMaxMemoryGb,
    maxDatabases,
    setMaxDatabases,
    unlimitedServers,
    setUnlimitedServers,
    unlimitedRam,
    setUnlimitedRam,
    unlimitedDatabases,
    setUnlimitedDatabases,
    filter,
    setFilter,
    refresh,
    onCreate,
    onChangeRole,
    onDelete,
    onResetTwoFactor,
  };
}

export type UsersPageState = ReturnType<typeof useUsersPage>;
