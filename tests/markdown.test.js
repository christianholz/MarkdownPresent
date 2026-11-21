import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { extractFrontMatter, extractUnsupportedMediaReferences, splitSlides } from "../src/markdown.js";
import { resolveRepoPath, sameRepoGithubPath } from "../src/paths.js";
import { fittedImageStackWidth, SLIDE_SPACING_GLUE, spacingGlueValue } from "../src/layout.js";
import { slideOutlineLabel } from "../src/slide-outline.js";
import { AssetManager } from "../src/assets.js";
import { AnnotationManager, annotatedMarkdown, changeStatusText, commentsMarkdown, hasEditableListContent, markdownInsertionOffset, remapCommentOffsets, replaceMarkdownFragment, replaceMarkdownRange } from "../src/annotations.js";
import { draftWithoutAssetData, extensionDraftKey, extensionDraftRecord, restorableExtensionDraft } from "../src/drafts.js";
import { clearStoredExampleAssets, EXAMPLE_ASSETS_STORAGE_KEY, EXAMPLE_MARKDOWN_STORAGE_KEY, persistExampleMarkdown, readExampleMarkdown, resetExampleMarkdown } from "../src/example-storage.js";
import { Presentation, continuationContextText, continuationListBreakPenalty, continuationTitleText } from "../src/presentation.js";
import { insertImageUrlIntoSlide, normalizeImageUrl, preferredImageFolder, WorkingRepository } from "../src/asset-workspace.js";

describe("Markdown slide parsing", () => {
  it("covers all nine layouts in the example deck", () => {
    const fixture = readFileSync(new URL("../examples/layout-test/test-presentation.md", import.meta.url), "utf8");
    expect(splitSlides(fixture)).toHaveLength(9);
    expect(fixture.match(/!\[[^\]]*\]\([^)]*\)/g)).toHaveLength(21);
  });

  it("parses the two additional example presentations", () => {
    const research = readFileSync(new URL("../examples/layout-test/research-planning.md", import.meta.url), "utf8");
    const visual = readFileSync(new URL("../examples/layout-test/visual-review.md", import.meta.url), "utf8");
    expect(splitSlides(research)).toHaveLength(6);
    expect(research.match(/!\[[^\]]*\]\([^)]*\)/g)).toHaveLength(4);
    expect(splitSlides(visual)).toHaveLength(9);
    expect(visual.match(/!\[[^\]]*\]\([^)]*\)/g)).toHaveLength(11);
  });

  it("does not treat front matter as a slide", () => {
    const markdown = "---\ntitle: Test\n---\n# One\n\n---\n\n# Two";
    expect(extractFrontMatter(markdown).body).toContain("# One");
    expect(splitSlides(markdown)).toHaveLength(2);
  });

  it("prefers explicit slide comments", () => {
    expect(splitSlides("# A\n\n<!-- slide -->\n\n# B")).toEqual(["# A", "# B"]);
  });

  it("uses H1 for the opening slide and starts slides at H2", () => {
    expect(splitSlides("# A\n\nSubtitle\n\n## Topic\n\n### Detail\n\nText")).toEqual([
      "# A\n\nSubtitle",
      "## Topic\n\n### Detail\n\nText",
    ]);
  });

  it("creates another title slide for every later H1", () => {
    expect(splitSlides("# Part one\n\nIntro\n\n## Detail\n\nText\n\n# Part two\n\nNew section")).toEqual([
      "# Part one\n\nIntro",
      "## Detail\n\nText",
      "# Part two\n\nNew section",
    ]);
  });

  it("does not duplicate explicit and H2 boundaries", () => {
    expect(splitSlides("# A\n\nText\n\n---\n\n## B\n\nText\n\n<!-- slide -->\n\n## C\n\n### Still C")).toEqual([
      "# A\n\nText",
      "## B\n\nText",
      "## C\n\n### Still C",
    ]);
  });

  it("does not split headings or rules inside fenced code", () => {
    expect(splitSlides("# Demo\n\n```md\n## not a slide\n---\n```\n\n## Real slide")).toHaveLength(2);
  });

  it("keeps shorter fence markers and indented code inside their slides", () => {
    const source = "# Demo\n\n````md\n```\n## still code\n---\n````\n\n    ---\n\n## Real slide";
    expect(splitSlides(source)).toHaveLength(2);
    expect(splitSlides(source)[0]).toContain("## still code");
  });

  it("flags embedded media types the slide renderer cannot display", () => {
    const markdown = '<video controls src="media/demo.mp4"></video>\n<audio src="audio/clip.ogg"></audio>';
    expect(extractUnsupportedMediaReferences(markdown)).toEqual(["media/demo.mp4", "audio/clip.ogg"]);
  });
});

