import { resolveRepoPath, sameRepoGithubPath } from "./paths.js";

class RequestQueue {
  constructor(limit = 6) { this.limit = limit; this.active = 0; this.pending = []; }
  run(fn) {
    return new Promise((resolve, reject) => {
      this.pending.push({ fn, resolve, reject });
      this.next();
    });
  }
  next() {
    while (this.active < this.limit && this.pending.length) {
      const job = this.pending.shift();
      this.active += 1;
      Promise.resolve().then(job.fn).then(job.resolve, job.reject).finally(() => {
        this.active -= 1;
        this.next();
      });
    }
  }
}

export class AssetManager {
  constructor(repository, source, concurrency = 6) {
    this.repository = repository;
    this.source = source;
    this.cache = new Map();
    this.urls = new Set();
    this.queue = new RequestQueue(concurrency);
  }

  resolve(input) {
    if (!input) throw new Error("Image has no source path.");
    if (/^data:/i.test(input)) return { kind: "data", url: input };
    const githubPath = this.source?.owner ? sameRepoGithubPath(input, this.source) : null;
    if (githubPath) return { kind: "repo", path: githubPath };
    if (/^https?:/i.test(input)) return { kind: "external", url: input };
    const path = resolveRepoPath(this.source?.path || this.repository.documentFile?.webkitRelativePath || this.repository.documentFile?.name || "slides.md", input);
    return { kind: "repo", path };
  }

  async getUrl(input) {
    const resolved = this.resolve(input);
    if (resolved.kind === "data") return resolved.url;
    if (resolved.kind === "external") return resolved.url;
    if (this.cache.has(resolved.path)) return this.cache.get(resolved.path);
    const promise = this.queue.run(async () => {
      const blob = await this.repository.readBlob(resolved.path);
      const url = URL.createObjectURL(blob);
      this.urls.add(url);
      return url;
    });
    this.cache.set(resolved.path, promise);
    return promise;
  }

  dispose() {
    for (const url of this.urls) URL.revokeObjectURL(url);
    this.urls.clear();
    this.cache.clear();
  }
}
