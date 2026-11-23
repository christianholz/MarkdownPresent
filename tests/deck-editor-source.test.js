import { describe, expect, it } from "vitest";
import { editableSection, hasEmbeddedImageData, markdownInsertion, needsSourceEditor, replaceEditableSection } from "../src/deck-editor-source.js";

describe("slide editor source mapping", () => {
  it("replaces only the active slide and remaps later comment offsets", () => {
    const markdown = "---\ntheme: plain\n---\n\n# Intro\n\nWelcome\n\n---\n\n## Results\n\nOld text\n\n## Next\n\nLater";
    const section = editableSection(markdown, { sourceStart: markdown.indexOf("## Results") });
    const later = markdown.indexOf("Later");
    const result = replaceEditableSection(markdown, section, "## Results\n\nNew longer text", {
      comments: [{ id: "a", sourceOffset: later }],
    });
    expect(result.markdown).toBe(markdown.replace("## Results\n\nOld text", "## Results\n\nNew longer text"));
    expect(result.annotationState.comments[0].sourceOffset).toBe(result.markdown.indexOf("Later"));
  });

  it("keeps presentation specific syntax in source mode", () => {
    expect(needsSourceEditor("## Agenda\n\n<!-- TOC -->")).toBe(true);
    expect(needsSourceEditor("| ::2 Group | Value |\n| A | B |\n")).toBe(true);
    expect(needsSourceEditor("## Table\n\n| A | B |\n|---|---|\n| 1 | 2 |\n")).toBe(false);
  });

  it("rejects image data while allowing URL and file references", () => {
    expect(hasEmbeddedImageData("![x](data:image/png;base64,AAAA)")).toBe(true);
    expect(hasEmbeddedImageData("![x][id]\n\n[id]: data:image/png;base64,AAAA")).toBe(true);
    expect(hasEmbeddedImageData('<img src="blob:https://example.com/abc">')).toBe(true);
    expect(hasEmbeddedImageData("![x](https://example.com/x.png)\n![y](./assets/y.png)")).toBe(false);
  });

  it("formats the selection and separates block inserts from surrounding text", () => {
    expect(markdownInsertion("bold", "Before ", "selected", " after")).toBe("**selected**");
    expect(markdownInsertion("task", "Before\n", "First\nSecond", "\nAfter"))
      .toBe("\n- [ ] First\n- [ ] Second\n");
    expect(markdownInsertion("table", "Before", "", "After")).toMatch(/^\n\n\| .*\n\| --- \| --- \|\n.*\n\n$/);
    expect(markdownInsertion("image", "", "", "", { alt: "Chart", reference: "./assets/chart.png" }))
      .toBe("![Chart](./assets/chart.png)");
  });
});