describe("example Markdown persistence", () => {
  function memoryStorage() {
    const values = new Map();
    return {
      getItem: (key) => values.has(key) ? values.get(key) : null,
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key),
      values,
    };
  }

  it("restores edited example Markdown and removes the override at the default", () => {
    const storage = memoryStorage();
    expect(readExampleMarkdown("# Default", storage)).toBe("# Default");
    expect(persistExampleMarkdown("# Edited", "# Default", storage)).toBe(true);
    expect(readExampleMarkdown("# Default", storage)).toBe("# Edited");
    expect(persistExampleMarkdown("# Default", "# Default", storage)).toBe(false);
    expect(storage.values.has(EXAMPLE_MARKDOWN_STORAGE_KEY)).toBe(false);
  });

  it("clears a saved override when the example is reset", () => {
    const storage = memoryStorage();
    persistExampleMarkdown("# Edited", "# Default", storage);
    resetExampleMarkdown(storage);
    expect(readExampleMarkdown("# Default", storage)).toBe("# Default");
  });

  it("clears previously stored image bytes without removing the text draft", () => {
    const storage = memoryStorage();
    persistExampleMarkdown("# Edited", "# Default", storage);
    storage.setItem(EXAMPLE_ASSETS_STORAGE_KEY, '[{"path":"assets/image.png","data":"aW1hZ2U="}]');
    clearStoredExampleAssets(storage);
    expect(storage.values.has(EXAMPLE_ASSETS_STORAGE_KEY)).toBe(false);
    expect(readExampleMarkdown("# Default", storage)).toBe("# Edited");
  });
});

describe("extension draft recovery", () => {
  it("uses the complete GitHub source identity for its storage key", () => {
    expect(extensionDraftKey({ owner: "example org", repo: "deck", ref: "feature/slides", path: "talks/demo.md" }))
      .toBe("mdpresent:draft:example%20org:deck:feature%2Fslides:talks%2Fdemo.md");
  });

  it("restores a draft only when it belongs to the current source content", () => {
    const state = {
      markdown: "# Edited",
      originalSourceMarkdown: "# Original",
      comments: [{ id: "comment-1", text: "Review this" }],
      revision: 2,
      savedRevision: 1,
      editCount: 1,
    };
    const record = extensionDraftRecord("# Original", state, 123);

    expect(record).toEqual({
      version: 1,
      baseMarkdown: "# Original",
      markdown: "# Edited",
      annotationState: {
        comments: state.comments,
        revision: 2,
        savedRevision: 1,
        editCount: 1,
        originalSourceMarkdown: "# Original",
      },
      updatedAt: 123,
    });
    expect(restorableExtensionDraft(record, "# Original")).toBe(record);
    expect(restorableExtensionDraft(record, "# Changed upstream")).toBeNull();
    expect(restorableExtensionDraft({ ...record, version: 2 }, "# Original")).toBeNull();
  });

  it("stores only paths for images added during an editing session", () => {
    const state = {
      markdown: "# Edited\n\n![Chart](./assets/chart.png)",
      originalSourceMarkdown: "# Original",
      comments: [], revision: 1, savedRevision: 0, editCount: 1,
    };
    const record = extensionDraftRecord("# Original", state, 123, ["slides/assets/chart.png"]);
    expect(record.localAssetPaths).toEqual(["slides/assets/chart.png"]);
    expect(record).not.toHaveProperty("assets");
    expect(restorableExtensionDraft(record, "# Original")).toBe(record);
  });

  it("removes image bytes from an older saved draft while preserving its text", () => {
    const old = { version: 1, markdown: "# Edited", localAssetPaths: ["assets/one.png"], assets: [
      { path: "assets/one.png", data: "b25l" },
      { path: "assets/two.png", data: "dHdv" },
    ] };
    expect(draftWithoutAssetData(old)).toEqual({
      version: 1, markdown: "# Edited", localAssetPaths: ["assets/one.png", "assets/two.png"],
    });
    expect(old.assets).toHaveLength(2);
  });
});

