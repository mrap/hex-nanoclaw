/** Parse a duration string like "5m", "1h", "30s", "2d" into seconds. */
export function parseDurationSeconds(s: string): number {
  const num = parseInt(s, 10);
  if (s.endsWith('s')) return num;
  if (s.endsWith('m')) return num * 60;
  if (s.endsWith('h')) return num * 3600;
  if (s.endsWith('d')) return num * 86400;
  return num; // bare number = seconds
}

/** Parse a duration string into milliseconds. */
export function parseDurationMs(s: string): number {
  return parseDurationSeconds(s) * 1000;
}
