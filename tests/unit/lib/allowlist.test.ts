import { describe, expect, it } from 'vitest';
import { isAllowedWriter } from '../../../src/lib/auth/allowlist';

describe('isAllowedWriter', () => {
  it('allows an exact match', () => {
    expect(isAllowedWriter('dursky.k@gmail.com', 'dursky.k@gmail.com')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(isAllowedWriter('Dursky.K@Gmail.com', 'dursky.k@gmail.com')).toBe(true);
  });

  it('ignores surrounding whitespace on both sides', () => {
    expect(isAllowedWriter('  dursky.k@gmail.com  ', ' dursky.k@gmail.com ')).toBe(true);
  });

  it('supports multiple comma-separated emails', () => {
    const list = 'dursky.k@gmail.com, someone-else@example.com';
    expect(isAllowedWriter('someone-else@example.com', list)).toBe(true);
    expect(isAllowedWriter('dursky.k@gmail.com', list)).toBe(true);
  });

  it('rejects an email not in the list', () => {
    expect(isAllowedWriter('attacker@example.com', 'dursky.k@gmail.com')).toBe(false);
  });

  it('rejects everything for an empty allow-list', () => {
    expect(isAllowedWriter('dursky.k@gmail.com', '')).toBe(false);
  });
});
