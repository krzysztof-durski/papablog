/**
 * Converts free-text user input into a safe SQLite FTS5 MATCH query.
 *
 * FTS5 has its own query mini-language (AND/OR/NOT/NEAR, `*` prefix
 * matching, `:` column filters, unbalanced `"` breaking the parser) that is
 * a distinct injection surface from classic SQL injection — parameterized
 * binding alone does NOT neutralize it, since the bound value is itself
 * parsed as a query string by the FTS5 engine.
 *
 * Every word is wrapped as its own quoted literal phrase (doubling any `"`
 * inside it, per FTS5 string-literal escaping) so none of the FTS5 operator
 * syntax in user input can be interpreted as anything but literal text, then
 * ANDed together so a multi-word search still requires every term to
 * appear, in any order.
 */
export function toFtsMatchQuery(raw: string, maxTerms = 10): string | null {
  const terms = raw
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, maxTerms)
    .map((term) => `"${term.replace(/"/g, '""')}"`);

  if (terms.length === 0) return null;
  return terms.join(' AND ');
}
