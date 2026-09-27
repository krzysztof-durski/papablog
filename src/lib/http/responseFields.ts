/** Safely reads a single string field off an unknown (e.g. parsed-JSON) response body, without trusting its shape. */
export function extractStringField(data: unknown, key: string): string | null {
  if (data && typeof data === 'object' && key in data) {
    const value = (data as Record<string, unknown>)[key];
    if (typeof value === 'string') return value;
  }
  return null;
}
