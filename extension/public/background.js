const BOOKMARKS_KEY = "mdpresent:github-folder-bookmarks";
const SETTINGS_KEY = "mdpresent:github-bookmark-settings";
const DEFAULT_SETTINGS = { days: 5, token: "" };
const MAX_COMMITS_PER_FOLDER = 30;
const MARKDOWN_PATTERN = /\.(?:md|markdown)$/i;

class GithubApiError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.status = status;
  }
}

function encodePath(path) {
  return String(path || "")
    .split("/")
    .filter(Boolean)
    .map(encodeURIComponent)
    .join("/");
}

function decodeParts(pathname) {
  try {
    return pathname.split("/").filter(Boolean).map(decodeURIComponent);
  } catch {
    return [];
  }
}

function githubLocation(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.hostname !== "github.com") return null;
  const parts = decodeParts(parsed.pathname);
  if (parts.length < 2 || parts[0].startsWith(".") || parts[1].startsWith(".")) return null;
  return {
    owner: parts[0],
    repo: parts[1].replace(/\.git$/i, ""),
    kind: ["tree", "blob"].includes(parts[2]) ? parts[2] : "repo",
    remainder: ["tree", "blob"].includes(parts[2]) ? parts.slice(3) : [],
  };
}

async function storedState() {
  const values = await chrome.storage.local.get([BOOKMARKS_KEY, SETTINGS_KEY]);
  return {
    bookmarks: Array.isArray(values[BOOKMARKS_KEY]) ? values[BOOKMARKS_KEY] : [],
    settings: { ...DEFAULT_SETTINGS, ...(values[SETTINGS_KEY] || {}) },
  };
}

async function api(path, token = "") {
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`https://api.github.com${path}`, { headers });
  if (!response.ok) {
    let detail = "";
    try {
      detail = (await response.json())?.message || "";
    } catch {
      detail = await response.text();
    }
    if (response.status === 401) throw new GithubApiError("GitHub rejected the saved access token.", response.status);
    if (response.status === 403 && /rate limit/i.test(detail)) {
      throw new GithubApiError("GitHub's API rate limit was reached. Add an access token in Manage bookmarks and try again.", response.status);
    }
    if (response.status === 404) {
      throw new GithubApiError("GitHub could not find this repository or ref. Private repositories require an access token.", response.status);
    }
    throw new GithubApiError(detail || `GitHub request failed (${response.status}).`, response.status);
  }
  return response.json();
}

function matchingRef(remainder, refs) {
  const joined = remainder.join("/");
  return refs
    .filter((ref) => joined === ref.name || joined.startsWith(`${ref.name}/`))
    .sort((left, right) => right.name.length - left.name.length)[0] || null;
}

