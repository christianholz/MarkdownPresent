import { commandShortcut, githubPage, request, setBusy } from "./common.js";

const bookmarkButton = document.querySelector("#bookmark");
const currentTitle = document.querySelector("#current-title");
const currentPath = document.querySelector("#current-path");
const status = document.querySelector("#status");
let activeUrl = "";

function setStatus(message, error = false) {
  status.textContent = message;
  status.classList.toggle("error", error);
}

async function load() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  activeUrl = tab?.url || "";
  const page = githubPage(activeUrl);
  if (page) {
    currentTitle.textContent = `${page.owner}/${page.repo}`;
    currentPath.textContent = page.detail;
  } else {
    currentTitle.textContent = "Not a GitHub repository";
    currentPath.textContent = "Open a repository, folder, or file to bookmark it.";
    bookmarkButton.disabled = true;
  }

  const state = await request("state:get");
  const count = state.bookmarks.length;
  document.querySelector("#bookmark-count").textContent = `${count} ${count === 1 ? "folder" : "folders"} saved`;
  document.querySelector("#shortcut").textContent = await commandShortcut("find-recent-markdown");
}

bookmarkButton.addEventListener("click", async () => {
  setBusy(bookmarkButton, true, "Resolving folder…");
  setStatus("");
  try {
    const result = await request("bookmark:add", { url: activeUrl });
    setStatus(result.added ? `Saved ${result.bookmark.label}.` : `${result.bookmark.label} is already bookmarked.`);
    const state = await request("state:get");
    const count = state.bookmarks.length;
    document.querySelector("#bookmark-count").textContent = `${count} ${count === 1 ? "folder" : "folders"} saved`;
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    setBusy(bookmarkButton, false);
  }
});

document.querySelector("#find-recent").addEventListener("click", async () => {
  await request("picker:open");
  window.close();
});

document.querySelector("#manage").addEventListener("click", async () => {
  await request("manager:open");
  window.close();
});

load().catch((error) => setStatus(error.message, true));
