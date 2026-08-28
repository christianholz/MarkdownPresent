export const EXAMPLE_MARKDOWN_STORAGE_KEY = "mdpresent:example-markdown";

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

export function resetExampleMarkdown(storage = globalThis.localStorage) {
  try {
    storage?.removeItem(EXAMPLE_MARKDOWN_STORAGE_KEY);
  } catch {
    // Reset still restores the textarea for this session.
  }
}
