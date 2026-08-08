/** Split markdown into top-level blocks (fences stay intact). */
export function splitBlocks(text: string): string[] {
  const normalized = text.replace(/\r\n/g, "\n");
  const blocks: string[] = [];
  let i = 0;
  const lines = normalized.split("\n");
  while (i < lines.length) {
    const line = lines[i]!;
    if (line.startsWith("```")) {
      const fence = [line];
      i += 1;
      while (i < lines.length && !lines[i]!.startsWith("```")) {
        fence.push(lines[i]!);
        i += 1;
      }
      if (i < lines.length) fence.push(lines[i]!);
      i += 1;
      blocks.push(fence.join("\n"));
      continue;
    }
    if (!line.trim()) {
      i += 1;
      continue;
    }
    const chunk: string[] = [line];
    i += 1;
    while (i < lines.length && lines[i]!.trim()) {
      if (lines[i]!.startsWith("```")) break;
      // Keep table rows together even with blank? tables don't have blanks mid-block in our splitter
      chunk.push(lines[i]!);
      i += 1;
    }
    blocks.push(chunk.join("\n"));
  }
  return blocks;
}

/** Drop the first H1 (page already shows the title). */
export function stripLeadingH1(markdown: string): string {
  return markdown.replace(/^#\s+[^\n]+\n+/, "");
}

export function isSeparatorRow(line: string): boolean {
  const t = line.trim();
  // e.g. |-----|----------------|  — hyphen must not sit between : and | in a char class
  // (that would be a range from ":" to "|", which excludes ASCII "-").
  return /^\|?[:\-\s|]+\|?$/.test(t) && /[-:]/.test(t) && !/[A-Za-z0-9]/.test(t);
}

export function isTableBlock(trimmed: string): boolean {
  const lines = trimmed.split("\n").filter((l) => l.trim());
  if (lines.length < 2) return false;
  if (!lines[0]!.includes("|")) return false;
  return isSeparatorRow(lines[1]!);
}
