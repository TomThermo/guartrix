/** Path helpers for the file manager. */

export function parentPath(path: string): string {
  if (!path) return ".";
  const parts = path.split("/").filter(Boolean);
  parts.pop();
  return parts.length ? parts.join("/") : ".";
}

export function isArchiveName(name: string): boolean {
  const lower = name.toLowerCase();
  return (
    lower.endsWith(".zip") ||
    lower.endsWith(".tar.gz") ||
    lower.endsWith(".tgz") ||
    lower.endsWith(".tar")
  );
}

export function joinPath(dir: string, name: string): string {
  return dir === "." || !dir ? name : `${dir}/${name}`;
}
