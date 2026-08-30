const API_ROOT = "https://api.github.com";

function encodePath(path) {
  return String(path || "").split("/").filter(Boolean).map(encodeURIComponent).join("/");
}

function utf8Base64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

function decodeBase64Text(value) {
  const binary = atob(String(value || "").replace(/\s/g, ""));
  return new TextDecoder().decode(Uint8Array.from(binary, (character) => character.charCodeAt(0)));
}

async function api(path, token, options = {}) {
  const response = await fetch(`${API_ROOT}${path}`, {
    ...options,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(options.headers || {}),
    },
  });
  const body = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(body?.message || `GitHub returned ${response.status}.`);
    error.status = response.status;
    throw error;
  }
  return body;
}

async function createBlob(source, token, content) {
  const result = await api(`/repos/${encodeURIComponent(source.owner)}/${encodeURIComponent(source.repo)}/git/blobs`, token, {
    method: "POST",
    body: JSON.stringify({ content, encoding: "base64" }),
  });
  return result.sha;
}

export async function writeDeckToGitHub({ source, token, baseMarkdown, markdown, assets = [], message }) {
  if (!source?.owner || !source?.repo || !source?.ref || !source?.path) throw new Error("The GitHub source is incomplete.");
  if (!token) throw new Error("A GitHub access token is required.");
  const repository = `/repos/${encodeURIComponent(source.owner)}/${encodeURIComponent(source.repo)}`;
  let branch;
  try {
    branch = await api(`${repository}/git/ref/heads/${encodePath(source.ref)}`, token);
  } catch (error) {
    if (error.status === 404) throw new Error("Write-back requires a branch URL; tags and commit URLs are read-only.");
    throw error;
  }
  const headSha = branch.object.sha;
  const remoteFile = await api(`${repository}/contents/${encodePath(source.path)}?ref=${encodeURIComponent(source.ref)}`, token);
  if (remoteFile.type !== "file" || decodeBase64Text(remoteFile.content) !== baseMarkdown) {
    throw new Error("The Markdown changed on GitHub after this deck was opened. Reload it before saving, so those changes are not overwritten.");
  }

  const headCommit = await api(`${repository}/git/commits/${headSha}`, token);
  const markdownBlob = await createBlob(source, token, utf8Base64(markdown));
  const tree = [{ path: source.path, mode: "100644", type: "blob", sha: markdownBlob }];
  for (const asset of assets) {
    if (!asset?.path || !asset?.data) continue;
    tree.push({
      path: asset.path,
      mode: "100644",
      type: "blob",
      sha: await createBlob(source, token, asset.data),
    });
  }
  const nextTree = await api(`${repository}/git/trees`, token, {
    method: "POST",
    body: JSON.stringify({ base_tree: headCommit.tree.sha, tree }),
  });
  const commit = await api(`${repository}/git/commits`, token, {
    method: "POST",
    body: JSON.stringify({
      message: message || `Update ${source.path.split("/").pop()} from MarkdownPresent`,
      tree: nextTree.sha,
      parents: [headSha],
    }),
  });
  await api(`${repository}/git/refs/heads/${encodePath(source.ref)}`, token, {
    method: "PATCH",
    body: JSON.stringify({ sha: commit.sha, force: false }),
  });
  return { commitSha: commit.sha, url: `https://github.com/${source.owner}/${source.repo}/commit/${commit.sha}` };
}

export function requestGitHubToken(deck, storedToken = "") {
  return new Promise((resolve) => {
    const dialog = document.createElement("form");
    dialog.className = "github-token-dialog";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-label", "Connect GitHub write-back");
    dialog.innerHTML = `
      <strong>Save directly to GitHub</strong>
      <p>Use a fine-grained token with read/write access to repository contents. It is stored only in this extension.</p>
      <label>Personal access token<input type="password" autocomplete="off" required /></label>
      <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener noreferrer">Create a fine-grained token</a>
      <div><button type="button" data-action="cancel">Cancel</button><button type="submit">Connect and save</button></div>`;
    const input = dialog.querySelector("input");
    input.value = storedToken;
    const finish = (value) => { dialog.remove(); resolve(value); };
    dialog.querySelector('[data-action="cancel"]').addEventListener("click", () => finish(null));
    dialog.addEventListener("submit", (event) => {
      event.preventDefault();
      const token = input.value.trim();
      if (token) finish(token);
    });
    dialog.addEventListener("keydown", (event) => { if (event.key === "Escape") finish(null); });
    deck.append(dialog);
    input.focus({ preventScroll: true });
  });
}
