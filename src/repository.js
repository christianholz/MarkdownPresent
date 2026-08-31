function normalizeLocalPath(path) {
  const parts = [];
  for (const part of path.replace(/^\.\//, "").split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") parts.pop(); else parts.push(part);
  }
  return parts.join("/");
}

export class LocalRepository {
  constructor(files, documentFile) {
    this.documentFile = documentFile;
    this.files = new Map();
    for (const file of files) {
      const relative = file.mdpresentRelativePath || file.webkitRelativePath || file.name;
      this.files.set(normalizeLocalPath(relative), file);
      this.files.set(normalizeLocalPath(file.name), file);
      const withoutTopFolder = relative.includes("/") ? relative.split("/").slice(1).join("/") : relative;
      this.files.set(normalizeLocalPath(withoutTopFolder), file);
    }
  }
  async readText() { return this.documentFile.text(); }
  async readBlob(path) {
    const file = this.files.get(normalizeLocalPath(path));
    if (!file) throw new Error(`Local asset not selected: ${path}`);
    return file;
  }
  async hasBlob(path) { return this.files.has(normalizeLocalPath(path)); }
}

export class InlineRepository {
  constructor(markdown) { this.markdown = markdown; }
  async readText() { return this.markdown; }
  async readBlob(path) {
    const response = await fetch(path);
    if (!response.ok) throw new Error(`Referenced asset is not available: ${path}`);
    return response.blob();
  }
  async hasBlob() {
    // Development servers commonly return the app shell for missing paths.
    // Authored assets live in the working repository, so remote probing would
    // turn those fallback responses into false filename collisions.
    return false;
  }
}

export class GithubPageRepository {
  constructor(source, markdown, sourceTabId) {
    this.source = source;
    this.markdown = markdown;
    this.sourceTabId = sourceTabId;
  }
  async readText() { return this.markdown; }
  async readBlob(path) {
    const result = await chrome.runtime.sendMessage({
      type: "mdpresent:asset",
      sourceTabId: this.sourceTabId,
      source: this.source,
      path,
    });
    if (!result?.ok) throw new Error(result?.error || "GitHub image request failed.");
    const binary = atob(result.data);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return new Blob([bytes], { type: result.type });
  }
  async hasBlob(path) {
    try {
      await this.readBlob(path);
      return true;
    } catch {
      return false;
    }
  }
}
