export type StoragePoolLink = {
  id: string;
  storageId: string;
  nodeId: string;
  nodeName: string;
  mountPoint: string;
  hostPath: string | null;
  serverCount: number;
  status: {
    path: string;
    exists: boolean;
    mounted: boolean;
    source: string | null;
    fstype: string | null;
    disk: {
      totalBytes: number;
      usedBytes: number;
      freeBytes: number;
      usedPercent: number;
    } | null;
    busyServerIds: string[];
  } | null;
};

export type StoragePool = {
  id: string;
  name: string;
  type: "LOCAL" | "NFS";
  nfsServer: string | null;
  nfsExport: string | null;
  nfsOptions: string | null;
  diskMb: number;
  enabled: boolean;
  serverCount: number;
  links: StoragePoolLink[];
};
