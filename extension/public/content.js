(() => {
  const BUTTON_ATTRIBUTE = "data-meeting-present";

  function sourceFromLocation() {
    const parts = location.pathname.split("/").filter(Boolean).map(decodeURIComponent);
    if (parts.length < 5 || parts[0] !== "eth-siplab-team" || !["blob", "tree"].includes(parts[2])) return null;
    const [owner, repo, , ref, ...pathParts] = parts;
    const path = pathParts.join("/");
    if (!/\.(md|markdown)$/i.test(path)) return null;
    return { owner, repo, ref, path };
  }

  async function sourcePayload(rawButton, source) {
    const renderedArticle = document.querySelector("article.markdown-body")?.cloneNode(true);
    renderedArticle?.querySelectorAll("markdown-accessiblity-table").forEach((table) => table.remove());
    const renderedHtml = renderedArticle?.outerHTML || "";
    try {
      const response = await fetch(rawButton.href, { credentials: "same-origin", headers: { Accept: "text/plain" } });
      if (!response.ok) throw new Error(`Raw returned ${response.status}`);
      const markdown = await response.text();
      if (!markdown.trim()) throw new Error("Raw returned an empty file");
      return { source, markdown, renderedHtml: "" };
    } catch (error) {
      if (!renderedHtml) throw new Error(`Could not read Raw Markdown and no rendered fallback was found: ${error.message}`);
      return { source, markdown: "", renderedHtml };
    }
  }

  function encodePath(path) {
    return path.split("/").filter(Boolean).map(encodeURIComponent).join("/");
  }

  function githubAssetUrl(path, source) {
    const renderedPrefix = `${source.owner}/${source.repo}/raw/`;
    if (path.startsWith(renderedPrefix)) return `https://github.com/${encodePath(path)}`;
    return `https://github.com/${encodeURIComponent(source.owner)}/${encodeURIComponent(source.repo)}/raw/refs/heads/${encodeURIComponent(source.ref)}/${encodePath(path)}`;
  }

  function blobAsBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.addEventListener("load", () => resolve(String(reader.result).split(",", 2)[1] || ""));
      reader.addEventListener("error", () => reject(reader.error || new Error("Could not read the image response.")));
      reader.readAsDataURL(blob);
    });
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "meeting-present:fetch-asset") return false;
    const current = sourceFromLocation();
    const requested = message.source;
    if (!current || !requested || current.owner !== requested.owner || current.repo !== requested.repo || current.ref !== requested.ref) {
      sendResponse({ ok: false, error: "The source GitHub tab is no longer showing this presentation." });
      return false;
    }
    const path = String(message.path || "");
    if (!path || path.split("/").includes("..")) {
      sendResponse({ ok: false, error: "Invalid repository image path." });
      return false;
    }
    fetch(githubAssetUrl(path, requested), { credentials: "same-origin" })
      .then((response) => {
        if (!response.ok) throw new Error(`GitHub image request failed (${response.status}).`);
        return response.blob();
      })
      .then(async (blob) => ({ ok: true, type: blob.type || "application/octet-stream", data: await blobAsBase64(blob) }))
      .then(sendResponse)
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  });

  function createButton(rawButton, source) {
    const wrapper = document.createElement("div");
    wrapper.className = "meeting-present-item";
    wrapper.setAttribute(BUTTON_ATTRIBUTE, "");

    const button = rawButton.cloneNode(true);
    button.removeAttribute("href");
    button.removeAttribute("id");
    button.removeAttribute("data-testid");
    button.removeAttribute("aria-describedby");
    button.setAttribute("role", "button");
    [...button.classList]
      .filter((className) => className.startsWith("BlobViewHeader-module__LinkButton__"))
      .forEach((className) => button.classList.remove(className));
    button.classList.add("meeting-present-button");
    button.title = "Present this Markdown file";
    button.setAttribute("aria-label", "Present this Markdown file");

    const content = button.querySelector('[data-component="buttonContent"]') || button;
    const label = button.querySelector('[data-component="text"]') || document.createElement("span");
    label.textContent = "Present";
    const icon = document.createElement("span");
    icon.className = "meeting-present-icon";
    icon.setAttribute("data-component", "leadingVisual");
    icon.setAttribute("aria-hidden", "true");
    content.prepend(icon);

    button.addEventListener("click", async (event) => {
      event.preventDefault();
      if (button.getAttribute("aria-disabled") === "true") return;
      button.setAttribute("aria-disabled", "true");
      try {
        const payload = await sourcePayload(rawButton, source);
        const result = await chrome.runtime.sendMessage({ type: "meeting-present:open", payload });
        if (!result?.ok) throw new Error(result?.error || "The presentation tab could not open.");
      } catch (error) {
        button.title = error.message;
        console.error("Meeting Present:", error);
      } finally {
        button.removeAttribute("aria-disabled");
      }
    });

    wrapper.append(button);
    return wrapper;
  }

  function inject() {
    const source = sourceFromLocation();
    if (!source) return;
    const rawButton = document.querySelector('a[data-testid="raw-button"]');
    if (!rawButton) return;
    const group = rawButton.closest('[data-component="ButtonGroup"]') || rawButton.parentElement;
    const actions = rawButton.closest(".react-blob-header-edit-and-raw-actions") || group?.parentElement;
    if (!group || !actions || actions.querySelector(`[${BUTTON_ATTRIBUTE}]`)) return;
    actions.insertBefore(createButton(rawButton, source), group);
  }

  let queued = false;
  const queueInjection = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      inject();
    });
  };

  new MutationObserver(queueInjection).observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener("turbo:load", queueInjection);
  window.addEventListener("popstate", queueInjection);
  inject();
})();