describe("repository paths", () => {
  it("resolves relative and repository-root assets", () => {
    expect(resolveRepoPath("_projects/2026/talk.md", "../../assets/a.png")).toBe("assets/a.png");
    expect(resolveRepoPath("_projects/2026/talk.md", "/assets/a.png")).toBe("assets/a.png");
  });

  it("rejects paths that climb above the repository root", () => {
    expect(() => resolveRepoPath("slides.md", "../outside.png")).toThrow(/escapes the repository root/);
    expect(() => resolveRepoPath("talks/slides.md", "%2e%2e/%2e%2e/outside.png")).toThrow(/escapes the repository root/);
    expect(resolveRepoPath("talks/slides.md", "../shared.png")).toBe("shared.png");
  });

  it("recognizes same-repository GitHub blob and raw image URLs", () => {
    const source = { owner: "eth-siplab-team", repo: "deck", ref: "main" };
    expect(sameRepoGithubPath("https://github.com/eth-siplab-team/deck/blob/main/images/a.png", source)).toBe("images/a.png");
    expect(sameRepoGithubPath("/eth-siplab-team/deck/raw/refs/heads/main/images/a.png", source)).toBe("images/a.png");
    expect(sameRepoGithubPath("https://github.com/eth-siplab-team/deck/raw/refs/tags/v1/images/a.png", { ...source, ref: "v1", refType: "tags" })).toBe("images/a.png");
    expect(sameRepoGithubPath("https://github.com/eth-siplab-team/deck/blob/main/images/100%25.png", source)).toBe("images/100%.png");
  });

  it("allows externally hosted images for standalone decks", () => {
    const manager = new AssetManager({ documentFile: { name: "slides.md" } }, { path: "slides.md" });
    expect(manager.resolve("https://example.com/image.png")).toEqual({
      kind: "external",
      url: "https://example.com/image.png",
    });
  });

  it("retries an asset after a transient repository failure", async () => {
    let attempts = 0;
    const manager = new AssetManager({
      documentFile: { name: "slides.md" },
      async readBlob() {
        attempts += 1;
        if (attempts === 1) throw new Error("Temporary failure");
        return new Blob(["image"], { type: "image/png" });
      },
    }, { path: "slides.md" });
    await expect(manager.getUrl("image.png")).rejects.toThrow("Temporary failure");
    await expect(manager.getUrl("image.png")).resolves.toMatch(/^blob:/);
    expect(attempts).toBe(2);
    manager.dispose();
  });
});

describe("image stack fitting", () => {
  it("keeps an ordinary single-image column at its half-slide width", () => {
    expect(fittedImageStackWidth(500, 400, [16 / 9], 20)).toBe(500);
  });

  it("gives every stacked image a common width that fits the available height", () => {
    expect(fittedImageStackWidth(500, 400, [1, 2, 0.5], 10)).toBeCloseTo(108.3, 1);
  });

  it("does not enlarge a short image stack beyond the half-slide column", () => {
    expect(fittedImageStackWidth(500, 700, [2, 2], 20)).toBe(500);
  });
});

