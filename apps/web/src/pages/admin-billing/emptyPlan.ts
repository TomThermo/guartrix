export const emptyPlan = {
  slug: "starter",
  name: "Starter",
  description: "",
  priceCents: 999,
  currency: "EUR",
  maxServers: 1,
  maxMemoryMb: 4096,
  maxDatabases: 3,
  defaultMemoryMb: 4096,
  defaultDiskMb: 10240,
  autoCreateServer: false,
  defaultServerType: "PAPER",
  defaultMcVersion: "1.21.1",
  recurringInterval: "" as string,
  enabled: true,
  sortOrder: 0,
};

export type PlanFormState = typeof emptyPlan;
