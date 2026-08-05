/** Re-export from node-agent so panel and daemon share one icon + path helpers. */
export {
  resolveDefaultServerIconPath,
  getDefaultServerIconPath,
  ensureDefaultServerIcon,
  readDefaultServerIcon,
  serverIconFilePath,
  isCustomServerIcon,
} from "@msm/node-agent";
