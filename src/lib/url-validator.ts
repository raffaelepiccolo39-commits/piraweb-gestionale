/**
 * Validates that a URL is safe to fetch server-side.
 * Prevents SSRF by blocking internal/private network addresses.
 */
export function isUrlSafeToFetch(urlStr: string): boolean {
  try {
    const url = new URL(urlStr);

    // Only allow http and https
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return false;
    }

    const hostname = url.hostname.toLowerCase();

    // Block localhost
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '0.0.0.0') {
      return false;
    }

    // Block private/internal IP ranges
    const parts = hostname.split('.');
    if (parts.length === 4 && parts.every(p => /^\d+$/.test(p))) {
      const [a, b] = parts.map(Number);
      // 10.x.x.x
      if (a === 10) return false;
      // 172.16.0.0 - 172.31.255.255
      if (a === 172 && b >= 16 && b <= 31) return false;
      // 192.168.x.x
      if (a === 192 && b === 168) return false;
      // 169.254.x.x (link-local / cloud metadata)
      if (a === 169 && b === 254) return false;
      // 0.x.x.x
      if (a === 0) return false;
    }

    // Block .local, .internal, .corp domains
    if (hostname.endsWith('.local') || hostname.endsWith('.internal') || hostname.endsWith('.corp') || hostname.endsWith('.lan')) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Fetch a URL with SSRF protection and a timeout.
 * Returns null if the URL is not safe or the fetch fails.
 */
export async function safeFetch(
  urlStr: string,
  options?: RequestInit & { timeoutMs?: number },
): Promise<Response | null> {
  if (!isUrlSafeToFetch(urlStr)) {
    return null;
  }

  const timeoutMs = options?.timeoutMs ?? 10000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(urlStr, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
