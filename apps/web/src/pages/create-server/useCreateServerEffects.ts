import { useEffect } from "react";
import type { DaemonNode, ServerType } from "@guartrix/shared";
import { api } from "../../api";

/** Port suggestion / validation + version list side-effects for create/import. */
export function useCreateServerEffects({
  type,
  nodeId,
  port,
  portManuallyEdited,
  setPort,
  setPortError,
  setPortChecking,
  setPortManuallyEdited,
  setVersions,
  setMcVersion,
  setLoadingVersions,
  setError,
  setNodes,
  setNodeId,
  setKeepCount,
  t,
}: {
  type: ServerType;
  nodeId: string;
  port: number;
  portManuallyEdited: boolean;
  setPort: (port: number) => void;
  setPortError: (err: string | null) => void;
  setPortChecking: (v: boolean) => void;
  setPortManuallyEdited: (v: boolean) => void;
  setVersions: (v: string[]) => void;
  setMcVersion: (v: string) => void;
  setLoadingVersions: (v: boolean) => void;
  setError: (err: string | null) => void;
  setNodes: (nodes: DaemonNode[]) => void;
  setNodeId: (id: string) => void;
  setKeepCount: (n: number) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}) {
  useEffect(() => {
    void api
      .getCreateServerDefaults()
      .then(({ defaultBackupKeepCount }) => setKeepCount(defaultBackupKeepCount))
      .catch(() => undefined);
  }, [setKeepCount]);

  useEffect(() => {
    void api
      .listNodes()
      .then(({ nodes: list }) => {
        const ranked = [...list].sort((a, b) => {
          const aOnline = a.status === "ONLINE" ? 1 : 0;
          const bOnline = b.status === "ONLINE" ? 1 : 0;
          if (aOnline !== bOnline) return bOnline - aOnline;
          const aFree = a.memoryMb > 0 ? (a.memoryUsableMb ?? a.memoryAvailableMb) : -1;
          const bFree = b.memoryMb > 0 ? (b.memoryUsableMb ?? b.memoryAvailableMb) : -1;
          if (aFree !== bFree) return bFree - aFree;
          if (a.isLocal !== b.isLocal) return a.isLocal ? -1 : 1;
          return a.name.localeCompare(b.name);
        });
        setNodes(ranked);
        const preferred =
          ranked.find(
            (n) =>
              n.status === "ONLINE" &&
              (n.memoryMb <= 0 || (n.memoryUsableMb ?? n.memoryAvailableMb) > 0),
          ) ??
          ranked.find((n) => n.isLocal) ??
          ranked.find((n) => n.status === "ONLINE") ??
          ranked[0];
        if (preferred) setNodeId(preferred.id);
      })
      .catch(() => setNodes([]));
  }, [setNodes, setNodeId]);

  useEffect(() => {
    let cancelled = false;
    setLoadingVersions(true);
    api
      .versions(type)
      .then((res) => {
        if (cancelled) return;
        setVersions(res.versions);
        setMcVersion(res.versions[0] ?? "");
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : t("createServer.versionsFailed"));
          setVersions([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingVersions(false);
      });
    return () => {
      cancelled = true;
    };
  }, [type, t, setVersions, setMcVersion, setLoadingVersions, setError]);

  useEffect(() => {
    setPortManuallyEdited(false);
  }, [setPortManuallyEdited]);

  useEffect(() => {
    if (!nodeId) return;
    let cancelled = false;
    void api
      .suggestedPort(nodeId, type)
      .then((res) => {
        if (cancelled || portManuallyEdited) return;
        setPort(res.port);
        setPortError(null);
      })
      .catch((err) => {
        if (!cancelled && !portManuallyEdited) {
          setPortError(err instanceof Error ? err.message : String(err));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [nodeId, type, portManuallyEdited, setPort, setPortError]);

  useEffect(() => {
    if (!nodeId || port < 1024 || port > 65535) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setPortChecking(true);
      void api
        .checkNodePort(nodeId, port, type)
        .then((res) => {
          if (cancelled) return;
          if (!res.free) {
            setPortError(
              t("createServer.portInUse", {
                port: res.port,
                protocol: res.protocol.toUpperCase(),
              }),
            );
          } else {
            setPortError(null);
          }
        })
        .catch(() => {
          if (!cancelled) setPortError(null);
        })
        .finally(() => {
          if (!cancelled) setPortChecking(false);
        });
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [nodeId, port, type, t, setPortChecking, setPortError]);
}
