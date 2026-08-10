export function encodeRepoPath(path) {
  return path.split("/").filter(Boolean).map(encodeURIComponent).join("/");
}

export function repoDirectory(path) {
  const slash = path.lastIndexOf("/");
  return slash < 0 ? "" : path.slice(0, slash + 1);
}

export function resolveRepoPath(documentPath, assetPath) {
  const clean = assetPath.split("#")[0].split("?")[0];
  const base = clean.startsWith("/") ? "" : repoDirectory(documentPath);
  const resolved = new URL(clean.replace(/^\/+/, ""), `https://repo.invalid/${base}`);
  const normalized = decodeURIComponent(resolved.pathname.replace(/^\/+/, ""));
  if (normalized.startsWith("../") || normalized === "..") {
    throw new Error("Asset path escapes the repository root.");
  }
  return normalized;
}

export function sameRepoGithubPath(input, source) {
  try {
    const url = new URL(input, "https://github.com");
    const decodedPath = decodeURIComponent(url.pathname);
    if (url.hostname === "github.com") {
      for (const marker of ["blob", "raw"]) {
        const simplePrefix = `/${source.owner}/${source.repo}/${marker}/${source.ref}/`;
        const refsPrefix = `/${source.owner}/${source.repo}/${marker}/refs/heads/${source.ref}/`;
        if (decodedPath.startsWith(refsPrefix)) return decodedPath.slice(refsPrefix.length);
        if (decodedPath.startsWith(simplePrefix)) return decodedPath.slice(simplePrefix.length);
      }
    }
    if (url.hostname === "raw.githubusercontent.com") {
      const prefix = `/${source.owner}/${source.repo}/${source.ref}/`;
      if (decodedPath.startsWith(prefix)) return decodedPath.slice(prefix.length);
    }
  } catch {
    return null;
  }
  return null;
}