describe("elastic slide spacing", () => {
  it("keeps the structural title gap fixed so media aligns across continuation slides", () => {
    expect(SLIDE_SPACING_GLUE).not.toHaveProperty("--slide-title-after");
  });

  it("interpolates from minimum through preferred to maximum glue", () => {
    const glue = SLIDE_SPACING_GLUE["--slide-h3-before"];
    expect(spacingGlueValue(glue, 0)).toBe(1);
    expect(spacingGlueValue(glue, 1)).toBe(1.6);
    expect(spacingGlueValue(glue, 2)).toBe(1.9);
    expect(spacingGlueValue(glue, 0.5)).toBe(1.3);
    expect(spacingGlueValue(glue, 1.5)).toBeCloseTo(1.75);
  });

  it("clamps spacing factors outside the supported range", () => {
    const glue = SLIDE_SPACING_GLUE["--slide-list-item-gap"];
    expect(spacingGlueValue(glue, -1)).toBe(glue.min);
    expect(spacingGlueValue(glue, 3)).toBe(glue.max);
  });
});

describe("slide outline labels", () => {
  it("uses headings and supplies a readable fallback for untitled slides", () => {
    expect(slideOutlineLabel({ title: { textContent: "  Results  " } }, 2)).toBe("Results");
    expect(slideOutlineLabel({ title: null }, 3)).toBe("Slide 4");
  });
});

describe("automatic continuation slides", () => {
  it("adds the page number and total to repeated section titles", () => {
    expect(continuationTitleText("Findings", 2, 3)).toBe("Findings (2/3)");
    expect(continuationContextText("Evidence")).toBe("Evidence (cont'd)");
  });

  it("penalizes list widows and two-item fragments", () => {
    const cleanBreak = continuationListBreakPenalty(3, 2);
    expect(continuationListBreakPenalty(3, 1)).toBeGreaterThan(cleanBreak);
    expect(continuationListBreakPenalty(2, 2)).toBeGreaterThan(cleanBreak);
    expect(continuationListBreakPenalty(1, 2)).toBe(cleanBreak);
  });
});

