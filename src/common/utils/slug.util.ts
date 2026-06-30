/**
 * Turn a display name into a URL-safe slug: lowercase, non-alphanumerics
 * collapsed to single hyphens, no leading/trailing hyphens.
 * e.g. "Gaming Consoles!" -> "gaming-consoles".
 */
export function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
