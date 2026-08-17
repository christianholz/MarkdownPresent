import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { extractFrontMatter, extractUnsupportedMediaReferences, preprocessJekyll, splitSlides } from "../src/markdown.js";
import { resolveRepoPath, sameRepoGithubPath } from "../src/paths.js";
import { fittedImageStackWidth } from "../src/layout.js";
import { slideOutlineLabel } from "../src/slide-outline.js";
import { AssetManager } from "../src/assets.js";
import { annotatedMarkdown, commentsMarkdown, markdownInsertionOffset, remapCommentOffsets, replaceMarkdownFragment, replaceMarkdownRange } from "../src/annotations.js";
import { continuationContextText, continuationListBreakPenalty, continuationTitleText } from "../src/presentation.js";

describe("Markdown slide parsing", () => {
  it("covers all seven layouts in the example deck", () => {
    const fixture = readFileSync(new URL("../examples/layout-test/test-presentation.md", import.meta.url), "utf8");
    expect(splitSlides(fixture)).toHaveLength(7);
    expect(fixture.match(/!\[[^\]]*\]\([^)]*\)/g)).toHaveLength(18);
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

  it("preprocesses common Jekyll references", () => {
    expect(preprocessJekyll("{{ site.baseurl }}/x {% link assets/y.png %}" )).toBe("/x assets/y.png");
  });

  it("flags embedded media types the slide renderer cannot display", () => {
    const markdown = '<video controls src="media/demo.mp4"></video>\n<audio src="audio/clip.ogg"></audio>';
    expect(extractUnsupportedMediaReferences(markdown)).toEqual(["media/demo.mp4", "audio/clip.ogg"]);
  });
});

describe("repository paths", () => {
  it("resolves relative and repository-root assets", () => {
    expect(resolveRepoPath("_projects/2026/talk.md", "../../assets/a.png")).toBe("assets/a.png");
    expect(resolveRepoPath("_projects/2026/talk.md", "/assets/a.png")).toBe("assets/a.png");
  });

  it("recognizes same-repository GitHub blob and raw image URLs", () => {
    const source = { owner: "eth-siplab-team", repo: "deck", ref: "main" };
    expect(sameRepoGithubPath("https://github.com/eth-siplab-team/deck/blob/main/images/a.png", source)).toBe("images/a.png");
    expect(sameRepoGithubPath("/eth-siplab-team/deck/raw/refs/heads/main/images/a.png", source)).toBe("images/a.png");
  });

  it("allows externally hosted images for standalone decks", () => {
    const manager = new AssetManager({ documentFile: { name: "slides.md" } }, { path: "slides.md" });
    expect(manager.resolve("https://example.com/image.png")).toEqual({
      kind: "external",
      url: "https://example.com/image.png",
    });
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
});

describe("presentation comments", () => {
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
