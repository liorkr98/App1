/**
 * JSON for an inline <script> element.
 *
 * JSON.stringify leaves `<`, `>` and `&` alone, so a title typed as
 * `</script><script>…` closes the JSON-LD block and runs whatever follows on
 * every buyer's copy of the page. The escapes below are valid JSON string
 * escapes, so the parsed value is identical; only the HTML parser sees a
 * different character. U+2028/2029 are escaped for older JavaScript parsers.
 */
export function scriptJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}
