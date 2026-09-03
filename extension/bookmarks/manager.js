import { bookmarkLocation, commandShortcut, request, setBusy } from "./common.js";

const list = document.querySelector("#bookmark-list");
const empty = document.querySelector("#empty");
const template = document.querySelector("#bookmark-template");
const addStatus = document.querySelector("#add-status");
const settingsStatus = document.querySelector("#settings-status");
let bookmarks = [];

function status(element, message, error = false) {
  element.textContent = message;
  element.classList.toggle("error", error);
}

async function renameBookmark(bookmark, input) {
  const label = input.value.trim();
  if (!label || label === bookmark.label) {
    input.value = bookmark.label;
    return;
  }
  try {
    await request("bookmark:rename", { id: bookmark.id, label });
    bookmark.label = label;
  } catch (error) {
    input.value = bookmark.label;
    status(addStatus, error.message, true);
  }
}

function render() {
  list.replaceChildren();
  document.querySelector("#folder-count").textContent = bookmarks.length;
  empty.hidden = bookmarks.length > 0;
  for (const bookmark of bookmarks) {
    const row = template.content.firstElementChild.cloneNode(true);
    const label = row.querySelector(".bookmark-label");
    const location = row.querySelector(".bookmark-location");
    label.value = bookmark.label;
    location.textContent = bookmarkLocation(bookmark);
    location.href = bookmark.url;
    row.querySelector(".bookmark-ref").textContent = bookmark.ref;
    label.addEventListener("change", () => renameBookmark(bookmark, label));
    label.addEventListener("keydown", (event) => {
      if (event.key === "Enter") label.blur();
      if (event.key === "Escape") {
        label.value = bookmark.label;
        label.blur();
      }
    });
    row.querySelector(".open-folder").addEventListener("click", () => chrome.tabs.create({ url: bookmark.url }));
    row.querySelector(".remove-folder").addEventListener("click", async () => {
      await request("bookmark:remove", { id: bookmark.id });
      bookmarks = bookmarks.filter((entry) => entry.id !== bookmark.id);
      render();
    });
    list.append(row);
  }
}

async function load() {
  const state = await request("state:get");
  bookmarks = state.bookmarks;
  document.querySelector("#days").value = state.settings.days;
  document.querySelector("#token").value = state.settings.token;
  document.querySelector("#shortcut").textContent = await commandShortcut("find-recent-markdown");
  render();
}

document.querySelector("#add-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = document.querySelector("#add-folder");
  const input = document.querySelector("#folder-url");
  setBusy(button, true, "Resolving…");
  status(addStatus, "");
  try {
    const result = await request("bookmark:add", { url: input.value });
    if (result.added) bookmarks.push(result.bookmark);
    render();
    status(addStatus, result.added ? `Saved ${result.bookmark.label}.` : `${result.bookmark.label} is already bookmarked.`);
    if (result.added) input.value = "";
  } catch (error) {
    status(addStatus, error.message, true);
  } finally {
    setBusy(button, false);
  }
});

document.querySelector("#settings-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = event.submitter;
  setBusy(button, true, "Saving…");
  status(settingsStatus, "");
  try {
    const response = await request("settings:save", {
      days: document.querySelector("#days").value,
      token: document.querySelector("#token").value,
    });
    document.querySelector("#days").value = response.settings.days;
    status(settingsStatus, "Saved.");
  } catch (error) {
    status(settingsStatus, error.message, true);
  } finally {
    setBusy(button, false);
  }
});

document.querySelector("#find-recent").addEventListener("click", () => request("picker:open"));

load().catch((error) => status(addStatus, error.message, true));
