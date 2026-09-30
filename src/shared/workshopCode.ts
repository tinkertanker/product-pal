// Workshop code matching. Pure: the server reads the env and passes the string in.

/** Turn "abc12, XYZ99" into ["ABC12", "XYZ99"]. Empty or missing env gives []. */
export function parseCodes(raw: string | undefined | null): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((c) => c.trim().toUpperCase())
    .filter((c) => c.length > 0);
}

/** Case-insensitive, ignores surrounding whitespace. No configured codes means nobody gets in. */
export function codeMatches(input: unknown, codes: readonly string[]): boolean {
  if (typeof input !== 'string' || codes.length === 0) return false;
  const candidate = input.trim().toUpperCase();
  if (candidate.length === 0) return false;
  return codes.includes(candidate);
}
