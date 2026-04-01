/**
 * Escape a value for safe interpolation into a shell command.
 * Wraps the value in single quotes and escapes any embedded single quotes.
 * This is the POSIX-standard approach: 'value' with ' replaced by '\''
 */
export function shellEscape(value: string): string {
  return "'" + value.replace(/'/g, "'\\''") + "'";
}