async function resolveFolder(url, token = "") {
  const location = githubLocation(url);
  if (!location) throw new Error("Open a GitHub repository or folder first.");
  const repoInfo = await api(`/repos/${encodeURIComponent(location.owner)}/${encodeURIComponent(location.repo)}`, token);
  let ref = repoInfo.default_branch;
  let refType = "heads";
  let pathParts = [];

  if (location.kind !== "repo" && location.remainder.length) {
    const first = location.remainder[0];
    const refs = [{ name: repoInfo.default_branch, type: "heads" }];
    const prefix = encodePath(first);
    const requests = [
      api(`/repos/${encodeURIComponent(location.owner)}/${encodeURIComponent(location.repo)}/git/matching-refs/heads/${prefix}`, token),
      api(`/repos/${encodeURIComponent(location.owner)}/${encodeURIComponent(location.repo)}/git/matching-refs/tags/${prefix}`, token),
    ];
    const settled = await Promise.allSettled(requests);
    for (const [index, result] of settled.entries()) {
      if (result.status !== "fulfilled" || !Array.isArray(result.value)) continue;
      const type = index === 0 ? "heads" : "tags";
      refs.push(...result.value.map((entry) => ({
        name: String(entry.ref || "").replace(/^refs\/(?:heads|tags)\//, ""),
        type,
      })));
    }
    const match = matchingRef(location.remainder, refs);
    ref = match?.name || first;
    refType = match?.type || "heads";
    pathParts = location.remainder.slice(ref.split("/").length);
    if (location.kind === "blob") pathParts.pop();
  }

  const path = pathParts.join("/");
  const id = `${location.owner}/${location.repo}@${ref}:${path}`;
  return {
    id,
    owner: location.owner,
    repo: location.repo,
    ref,
    refType,
    path,
    label: path ? path.split("/").at(-1) : location.repo,
    url: `https://github.com/${encodeURIComponent(location.owner)}/${encodeURIComponent(location.repo)}/tree/${encodePath(ref)}${path ? `/${encodePath(path)}` : ""}`,
  };
}

async function addBookmark(url, label = "") {
  const state = await storedState();
  const folder = await resolveFolder(url, state.settings.token);
  const existing = state.bookmarks.find((bookmark) => bookmark.id === folder.id);
  if (existing) return { bookmark: existing, added: false };
  const bookmark = {
    ...folder,
    label: String(label || folder.label).trim() || folder.label,
    createdAt: new Date().toISOString(),
  };
  await chrome.storage.local.set({ [BOOKMARKS_KEY]: [...state.bookmarks, bookmark] });
  return { bookmark, added: true };
}

function isInsideFolder(filename, folder) {
  return !folder || filename === folder || filename.startsWith(`${folder}/`);
}

async function mapLimited(items, limit, operation) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next++;
      results[index] = await operation(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function scanFolder(bookmark, since, token) {
  const query = new URLSearchParams({
    sha: bookmark.ref,
    since: since.toISOString(),
    per_page: String(MAX_COMMITS_PER_FOLDER),
  });
  if (bookmark.path) query.set("path", bookmark.path);
  const base = `/repos/${encodeURIComponent(bookmark.owner)}/${encodeURIComponent(bookmark.repo)}`;
  const commits = await api(`${base}/commits?${query}`, token);
  const details = await mapLimited(commits, 4, (commit) => api(`${base}/commits/${encodeURIComponent(commit.sha)}?per_page=100`, token));
  const entries = [];
  for (const commit of details) {
    const changedAt = commit.commit?.committer?.date || commit.commit?.author?.date || "";
    for (const file of commit.files || []) {
      if (!MARKDOWN_PATTERN.test(file.filename) || !isInsideFolder(file.filename, bookmark.path)) continue;
      entries.push({
        id: `${bookmark.owner}/${bookmark.repo}@${bookmark.ref}:${file.filename}`,
        owner: bookmark.owner,
        repo: bookmark.repo,
        ref: bookmark.ref,
        refType: bookmark.refType || "heads",
        path: file.filename,
        folderId: bookmark.id,
        folderLabel: bookmark.label,
        changedAt,
        status: file.status,
        commitSha: commit.sha,
        commitUrl: commit.html_url,
        message: String(commit.commit?.message || "Updated Markdown").split("\n", 1)[0],
        author: commit.author?.login || commit.commit?.author?.name || "",
      });
    }
  }
  return { entries, capped: commits.length === MAX_COMMITS_PER_FOLDER };
}

async function scanRecent() {
  const { bookmarks, settings } = await storedState();
  const days = Math.min(30, Math.max(1, Number.parseInt(settings.days, 10) || DEFAULT_SETTINGS.days));
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const settled = await Promise.allSettled(bookmarks.map((bookmark) => scanFolder(bookmark, since, settings.token)));
  const newestByFile = new Map();
  const errors = [];
  const cappedFolders = [];
  settled.forEach((result, index) => {
    const bookmark = bookmarks[index];
    if (result.status === "rejected") {
      errors.push({ folderId: bookmark.id, label: bookmark.label, message: result.reason?.message || "Could not scan this folder." });
      return;
    }
    if (result.value.capped) cappedFolders.push(bookmark.label);
    for (const entry of result.value.entries) {
      const previous = newestByFile.get(entry.id);
      if (!previous || entry.changedAt > previous.changedAt) newestByFile.set(entry.id, entry);
    }
  });
  return {
    days,
    entries: [...newestByFile.values()].sort((left, right) => right.changedAt.localeCompare(left.changedAt)),
    errors,
    cappedFolders,
  };
}

let pickerWindowId = null;

async function openPicker() {
  if (pickerWindowId !== null) {
    try {
      await chrome.windows.update(pickerWindowId, { focused: true });
      return;
    } catch {
      pickerWindowId = null;
    }
  }
  const created = await chrome.windows.create({
    url: chrome.runtime.getURL("bookmarks/picker.html"),
    type: "popup",
    focused: true,
    width: 780,
    height: 640,
  });
  pickerWindowId = created.id ?? null;
}

function presenterUrl(entry) {
  const base = `https://github.com/${encodeURIComponent(entry.owner)}/${encodeURIComponent(entry.repo)}/blob/${encodePath(entry.ref)}/${encodePath(entry.path)}`;
  const hash = new URLSearchParams({
    "mdpresent-slide": "1",
    "mdpresent-ref": entry.ref,
    "mdpresent-ref-type": entry.refType || "heads",
    "mdpresent-path": entry.path,
  });
  return `${base}#${hash}`;
}

chrome.windows.onRemoved.addListener((windowId) => {
  if (windowId === pickerWindowId) pickerWindowId = null;
});

chrome.commands.onCommand.addListener((command) => {
  if (command === "find-recent-markdown") openPicker();
  if (command === "present-current-markdown") {
    chrome.tabs.query({ active: true, currentWindow: true })
      .then(([tab]) => Number.isInteger(tab?.id)
        ? chrome.tabs.sendMessage(tab.id, { type: "mdpresent:present-current" })
        : null)
      .catch(() => {});
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const respond = async () => {
    switch (message?.type) {
      case "mdpresent:asset":
        if (!Number.isInteger(message.sourceTabId)) throw new Error("The source GitHub tab is unavailable.");
        return chrome.tabs.sendMessage(message.sourceTabId, {
          type: "mdpresent:fetch-asset",
          source: message.source,
          path: message.path,
        });
      case "mdpresent:open": {
        const senderUrl = sender.tab?.url || "";
        if (!senderUrl.startsWith("https://github.com/")) throw new Error("Unexpected source page.");
        const sourceId = crypto.randomUUID();
        const storageKey = `mdpresent:${sourceId}`;
        const payload = { ...message.payload, sourceTabId: sender.tab.id };
        await chrome.storage.local.set({ [storageKey]: payload });
        await chrome.tabs.create({ url: chrome.runtime.getURL(`present.html#source=${sourceId}`) });
        return { ok: true };
      }
      case "state:get":
        return storedState();
      case "bookmark:add":
        return addBookmark(message.url, message.label);
      case "bookmark:remove": {
        const state = await storedState();
        await chrome.storage.local.set({ [BOOKMARKS_KEY]: state.bookmarks.filter((bookmark) => bookmark.id !== message.id) });
        return { ok: true };
      }
      case "bookmark:rename": {
        const state = await storedState();
        const bookmarks = state.bookmarks.map((bookmark) => bookmark.id === message.id
          ? { ...bookmark, label: String(message.label || "").trim() || bookmark.label }
          : bookmark);
        await chrome.storage.local.set({ [BOOKMARKS_KEY]: bookmarks });
        return { ok: true };
      }
      case "settings:save": {
        const state = await storedState();
        const settings = {
          days: Math.min(30, Math.max(1, Number.parseInt(message.days, 10) || DEFAULT_SETTINGS.days)),
          token: typeof message.token === "string" ? message.token.trim() : state.settings.token,
        };
        await chrome.storage.local.set({ [SETTINGS_KEY]: settings });
        return { settings };
      }
      case "scan:recent":
        return scanRecent();
      case "picker:open":
        await openPicker();
        return { ok: true };
      case "manager:open":
        await chrome.runtime.openOptionsPage();
        return { ok: true };
      case "present:open":
        await chrome.tabs.create({ url: presenterUrl(message.entry) });
        return { ok: true };
      default:
        throw new Error("Unknown extension request.");
    }
  };

  respond()
    .then((result) => sendResponse({ ok: true, ...result }))
    .catch((error) => sendResponse({ ok: false, error: error.message || "The request failed." }));
  return true;
});
