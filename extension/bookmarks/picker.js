import { bookmarkLocation, formatDate, request } from "./common.js";

const filter = document.querySelector("#filter");
const results = document.querySelector("#results");
const loading = document.querySelector("#loading");
const empty = document.querySelector("#empty");
const template = document.querySelector("#result-template");
let allEntries = [];
let visibleEntries = [];
let activeIndex = 0;
let opening = false;

function filename(path) {
  return path.split("/").at(-1) || path;
}

function locationLabel(entry) {
  const directory = entry.path.split("/").slice(0, -1).join("/");
  return `${entry.owner}/${entry.repo}${directory ? ` / ${directory}` : ""} · ${entry.folderLabel}`;
}

function rowAt(index) {
  return results.querySelector(`[data-index="${index}"]`);
}

function select(index, scroll = true) {
  if (!visibleEntries.length) return;
  const next = Math.max(0, Math.min(index, visibleEntries.length - 1));
  rowAt(activeIndex)?.classList.remove("active");
  rowAt(activeIndex)?.setAttribute("aria-selected", "false");
  activeIndex = next;
  const row = rowAt(activeIndex);
  row?.classList.add("active");
  row?.setAttribute("aria-selected", "true");
  if (scroll) row?.scrollIntoView({ block: "nearest" });
}

async function openEntry(entry = visibleEntries[activeIndex]) {
  if (!entry || opening) return;
  opening = true;
  try {
    await request("present:open", { entry });
    window.close();
  } catch {
    opening = false;
  }
}

function render() {
  const query = filter.value.trim().toLocaleLowerCase();
  visibleEntries = allEntries.filter((entry) => [
    entry.path,
    entry.owner,
    entry.repo,
    entry.folderLabel,
    entry.message,
    entry.author,
  ].some((value) => String(value || "").toLocaleLowerCase().includes(query)));
  activeIndex = 0;
  results.replaceChildren();

  for (const [index, entry] of visibleEntries.entries()) {
    const row = template.content.firstElementChild.cloneNode(true);
    row.dataset.index = index;
    row.querySelector(".result-title").textContent = filename(entry.path);
    row.querySelector(".result-location").textContent = locationLabel(entry);
    row.querySelector(".result-message").textContent = entry.author ? `${entry.message} — ${entry.author}` : entry.message;
    row.querySelector("time").textContent = formatDate(entry.changedAt);
    row.querySelector("time").dateTime = entry.changedAt;
    row.querySelector(".result-status").textContent = entry.status;
    row.addEventListener("mouseenter", () => select(index, false));
    row.addEventListener("click", () => openEntry(entry));
    results.append(row);
  }

  const hasResults = visibleEntries.length > 0;
  results.hidden = !hasResults;
  empty.hidden = hasResults;
  if (!hasResults && query) {
    document.querySelector("#empty-title").textContent = "No matching Markdown";
    document.querySelector("#empty-copy").textContent = "Try a different search.";
  } else if (!hasResults) {
    document.querySelector("#empty-title").textContent = "No recent Markdown found";
    document.querySelector("#empty-copy").textContent = "Try a longer search window or add another folder.";
  }
  document.querySelector("#result-count").textContent = `${visibleEntries.length} ${visibleEntries.length === 1 ? "file" : "files"}`;
  select(0, false);
}

function showWarnings(scan) {
  const details = document.querySelector("#warnings");
  const list = document.querySelector("#warning-list");
  list.replaceChildren();
  for (const error of scan.errors) {
    const item = document.createElement("li");
    item.textContent = `${error.label}: ${error.message}`;
    list.append(item);
  }
  if (scan.cappedFolders.length) {
    const item = document.createElement("li");
    item.textContent = `${scan.cappedFolders.join(", ")}: only the newest 30 commits were checked.`;
    list.append(item);
  }
  details.hidden = !list.children.length;
}

async function load() {
  const state = await request("state:get");
  if (!state.bookmarks.length) {
    loading.hidden = true;
    empty.hidden = false;
    document.querySelector("#scope").textContent = "No folders bookmarked";
    document.querySelector("#empty-title").textContent = "Add a GitHub folder first";
    document.querySelector("#empty-copy").textContent = "Use the extension button on GitHub, or open the bookmark manager.";
    filter.disabled = true;
    return;
  }
  document.querySelector("#scope").textContent = `Searching ${state.bookmarks.length} ${state.bookmarks.length === 1 ? "folder" : "folders"} from the last ${state.settings.days} days`;
  const scan = await request("scan:recent");
  allEntries = scan.entries;
  loading.hidden = true;
  document.querySelector("#scope").textContent = `${state.bookmarks.length} ${state.bookmarks.length === 1 ? "folder" : "folders"} · last ${scan.days} days`;
  showWarnings(scan);
  render();
}

filter.addEventListener("input", render);
document.addEventListener("keydown", (event) => {
  if (event.key === "ArrowDown") {
    event.preventDefault();
    select(activeIndex + 1);
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    select(activeIndex - 1);
  } else if (event.key === "Home") {
    event.preventDefault();
    select(0);
  } else if (event.key === "End") {
    event.preventDefault();
    select(visibleEntries.length - 1);
  } else if (event.key === "PageDown") {
    event.preventDefault();
    select(activeIndex + 6);
  } else if (event.key === "PageUp") {
    event.preventDefault();
    select(activeIndex - 6);
  } else if (event.key === "Enter") {
    event.preventDefault();
    openEntry();
  } else if (event.key === "Escape") {
    if (filter.value) {
      filter.value = "";
      render();
    } else {
      window.close();
    }
  }
});

const openManager = async () => {
  await request("manager:open");
  window.close();
};
document.querySelector("#manage").addEventListener("click", openManager);
document.querySelector("#empty-manage").addEventListener("click", openManager);

filter.focus();
load().catch((error) => {
  loading.hidden = true;
  empty.hidden = false;
  document.querySelector("#empty-title").textContent = "Search failed";
  document.querySelector("#empty-copy").textContent = error.message;
});
