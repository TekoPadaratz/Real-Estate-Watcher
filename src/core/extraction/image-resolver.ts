export function absolutizeUrl(baseUrl: string, input?: string | null): string | null {
  if (!input) {
    return null;
  }

  try {
    return new URL(input, baseUrl).toString();
  } catch {
    return null;
  }
}

export function resolveImageUrls(baseUrl: string, urls: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const resolved: string[] = [];

  for (const url of urls) {
    const absolute = absolutizeUrl(baseUrl, url);
    if (!absolute || seen.has(absolute)) {
      continue;
    }

    seen.add(absolute);
    resolved.push(absolute);
  }

  return resolved;
}
