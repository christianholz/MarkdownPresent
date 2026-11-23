import { repoDirectory, resolveRepoPath, sameRepoGithubPath } from "./paths.js";
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
  return String(name || "image").normalize("NFKD").replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "") || "image";
}

function bytesToBase64(bytes) {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

export function preferredImageFolder(source, references = []) {
  const documentPath = source?.path || "slides.md";
  const documentDirectory = repoDirectory(documentPath);
  const counts = new Map();
  for (const reference of new Set(references)) {
    if (typeof reference !== "string" || !reference) continue;
    try {
      const githubPath = source?.owner ? sameRepoGithubPath(reference, source) : null;
      if (!githubPath && /^(?:[a-z][\w+.-]*:|\/\/)/i.test(reference)) continue;
      const path = githubPath || resolveRepoPath(documentPath, reference);
      const folder = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
      counts.set(folder, (counts.get(folder) || 0) + 1);
    } catch { /* Malformed image references cannot select an upload folder. */ }
  }
  if (!counts.size) return "assets";
  let preferred = "";
  let highestCount = 0;
  let highestRank = -1;
  const markdownDirectory = documentDirectory.replace(/\/$/, "");
  for (const [folder, count] of counts) {
    const isSubfolder = folder !== markdownDirectory && folder.startsWith(documentDirectory);
    const rank = isSubfolder ? 2 : folder === markdownDirectory ? 1 : 0;
    if (count > highestCount || count === highestCount && rank > highestRank) {
      preferred = folder;
      highestCount = count;
      highestRank = rank;
    }
  }
  const from = markdownDirectory.split("/").filter(Boolean);
  const to = preferred.split("/").filter(Boolean);
  let shared = 0;
  while (shared < from.length && shared < to.length && from[shared] === to[shared]) shared += 1;
  return [...Array(from.length - shared).fill(".."), ...to.slice(shared)].join("/") || ".";
}

export class WorkingRepository {
  constructor(base, source) {
    this.base = base;
    this.source = source;
    this.documentFile = base.documentFile;
    this.assets = new Map();
  }

  async readText() { return this.base.readText(); }

  async readBlob(path) { return this.assets.get(normalizePath(path)) || this.base.readBlob(path); }

  async addFile(file, references = []) {
    if (!(file instanceof Blob) || !String(file.type).startsWith("image/")) {
      throw new Error("Choose an image file to add to this deck.");
    }
    const documentPath = this.source?.path || this.documentFile?.webkitRelativePath || this.documentFile?.name || "slides.md";
    const folder = preferredImageFolder({ ...this.source, path: documentPath }, references);
    const original = cleanFilename(file.name || `image.${String(file.type || "image/png").split("/")[1] || "png"}`);
    const dot = original.lastIndexOf(".");
    const stem = dot > 0 ? original.slice(0, dot) : original;
    const extension = dot > 0 ? original.slice(dot) : "";
    let filename = original;
    let counter = 2;
    const exists = async (path) => this.assets.has(path) || (typeof this.base.hasBlob === "function" && await this.base.hasBlob(path));
    const referenceFor = (name) => `${folder.startsWith(".") ? folder : `./${folder}`}/${name}`;
    while (await exists(resolveRepoPath(documentPath, referenceFor(filename)))) {
      filename = `${stem}-${counter}${extension}`;
      counter += 1;
    }
    const path = resolveRepoPath(documentPath, referenceFor(filename));
    this.assets.set(path, file);
    const alt = filename.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").replace(/^\w/, (letter) => letter.toUpperCase());
    return { reference: referenceFor(filename), path, alt };
  }

  async serializedAssets(paths = null) {
    const entries = paths ? [...this.assets].filter(([path]) => paths.has(path)) : [...this.assets];
    return Promise.all(entries.map(async ([path, blob]) => ({
      path,
      type: blob.type || "application/octet-stream",
      data: bytesToBase64(new Uint8Array(await blob.arrayBuffer())),
    })));
  }
}

export function normalizeImageUrl(input) {
  let url;
  try { url = new URL(String(input || "").trim()); }
  catch { throw new Error("Paste a complete HTTPS image URL."); }
  if (url.protocol !== "https:" || !url.hostname || url.username || url.password) {
    throw new Error("Paste a complete HTTPS image URL.");
  }
  return url.href;
}

function imageAltText(url) {
  let filename;
  try { filename = decodeURIComponent(new URL(url).pathname.split("/").pop() || ""); }
  catch { filename = ""; }
  return filename.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").replace(/[\[\]\r\n]/g, "").trim() || "Image";
}

function insertImageReferenceIntoSlide(markdown, slideModel, reference, alt, annotationState = {}) {
  const start = Number(slideModel?.sourceEnd);
  if (!Number.isInteger(start) || start < 0 || start > markdown.length) {
    throw new Error("The active slide could not be located in the Markdown source.");
  }
  const insertion = `\n\n![${alt}](${reference})`;
  return {
    markdown: replaceMarkdownRange(markdown, start, start, insertion),
    annotationState: {
      ...annotationState,
      comments: remapCommentOffsets(annotationState.comments || [], start, start, "", insertion),
      editCount: (annotationState.editCount || 0) + 1,
    },
  };
}

export function insertImageUrlIntoSlide(markdown, slideModel, input, annotationState = {}) {
  const url = normalizeImageUrl(input);
  return insertImageReferenceIntoSlide(markdown, slideModel, `<${url}>`, imageAltText(url), annotationState);
}

export function insertImageIntoSlide(markdown, slideModel, asset, annotationState = {}) {
  return insertImageReferenceIntoSlide(markdown, slideModel, asset.reference, asset.alt, annotationState);
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

export function triggerDownload(filename, blob) {
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
  const documentPath = resolveRepoPath("", source?.path || repository.documentFile?.name || "presentation.md");
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
