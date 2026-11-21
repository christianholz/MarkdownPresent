export function encodeRepoPath(path) {
  return path.split("/").filter(Boolean).map(encodeURIComponent).join("/");
}

export function repoDirectory(path) {
  const slash = path.lastIndexOf("/");
  return slash < 0 ? "" : path.slice(0, slash + 1);
}

function normalizedRepoPath(path, directory = "", decode = true) {
  const parts = directory.split("/").filter(Boolean);
  for (const part of (decode ? decodeURIComponent(path) : path).split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (!parts.length) throw new Error("Asset path escapes the repository root.");
      parts.pop();
    } else {
      if (part.includes("\\") || part.includes("\0")) throw new Error("Invalid repository asset path.");
      parts.push(part);
    }
  }
  return parts.join("/");
}

export function resolveRepoPath(documentPath, assetPath) {
  const clean = assetPath.split("#")[0].split("?")[0];
  const base = clean.startsWith("/") ? "" : repoDirectory(documentPath);
  return normalizedRepoPath(clean.replace(/^\/+/, ""), base);
}

export function sameRepoGithubPath(input, source) {
  try {
    const url = new URL(input, "https://github.com");
    const decodedPath = decodeURIComponent(url.pathname);
    if (url.hostname === "github.com") {
      for (const marker of ["blob", "raw"]) {
        const simplePrefix = `/${source.owner}/${source.repo}/${marker}/${source.ref}/`;
        const refsPrefix = `/${source.owner}/${source.repo}/${marker}/refs/${source.refType === "tags" ? "tags" : "heads"}/${source.ref}/`;
        if (decodedPath.startsWith(refsPrefix)) return normalizedRepoPath(decodedPath.slice(refsPrefix.length), "", false);
        if (decodedPath.startsWith(simplePrefix)) return normalizedRepoPath(decodedPath.slice(simplePrefix.length), "", false);
      }
    }
    if (url.hostname === "raw.githubusercontent.com") {
      const prefix = `/${source.owner}/${source.repo}/${source.ref}/`;
      if (decodedPath.startsWith(prefix)) return normalizedRepoPath(decodedPath.slice(prefix.length), "", false);
    }
  } catch {
    return null;
  }
  return null;
}
