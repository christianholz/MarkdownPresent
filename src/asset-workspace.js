import { resolveRepoPath, sameRepoGithubPath } from "./paths.js";
import { remapCommentOffsets, replaceMarkdownRange } from "./annotations.js";

function normalizePath(path) {
  const parts = [];
  for (const part of String(path || "").replace(/^\/+/, "").split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") parts.pop(); else parts.push(part);
  }
  return parts.join("/");
}

function cleanFilename(name) {
  const normalized = String(name || "image").normalize("NFKD").replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "");
  return normalized || "image";
}

function titleFromFilename(name) {
  return cleanFilename(name).replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").replace(/^\w/, (letter) => letter.toUpperCase());
}

function bytesToBase64(bytes) {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export class WorkingRepository {
  constructor(base, source, serializedAssets = []) {
    this.base = base;
    this.source = source;
    this.documentFile = base.documentFile;
    this.assets = new Map();
    for (const asset of serializedAssets || []) {
      if (!asset?.path || !asset?.data) continue;
      this.assets.set(normalizePath(asset.path), new Blob([base64ToBytes(asset.data)], { type: asset.type || "application/octet-stream" }));
    }
  }

  async readText() { return this.base.readText(); }

  async readBlob(path) {
    const normalized = normalizePath(path);
    return this.assets.get(normalized) || this.base.readBlob(path);
  }

  async addFile(file) {
    const documentPath = this.source?.path || this.documentFile?.webkitRelativePath || this.documentFile?.name || "slides.md";
    const directory = documentPath.includes("/") ? documentPath.slice(0, documentPath.lastIndexOf("/") + 1) : "";
    const original = cleanFilename(file.name || `image.${String(file.type || "image/png").split("/")[1] || "png"}`);
    const dot = original.lastIndexOf(".");
    const stem = dot > 0 ? original.slice(0, dot) : original;
    const extension = dot > 0 ? original.slice(dot) : "";
    let filename = original;
    let counter = 2;
    const exists = async (path) => {
      if (this.assets.has(path)) return true;
      return typeof this.base.hasBlob === "function" ? this.base.hasBlob(path) : false;
    };
    while (await exists(normalizePath(`${directory}assets/${filename}`))) {
      filename = `${stem}-${counter}${extension}`;
      counter += 1;
    }
    const path = normalizePath(`${directory}assets/${filename}`);
    this.assets.set(path, file);
    return { reference: `./assets/${filename}`, path, alt: titleFromFilename(filename) };
  }

  async serializedAssets() {
    return Promise.all([...this.assets].map(async ([path, blob]) => ({
      path,
      type: blob.type || "application/octet-stream",
      data: bytesToBase64(new Uint8Array(await blob.arrayBuffer())),
    })));
  }
}

export function insertImageIntoSlide(markdown, slideModel, asset, annotationState = {}) {
  const start = Number(slideModel?.sourceEnd);
  if (!Number.isInteger(start) || start < 0 || start > markdown.length) {
    throw new Error("The active slide could not be located in the Markdown source.");
  }
  const insertion = `\n\n![${asset.alt}](${asset.reference})`;
  return {
    markdown: replaceMarkdownRange(markdown, start, start, insertion),
    annotationState: {
      ...annotationState,
      comments: remapCommentOffsets(annotationState.comments || [], start, start, "", insertion),
      editCount: (annotationState.editCount || 0) + 1,
    },
  };
}

const CRC_TABLE = Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit += 1) crc = (crc & 1) ? (0xedb88320 ^ (crc >>> 1)) : (crc >>> 1);
  return crc >>> 0;
});

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function header(size) {
  const buffer = new ArrayBuffer(size);
  return { bytes: new Uint8Array(buffer), view: new DataView(buffer) };
}

function zipBlob(files) {
  const encoder = new TextEncoder();
  const parts = [];
  const directory = [];
  let offset = 0;
  for (const file of files) {
    const name = encoder.encode(normalizePath(file.path));
    const data = file.data instanceof Uint8Array ? file.data : new Uint8Array(file.data);
    const checksum = crc32(data);
    const local = header(30);
    local.view.setUint32(0, 0x04034b50, true);
    local.view.setUint16(4, 20, true);
    local.view.setUint16(6, 0x0800, true);
    local.view.setUint32(14, checksum, true);
    local.view.setUint32(18, data.length, true);
    local.view.setUint32(22, data.length, true);
    local.view.setUint16(26, name.length, true);
    parts.push(local.bytes, name, data);

    const central = header(46);
    central.view.setUint32(0, 0x02014b50, true);
    central.view.setUint16(4, 20, true);
    central.view.setUint16(6, 20, true);
    central.view.setUint16(8, 0x0800, true);
    central.view.setUint32(16, checksum, true);
    central.view.setUint32(20, data.length, true);
    central.view.setUint32(24, data.length, true);
    central.view.setUint16(28, name.length, true);
    central.view.setUint32(42, offset, true);
    directory.push(central.bytes, name);
    offset += local.bytes.length + name.length + data.length;
  }
  const directorySize = directory.reduce((size, part) => size + part.length, 0);
  const end = header(22);
  end.view.setUint32(0, 0x06054b50, true);
  end.view.setUint16(8, files.length, true);
  end.view.setUint16(10, files.length, true);
  end.view.setUint32(12, directorySize, true);
  end.view.setUint32(16, offset, true);
  return new Blob([...parts, ...directory, end.bytes], { type: "application/zip" });
}

function triggerDownload(filename, blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function downloadDeckWorkspace({ repository, source, markdown, references }) {
  const documentPath = normalizePath(source?.path || repository.documentFile?.name || "presentation.md");
  const files = [{ path: documentPath, data: new TextEncoder().encode(markdown) }];
  const included = new Set([documentPath]);
  for (const reference of references || []) {
    if (!reference || /^(?:data:|https?:)/i.test(reference) && !sameRepoGithubPath(reference, source)) continue;
    try {
      const path = sameRepoGithubPath(reference, source) || resolveRepoPath(documentPath, reference);
      if (included.has(path)) continue;
      const blob = await repository.readBlob(path);
      files.push({ path, data: new Uint8Array(await blob.arrayBuffer()) });
      included.add(path);
    } catch {
      // The Markdown remains usable with external or temporarily unavailable assets.
    }
  }
  const stem = documentPath.split("/").pop().replace(/\.(?:md|markdown)$/i, "") || "presentation";
  triggerDownload(`${stem}-workspace.zip`, zipBlob(files));
}
