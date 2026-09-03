export async function request(type, details = {}) {
  const response = await chrome.runtime.sendMessage({ type, ...details });
  if (!response?.ok) throw new Error(response?.error || "The extension request failed.");
  return response;
}

export function githubPage(url) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== "github.com") return null;
    const parts = parsed.pathname.split("/").filter(Boolean).map(decodeURIComponent);
    if (parts.length < 2) return null;
    const owner = parts[0];
    const repo = parts[1].replace(/\.git$/i, "");
    if (!owner || !repo) return null;
    if (parts[2] === "tree") {
      return { owner, repo, detail: parts.slice(4).join("/") || "Repository root" };
    }
    if (parts[2] === "blob") {
      const path = parts.slice(4, -1).join("/");
      return { owner, repo, detail: path || "Repository root" };
    }
    return { owner, repo, detail: "Repository root" };
  } catch {
    return null;
  }
}

export function bookmarkLocation(bookmark) {
  return `${bookmark.owner}/${bookmark.repo}${bookmark.path ? ` / ${bookmark.path}` : ""}`;
}

export function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const elapsed = Date.now() - date.getTime();
  const hours = Math.floor(elapsed / 3_600_000);
  if (hours < 1) return "just now";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
}

export async function commandShortcut(commandName) {
  const commands = await chrome.commands.getAll();
  return commands.find((command) => command.name === commandName)?.shortcut || "Set shortcut";
}

export function setBusy(button, busy, label = "Working…") {
  if (!button.dataset.label) button.dataset.label = button.textContent;
  button.disabled = busy;
  button.textContent = busy ? label : button.dataset.label;
}
