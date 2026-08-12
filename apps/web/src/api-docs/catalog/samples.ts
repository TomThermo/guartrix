/** Sample JSON for API explorer storage responses. */

export const SAMPLE_STORAGE_POOL = {
  id: "7cCX2CZ3vZUM",
  name: "nfs-main",
  type: "NFS",
  nfsServer: "10.0.0.5",
  nfsExport: "/export/minecraft",
  nfsOptions: "vers=4.1,hard,timeo=600,_netdev",
  diskMb: 1_024_000,
  enabled: true,
  serverCount: 3,
  createdAt: "2026-08-12T06:00:00.000Z",
  updatedAt: "2026-08-12T06:00:00.000Z",
  links: [
    {
      id: "lnk_abc123",
      storageId: "7cCX2CZ3vZUM",
      nodeId: "V1StGXR8_Z5j",
      nodeName: "EU-1",
      mountPoint: "/mnt/nfs-main",
      hostPath: null,
      serverCount: 2,
      createdAt: "2026-08-12T06:00:00.000Z",
      updatedAt: "2026-08-12T06:00:00.000Z",
      status: {
        path: "/mnt/nfs-main",
        exists: true,
        mounted: true,
        source: "10.0.0.5:/export/minecraft",
        fstype: "nfs4",
        disk: {
          totalBytes: 1_099_511_627_776,
          usedBytes: 549_755_813_888,
          freeBytes: 549_755_813_888,
          usedPercent: 50,
        },
        busyServerIds: [],
      },
    },
  ],
} as const;

export const SAMPLE_STORAGES_LIST = { storages: [SAMPLE_STORAGE_POOL] };

export const SAMPLE_STORAGE_GET = { storage: SAMPLE_STORAGE_POOL };
