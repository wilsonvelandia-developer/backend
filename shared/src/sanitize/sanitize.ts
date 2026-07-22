/**
 * HTML sanitization utility for user-generated text fields.
 *
 * Strips all HTML tags from input to prevent XSS in stored content.
 * For fields that intentionally support limited formatting (bold, italic),
 * use sanitizeWithAllowlist instead.
 *
 * This is a defense-in-depth measure — the frontend should also sanitize on render,
 * but we never trust client input.
 */

/** Regex matching any HTML/XML tag (opening, closing, self-closing). */
const HTML_TAG_REGEX = /<\/?[a-z][^>]*>/gi;

/** Regex matching common script injection vectors in attributes. */
const EVENT_HANDLER_REGEX = /\bon\w+\s*=\s*["'][^"']*["']/gi;

/** Regex matching javascript: protocol in URLs. */
const JS_PROTOCOL_REGEX = /javascript\s*:/gi;

/**
 * Strips all HTML tags from the input string.
 * Use for fields like chat messages, observation notes, and announcement titles.
 *
 * @param input - Raw user input
 * @returns Clean text without HTML tags
 */
export function stripHtml(input: string): string {
  if (!input) return input;
  return input
    .replace(HTML_TAG_REGEX, '')
    .replace(EVENT_HANDLER_REGEX, '')
    .replace(JS_PROTOCOL_REGEX, '')
    .trim();
}

/**
 * Sanitizes text allowing only a restricted set of safe inline HTML tags.
 * Strips all attributes except href on <a> tags (and removes javascript: hrefs).
 * Use for fields like announcement content that may allow basic formatting.
 *
 * Allowed tags: b, i, em, strong, u, br, p, ul, ol, li, a
 */
export function sanitizeHtml(input: string): string {
  if (!input) return input;

  const ALLOWED_TAGS = new Set(['b', 'i', 'em', 'strong', 'u', 'br', 'p', 'ul', 'ol', 'li', 'a']);

  // Remove event handlers and javascript: protocols first
  let cleaned = input
    .replace(EVENT_HANDLER_REGEX, '')
    .replace(JS_PROTOCOL_REGEX, '');

  // Strip tags not in allowlist
  cleaned = cleaned.replace(/<\/?([a-z][a-z0-9]*)\b[^>]*>/gi, (match, tagName: string) => {
    const tag = tagName.toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) return '';

    // For allowed tags, strip all attributes except href on <a>
    if (tag === 'a') {
      const hrefMatch = match.match(/href\s*=\s*["']([^"']+)["']/i);
      if (hrefMatch && !JS_PROTOCOL_REGEX.test(hrefMatch[1])) {
        // Rebuild <a> with only href, add rel="noopener noreferrer" for security
        if (match.startsWith('</')) return '</a>';
        return `<a href="${hrefMatch[1]}" rel="noopener noreferrer">`;
      }
      // No valid href or javascript: protocol — strip the tag
      if (match.startsWith('</')) return '</a>';
      return '<a>';
    }

    // For other allowed tags, strip all attributes
    if (match.startsWith('</')) return `</${tag}>`;
    return `<${tag}>`;
  });

  return cleaned.trim();
}
