import { describe, expect, it } from "vitest";
import {
  canViewFileContents,
  showBulkSelect,
  showDecompressButton,
  showDeleteButton,
  showDownloadButton,
  showRenameButton,
  shouldDownloadInsteadOfEdit,
} from "./file-permissions";

describe("file action permissions", () => {
  it("shows bulk select when download or archive is allowed", () => {
    expect(showBulkSelect({ canDownload: false, canArchive: false })).toBe(false);
    expect(showBulkSelect({ canDownload: true, canArchive: false })).toBe(true);
    expect(showBulkSelect({ canDownload: false, canArchive: true })).toBe(true);
  });

  it("gates download/decompress/rename/delete by capability", () => {
    const file = { type: "file" as const, name: "world.zip" };
    expect(showDownloadButton({ canDownload: true }, file)).toBe(true);
    expect(showDownloadButton({ canDownload: false }, file)).toBe(false);
    expect(showDecompressButton({ canArchive: true }, file)).toBe(true);
    expect(showDecompressButton({ canArchive: true }, { type: "file", name: "x.txt" })).toBe(false);
    expect(showRenameButton({ canUpdate: true })).toBe(true);
    expect(showDeleteButton({ canDelete: false })).toBe(false);
  });

  it("prefers download for non-editable files when allowed", () => {
    expect(shouldDownloadInsteadOfEdit({ editable: false }, { canDownload: true })).toBe(true);
    expect(shouldDownloadInsteadOfEdit({ editable: true }, { canDownload: true })).toBe(false);
  });

  it("blocks file content view without read permission", () => {
    expect(canViewFileContents({ canReadContent: true })).toBe(true);
    expect(canViewFileContents({ canReadContent: false })).toBe(false);
    expect(canViewFileContents({})).toBe(true);
  });
});