describe("slide assets", () => {
  it("uses the most common existing image subfolder beside the Markdown file", () => {
    const source = { owner: "owner", repo: "repo", ref: "main", path: "talks/slides.md" };
    expect(preferredImageFolder(source, [
      "./figures/one.png", "figures/two.jpg", "./assets/logo.png", "https://example.com/external/image.png",
    ])).toBe("figures");
    expect(preferredImageFolder(source, ["../shared/chart.png"])).toBe("../shared");
    expect(preferredImageFolder(source, ["logo.png"])).toBe(".");
    expect(preferredImageFolder(source, ["https://example.com/images/one.png"])).toBe("assets");
    expect(preferredImageFolder(source, ["https://github.com/owner/repo/blob/main/talks/plots/chart.png"]))
      .toBe("plots");
  });

  it("stages an extension image in the Markdown file's assets folder", async () => {
    const image = Object.assign(new Blob(["image"], { type: "image/png" }), { name: "My chart.png" });
    const repository = new WorkingRepository({ documentFile: null, hasBlob: async () => false }, { path: "talks/slides.md" });
    const asset = await repository.addFile(image);
    expect(asset).toEqual({ reference: "./assets/My-chart.png", path: "talks/assets/My-chart.png", alt: "My chart" });
    expect(await repository.readBlob(asset.path)).toBe(image);
    expect(await repository.serializedAssets()).toEqual([{
      path: "talks/assets/My-chart.png", type: "image/png", data: btoa("image"),
    }]);
  });

  it("avoids replacing an existing GitHub image with the same filename", async () => {
    const image = Object.assign(new Blob(["new"], { type: "image/png" }), { name: "chart.png" });
    const repository = new WorkingRepository({
      documentFile: null,
      hasBlob: async (path) => path === "talks/figures/chart.png",
    }, { path: "talks/slides.md" });
    expect(await repository.addFile(image, ["./figures/old.png"])).toMatchObject({
      path: "talks/figures/chart-2.png", reference: "./figures/chart-2.png",
    });
  });

  it("places a new image beside the Markdown when existing images are there", async () => {
    const image = Object.assign(new Blob(["new"], { type: "image/png" }), { name: "new.png" });
    const repository = new WorkingRepository({ documentFile: null, hasBlob: async () => false }, { path: "talks/slides.md" });
    expect(await repository.addFile(image, ["./old.png"])).toMatchObject({
      path: "talks/new.png", reference: "./new.png",
    });
    expect(await repository.addFile(image, ["../shared/old.png"])).toMatchObject({
      path: "shared/new.png", reference: "../shared/new.png",
    });
  });

  it("does not include an image removed from the Markdown in a GitHub save", async () => {
    const repository = new WorkingRepository({ documentFile: null }, { path: "slides.md" });
    repository.assets.set("assets/used.png", new Blob(["used"], { type: "image/png" }));
    repository.assets.set("assets/removed.png", new Blob(["removed"], { type: "image/png" }));
    const assets = await repository.serializedAssets(new Set(["assets/used.png"]));
    expect(assets).toEqual([{ path: "assets/used.png", type: "image/png", data: btoa("used") }]);
  });

  it("retries an image when a previous load failed", async () => {
    let image = null;
    let failures = 0;
    let attempts = 0;
    const slot = {
      dataset: { imageSrc: "image.png", imageAlt: "Figure" },
      querySelector: () => image,
      replaceChildren: (loadedImage) => { image = loadedImage; },
      classList: { add: () => { failures += 1; }, remove: () => {} },
      textContent: "",
    };
    const slide = {
      element: { classList: { contains: () => false }, querySelectorAll: () => [slot] },
      diagramsLoaded: true,
      assetsLoaded: false,
    };
    const presentation = {
      slides: [slide], index: 0, fitCurrent: () => {},
      assetManager: {
        async getUrl() {
          attempts += 1;
          if (attempts === 1) throw new Error("Temporary failure");
          return "blob:ready";
        },
      },
    };
    vi.stubGlobal("document", { createElement: () => ({ decode: async () => {}, setAttribute: () => {} }) });
    try {
      await Presentation.prototype.loadAssets.call(presentation, 0);
      expect(slide.assetsLoaded).toBe(false);
      expect(failures).toBe(1);
      await Presentation.prototype.loadAssets.call(presentation, 0);
      expect(slide.assetsLoaded).toBe(true);
      expect(image.src).toBe("blob:ready");
      expect(attempts).toBe(2);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("image URL insertion", () => {
  it("inserts an HTTPS URL as Markdown without image data", () => {
    const markdown = "# Title\n\nText";
    const result = insertImageUrlIntoSlide(markdown, { sourceEnd: markdown.length }, "https://example.com/my-chart.png?size=2");
    expect(result.markdown).toBe("# Title\n\nText\n\n![my chart](<https://example.com/my-chart.png?size=2>)");
    expect(result.annotationState.editCount).toBe(1);
  });

  it("rejects inline image data and insecure URLs", () => {
    expect(() => normalizeImageUrl("data:image/png;base64,AAAA")).toThrow(/HTTPS image URL/);
    expect(() => normalizeImageUrl("http://example.com/image.png")).toThrow(/HTTPS image URL/);
    expect(() => normalizeImageUrl("https://user:pass@example.com/image.png")).toThrow(/HTTPS image URL/);
  });
});

describe("Markdown-backed editing", () => {
  it("replaces the canonical section rather than rendered HTML", () => {
    const source = "# Deck\n\n## Findings\n\n- One\n- Two\n\n## Next\n\nDone";
    const fragment = "## Findings\n\n- One\n- Two";
    expect(replaceMarkdownFragment(source, fragment, "## Revised findings\n\n- One").markdown).toBe(
      "# Deck\n\n## Revised findings\n\n- One\n\n## Next\n\nDone",
    );
  });

  it("patches a single rendered element by its source range", () => {
    const source = "## Findings\n\n- One\n- Two";
    expect(replaceMarkdownRange(source, 3, 11, "Results")).toBe("## Results\n\n- One\n- Two");
    expect(() => replaceMarkdownRange(source, -1, 4, "Nope")).toThrow(/no longer matches/i);
  });

  it("keeps comment anchors when edited text moves or is deleted", () => {
    const comments = [
      { id: "before", sourceOffset: 8 },
      { id: "inside", sourceOffset: 13 },
      { id: "after", sourceOffset: 20 },
    ];
    expect(remapCommentOffsets(comments, 10, 16, "abcdef", "aZf")).toEqual([
      { id: "before", sourceOffset: 8 },
      { id: "inside", sourceOffset: 11 },
      { id: "after", sourceOffset: 17 },
    ]);
  });

  it("treats browser placeholders as empty list items", () => {
    expect(hasEditableListContent("")).toBe(false);
    expect(hasEditableListContent("<br>")).toBe(false);
    expect(hasEditableListContent("<br /> <br>")).toBe(false);
    expect(hasEditableListContent("**Still here**")).toBe(true);
  });

  it("retains comments when their complete list item is removed", () => {
    const comments = [
      { id: "inside", sourceOffset: 4, anchorText: "One", anchorOccurrence: 0 },
      { id: "after", sourceOffset: 10, anchorText: "Two", anchorOccurrence: 0 },
    ];
    expect(remapCommentOffsets(comments, 0, 6, "- One\n", "")).toEqual([
      { id: "inside", sourceOffset: 0, anchorText: "", anchorOccurrence: 0 },
      { id: "after", sourceOffset: 4, anchorText: "Two", anchorOccurrence: 0 },
    ]);
  });
});

describe("presentation comments", () => {
  it("shows a draft save failure and clears it after a successful retry", async () => {
    const manager = {
      stateChangePromise: Promise.resolve(),
      stateSaveError: false,
      sourceMarkdown: "# Edited",
      originalSourceMarkdown: "# Original",
      comments: [],
      revision: 0,
      savedRevision: 0,
      editCount: 1,
      dirty: true,
      syncUnsavedIndicator: vi.fn(),
      onStateChange: async () => { throw new Error("Storage full"); },
    };
    AnnotationManager.prototype.notifyStateChange.call(manager);
    await manager.stateChangePromise;
    expect(manager.stateSaveError).toBe(true);
    manager.onStateChange = async () => {};
    AnnotationManager.prototype.notifyStateChange.call(manager);
    await manager.stateChangePromise;
    expect(manager.stateSaveError).toBe(false);
    expect(manager.syncUnsavedIndicator).toHaveBeenCalledTimes(2);
  });

  it("summarizes Markdown edits and added comments in one status", () => {
    expect(changeStatusText(true, 1, 0)).toBe("Markdown modified (1 edit)");
    expect(changeStatusText(true, 3, 2)).toBe("Markdown modified (3 edits) • 2 comments added");
    expect(changeStatusText(false, 0, 1)).toBe("1 comment added");
  });

  it("places annotations after whole formatted constructs and punctuation", () => {
    expect(markdownInsertionOffset("A **two word phrase**, then more.", "two word phrase", 0)).toBe(22);
    expect(markdownInsertionOffset("Visit [the project](https://example.com).", "the project", 0)).toBe(41);
  });

  it("exports annotations at their recorded source positions", () => {
    expect(annotatedMarkdown("One. Two.", [
      { date: "2026-08-12", text: "  Revisit -- this  ", sourceOffset: 4 },
    ])).toBe("One. <!-- 2026-08-12: Revisit — this --> Two.");
  });

  it("exports a comments-only Markdown document", () => {
    expect(commentsMarkdown("Quarterly review", [
      { date: "2026-08-12", text: "Clarify this result" },
      { date: "2026-08-13", text: "Add the comparison" },
    ])).toBe("# Quarterly review comments\n\n2026-08-12: Clarify this result\n\n2026-08-13: Add the comparison\n");
  });
});
