/** Map file path / name to a Monaco language id. */

export function monacoLanguageForPath(path: string): string {
  const base = path.split("/").pop()?.toLowerCase() ?? "";
  if (
    base === "server.properties" ||
    base === "ops.json" ||
    base === "whitelist.json" ||
    base === "banned-players.json" ||
    base === "banned-ips.json" ||
    base === "usercache.json"
  ) {
    return base.endsWith(".json") ? "json" : "properties";
  }
  const dot = base.lastIndexOf(".");
  const ext = dot >= 0 ? base.slice(dot + 1) : "";
  switch (ext) {
    case "yml":
    case "yaml":
      return "yaml";
    case "json":
    case "jsonc":
    case "mcmeta":
      return "json";
    case "properties":
    case "props":
      return "properties";
    case "toml":
      return "ini";
    case "xml":
    case "xsd":
      return "xml";
    case "js":
    case "cjs":
    case "mjs":
    case "ts":
    case "tsx":
      // Basic highlighting only — full TS language service is not shipped (size).
      return "javascript";
    case "md":
    case "markdown":
      return "markdown";
    case "sh":
    case "bash":
      return "shell";
    case "log":
    case "txt":
    case "cfg":
    case "conf":
    case "ini":
      return "plaintext";
    case "sql":
      return "sql";
    case "py":
      return "python";
    case "html":
    case "htm":
    case "css":
      // No dedicated HTML/CSS language workers in the trimmed Monaco assets.
      return "plaintext";
    default:
      return "plaintext";
  }
}
