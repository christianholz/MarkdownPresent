import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash, webcrypto } from "node:crypto";
import { writeDeckToGitHub } from "../src/github-writeback.js";

const source = { owner: "owner", repo: "repo", ref: "main", path: "slides.md" };
const asset = { path: "assets/image.png", data: btoa("image") };

function response(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

function mockGitHub(assetSha) {
  const requests = [];
  vi.stubGlobal("crypto", webcrypto);
  vi.stubGlobal("fetch", vi.fn(async (url, options = {}) => {
    const path = new URL(url).pathname;
    const method = options.method || "GET";
    requests.push({ path, method, body: options.body });
    if (path.endsWith("/git/ref/heads/main") && method === "GET") return response({ object: { sha: "head" } });
    if (path.endsWith("/contents/slides.md")) return response({ type: "file", content: btoa("# Original") });
    if (path.endsWith("/contents/assets/image.png")) {
      return assetSha === null ? response({ message: "Not Found" }, 404) : response({ type: "file", sha: assetSha });
    }
    if (path.endsWith("/git/commits/head")) return response({ tree: { sha: "old-tree" } });
    if (path.endsWith("/git/blobs")) return response({ sha: "markdown-blob" });
    if (path.endsWith("/git/trees")) return response({ sha: "new-tree" });
    if (path.endsWith("/git/commits") && method === "POST") return response({ sha: "new-commit" });
    if (path.endsWith("/git/refs/heads/main") && method === "PATCH") return response({});
    throw new Error(`Unexpected request: ${method} ${path}`);
  }));
  return requests;
}

afterEach(() => vi.unstubAllGlobals());

describe("GitHub write-back", () => {
  it("rejects a conflicting remote image before creating a commit", async () => {
    const requests = mockGitHub("different-sha");
    await expect(writeDeckToGitHub({
      source, token: "token", baseMarkdown: "# Original", markdown: "# Edited", assets: [asset],
    })).rejects.toThrow(/different content/);
    expect(requests.every(({ method }) => method === "GET")).toBe(true);
  });

  it("reuses an image already saved with identical content", async () => {
    const assetSha = createHash("sha1").update("blob 5\0image").digest("hex");
    const requests = mockGitHub(assetSha);
    await expect(writeDeckToGitHub({
      source, token: "token", baseMarkdown: "# Original", markdown: "# Edited", assets: [asset],
    })).resolves.toMatchObject({ commitSha: "new-commit" });
    expect(requests.filter(({ path }) => path.endsWith("/git/blobs"))).toHaveLength(1);
    const tree = requests.find(({ path }) => path.endsWith("/git/trees"));
    expect(JSON.parse(tree.body).tree.map(({ path }) => path)).toEqual(["slides.md"]);
  });

  it("adds a new image to the commit", async () => {
    const requests = mockGitHub(null);
    await writeDeckToGitHub({
      source, token: "token", baseMarkdown: "# Original", markdown: "# Edited", assets: [asset],
    });
    expect(requests.filter(({ path }) => path.endsWith("/git/blobs"))).toHaveLength(2);
    const tree = requests.find(({ path }) => path.endsWith("/git/trees"));
    expect(JSON.parse(tree.body).tree.map(({ path }) => path)).toEqual(["slides.md", "assets/image.png"]);
  });
});
