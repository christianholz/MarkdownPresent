export const EXAMPLE_MARKDOWN_STORAGE_KEY = "mdpresent:example-markdown";
export const EXAMPLE_ASSETS_STORAGE_KEY = "mdpresent:example-assets";

export function readExampleMarkdown(sample, storage = globalThis.localStorage) {
  try {
    return storage?.getItem(EXAMPLE_MARKDOWN_STORAGE_KEY) ?? sample;
  } catch {
    return sample;
  }
}

export function persistExampleMarkdown(markdown, sample, storage = globalThis.localStorage) {
  try {
    if (markdown === sample) storage?.removeItem(EXAMPLE_MARKDOWN_STORAGE_KEY);
    else storage?.setItem(EXAMPLE_MARKDOWN_STORAGE_KEY, markdown);
  } catch {
    // The editor remains usable when storage is unavailable or full.
  }
  return markdown !== sample;
}

export function readExampleAssets(storage = globalThis.localStorage) {
  try {
    const value = JSON.parse(storage?.getItem(EXAMPLE_ASSETS_STORAGE_KEY) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

export function persistExampleAssets(assets, storage = globalThis.localStorage) {
  try {
    if (assets?.length) storage?.setItem(EXAMPLE_ASSETS_STORAGE_KEY, JSON.stringify(assets));
    else storage?.removeItem(EXAMPLE_ASSETS_STORAGE_KEY);
  } catch {
    // The current deck and workspace download remain available if storage is full.
  }
}

export function resetExampleMarkdown(storage = globalThis.localStorage) {
  try {
    storage?.removeItem(EXAMPLE_MARKDOWN_STORAGE_KEY);
    storage?.removeItem(EXAMPLE_ASSETS_STORAGE_KEY);
  } catch {
    // Reset still restores the textarea for this session.
  }
}
