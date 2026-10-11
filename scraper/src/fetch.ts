import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { EnvHttpProxyAgent, fetch } from 'undici';

const CACHE_DIR = new URL('../.cache/', import.meta.url).pathname;
const USER_AGENT = 'MotoVisualBot/0.1 (+https://github.com/aethernite/motovisual)';

// Honours HTTPS_PROXY / NO_PROXY when set, connects directly otherwise.
const dispatcher = new EnvHttpProxyAgent();

export interface FetchOptions {
  /** Minimum delay between network requests, in ms. */
  delayMs?: number;
  /** Skip the on-disk cache and always hit the network. */
  refresh?: boolean;
}

export class HttpError extends Error {
  constructor(
    readonly url: string,
    readonly status: number,
  ) {
    super(`GET ${url} → HTTP ${status}`);
  }
}

let lastRequestAt = 0;

async function throttle(delayMs: number): Promise<void> {
  const wait = lastRequestAt + delayMs - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequestAt = Date.now();
}

function cachePath(url: string): string {
  return join(CACHE_DIR, createHash('sha1').update(url).digest('hex') + '.html');
}

/** Fetch a page as text, using a polite rate limit and an on-disk cache. */
export async function fetchPage(url: string, opts: FetchOptions = {}): Promise<string> {
  const { delayMs = 1000, refresh = false } = opts;
  const file = cachePath(url);
  if (!refresh) {
    try {
      return await readFile(file, 'utf8');
    } catch {
      // cache miss
    }
  }

  for (let attempt = 1; ; attempt++) {
    await throttle(delayMs);
    const res = await fetch(url, {
      dispatcher,
      headers: { 'user-agent': USER_AGENT, accept: 'text/html,application/xhtml+xml' },
    }).catch((err: Error & { cause?: Error }) => {
      // undici reports "fetch failed"; the useful detail is in `cause`.
      throw new Error(`GET ${url} failed: ${err.cause?.message ?? err.message}`);
    });
    if (res.ok) {
      const html = await res.text();
      await mkdir(CACHE_DIR, { recursive: true });
      await writeFile(file, html);
      return html;
    }
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt >= 4) throw new HttpError(url, res.status);
    await new Promise((r) => setTimeout(r, 2000 * 2 ** (attempt - 1)));
  }
}

/**
 * Minimal robots.txt check for the `*` user-agent group: returns false if any
 * Disallow prefix matches the URL path.
 */
export async function isAllowedByRobots(url: string): Promise<boolean> {
  const { origin, pathname } = new URL(url);
  let text: string;
  try {
    text = await fetchPage(`${origin}/robots.txt`, { delayMs: 0 });
  } catch (err) {
    if (err instanceof HttpError && err.status >= 400 && err.status < 500) return true; // no robots.txt → no restrictions
    throw err;
  }
  return robotsAllows(text, pathname);
}

export function robotsAllows(robotsTxt: string, path: string): boolean {
  let inStarGroup = false;
  const disallowed: string[] = [];
  for (const raw of robotsTxt.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    const m = line.match(/^([\w-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const [, key, value] = m;
    if (/^user-agent$/i.test(key)) inStarGroup = value.trim() === '*';
    else if (inStarGroup && /^disallow$/i.test(key) && value) disallowed.push(value.trim());
  }
  return !disallowed.some((prefix) => path.startsWith(prefix));
}
