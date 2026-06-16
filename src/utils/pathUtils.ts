/**
 * Normalize a file path for consistent pattern matching:
 * - Trims whitespace
 * - Removes leading `./`
 * - Converts backslashes to forward slashes
 */
export function normalizePath(path: string): string {
  return path.trim().replace(/^\.\//, "").replace(/\\/g, "/");
}

function fixedPrefix(pattern: string): string {
  const normalized = normalizePath(pattern);
  const wildcardIndex = normalized.search(/[*?[\]{}]/);
  if (wildcardIndex === -1) return normalized;
  const prefix = normalized.slice(0, wildcardIndex);
  const lastSlash = prefix.lastIndexOf("/");
  return lastSlash === -1 ? "" : prefix.slice(0, lastSlash + 1);
}

/**
 * Check whether a file path matches an allowed/forbidden path pattern.
 *
 * Supports:
 * - Exact match
 * - Directory prefix (dir/)
 * - Recursive glob (dir/**)
 * - Single-level glob (dir/*)
 * - Wildcards with fixed prefix (src/**)
 */
export function pathMatchesPattern(path: string, pattern: string): boolean {
  const normalizedPath = normalizePath(path);
  const normalizedPattern = normalizePath(pattern);

  if (!normalizedPath || !normalizedPattern) return false;
  if (normalizedPattern === "**" || normalizedPath === normalizedPattern) return true;
  if (normalizedPattern.endsWith("/")) return normalizedPath.startsWith(normalizedPattern);
  if (normalizedPattern.endsWith("/**")) {
    return normalizedPath.startsWith(normalizedPattern.slice(0, -2));
  }
  if (normalizedPattern.endsWith("/*")) {
    const prefix = normalizedPattern.slice(0, -1);
    return normalizedPath.startsWith(prefix) && !normalizedPath.slice(prefix.length).includes("/");
  }
  if (normalizedPattern.includes("*") || normalizedPattern.includes("?")) {
    const prefix = fixedPrefix(normalizedPattern);
    return prefix ? normalizedPath.startsWith(prefix) : true;
  }

  return false;
}
