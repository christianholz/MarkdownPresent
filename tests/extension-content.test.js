import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const contentScript = readFileSync(new URL("../extension/public/content.js", import.meta.url), "utf8");

function assetResponse(pathname, hash, source) {
  let onMessage;
  runInNewContext(contentScript, {
    URLSearchParams,
    location: { pathname, hash },
    document: {
      documentElement: {},
      querySelector: () => null,
      addEventListener: () => {},
    },
    window: { addEventListener: () => {} },
    MutationObserver: class { observe() {} },
    chrome: { runtime: { onMessage: { addListener: (listener) => { onMessage = listener; } } } },
    fetch: async () => ({ ok: true, blob: async () => ({ type: "image/png" }) }),
    FileReader: class {
      addEventListener(type, listener) { if (type === "load") this.onLoad = listener; }
      readAsDataURL() { this.result = "data:image/png;base64,YXNzZXQ="; this.onLoad(); }
    },
  });
  return new Promise((resolve) => {
    onMessage({ type: "mdpresent:fetch-asset", source, path: "image.png" }, {}, resolve);
  });
}

function sourceFromEmbeddedPage(pathname, route) {
  const context = {
    URLSearchParams,
    location: { pathname, hash: "" },
    document: {
      documentElement: {},
      querySelector: (selector) => selector === 'script[data-target="react-app.embeddedData"]'
        ? { textContent: JSON.stringify({ payload: { codeViewBlobLayoutRoute: route } }) }
        : null,
      addEventListener: () => {},
    },
    window: { addEventListener: () => {} },
    MutationObserver: class { observe() {} },
    chrome: { runtime: { onMessage: { addListener() {} } } },
  };
  runInNewContext(
    contentScript.replace(/\}\)\(\);\s*$/, "globalThis.__sourceFromPage = sourceFromPage;})();"),
    context,
  );
  return context.__sourceFromPage();
}

describe("GitHub content source", () => {
  it("reads a slash-containing branch and file path from GitHub page data", () => {
    const source = sourceFromEmbeddedPage(
      "/owner/repo/blob/feature/slides/docs/demo.md",
      { refInfo: { name: "feature/slides", refType: "branch" }, path: "docs/demo.md" },
    );
    expect(source).toEqual({ owner: "owner", repo: "repo", ref: "feature/slides", refType: "heads", path: "docs/demo.md" });
  });

  it("rejects page data that does not match the visible GitHub path", () => {
    expect(sourceFromEmbeddedPage(
      "/owner/repo/blob/main/real.md",
      { refInfo: { name: "main", refType: "branch" }, path: "other.md" },
    )).toBeNull();
  });

  it("ignores a fragment that names a different file", async () => {
    const response = await assetResponse(
      "/owner/repo/blob/main/real.md",
      "#mdpresent-ref=other&mdpresent-path=other.md",
      { owner: "owner", repo: "repo", ref: "other", path: "other.md" },
    );
    expect(response.ok).toBe(false);
  });

  it("accepts a matching fragment to identify a ref containing slashes", async () => {
    const response = await assetResponse(
      "/owner/repo/blob/feature/slides/real.md",
      "#mdpresent-ref=feature%2Fslides&mdpresent-path=real.md",
      { owner: "owner", repo: "repo", ref: "feature/slides", path: "real.md" },
    );
    expect(response).toEqual({ ok: true, type: "image/png", data: "YXNzZXQ=" });
  });

  it("accepts GitHub's explicit refs path form", async () => {
    const response = await assetResponse(
      "/owner/repo/blob/refs/tags/v1/real.md",
      "#mdpresent-ref=v1&mdpresent-ref-type=tags&mdpresent-path=real.md",
      { owner: "owner", repo: "repo", ref: "v1", refType: "tags", path: "real.md" },
    );
    expect(response).toEqual({ ok: true, type: "image/png", data: "YXNzZXQ=" });
  });
});
