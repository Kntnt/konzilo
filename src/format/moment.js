// A moment as a content file and a source file write it: to the second, in UTC, so that two
// moments compare as their texts do.

// A moment as a file writes it, or null for what is none. A moment with no zone is read as UTC,
// since a server's zone must make no difference.
export function momentOf(value) {
  if (value instanceof Date) return Number.isNaN(value.valueOf()) ? null : value.toISOString().replace(/\.\d{3}Z$/, 'Z');
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/.test(text)) return null;
  const zoned = text.length === 10 ? `${text}T00:00:00Z` : /(?:Z|[+-]\d{2}:?\d{2})$/.test(text) ? text.replace(' ', 'T') : `${text.replace(' ', 'T')}Z`;
  const moment = new Date(zoned);
  return Number.isNaN(moment.valueOf()) ? null : moment.toISOString().replace(/\.\d{3}Z$/, 'Z');
}
