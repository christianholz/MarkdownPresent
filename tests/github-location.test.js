import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

let resolveLocation;
let refs;

beforeAll(async () => {
  const listener = { addListener() {} };
  vi.stubGlobal("chrome", {
    windows: { onRemoved: listener },
    commands: { onCommand: listener },
    runtime: { onMessage: listener },
  });
  ({ resolveLocation } = await import("../extension/public/background.js"));
});

beforeEach(() => {
  refs = { heads: [], tags: [] };
  vi.stubGlobal("fetch", vi.fn(async (url) => {
    const path = new URL(url).pathname;
    let result;
    if (path === "/repos/owner/repo") result = { default_branch: "main" };
    else if (path.includes("/git/matching-refs/heads/")) result = refs.heads;
    else if (path.includes("/git/matching-refs/tags/")) result = refs.tags;
    else throw new Error(`Unexpected GitHub request: ${path}`);
    return { ok: true, json: async () => result };
  }));
});

describe("GitHub location resolution", () => {
  it("chooses the longest matching branch for a direct Markdown URL", async () => {
    refs.heads = [
      { ref: "refs/heads/feature" },
      { ref: "refs/heads/feature/slides" },
    ];
    await expect(resolveLocation(
      "https://github.com/owner/repo/blob/feature/slides/talks/demo.md",
      "", { file: true, requireRef: true },
    )).resolves.toEqual({ owner: "owner", repo: "repo", ref: "feature/slides", refType: "heads", path: "talks/demo.md" });
  });

  it("resolves an explicit tag URL", async () => {
    refs.tags = [{ ref: "refs/tags/v1" }];
    await expect(resolveLocation(
      "https://github.com/owner/repo/blob/refs/tags/v1/docs/demo.md",
      "", { file: true, requireRef: true },
    )).resolves.toEqual({ owner: "owner", repo: "repo", ref: "v1", refType: "tags", path: "docs/demo.md" });
  });

  it("rejects an unresolved ref instead of guessing a save target", async () => {
    await expect(resolveLocation(
      "https://github.com/owner/repo/blob/missing/demo.md",
      "", { file: true, requireRef: true },
    )).rejects.toThrow(/could not be resolved/);
  });
});
