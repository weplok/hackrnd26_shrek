import { describe, expect, it } from 'vitest';
import { validateNickname } from './nickname';

describe('validateNickname', () => {
  it('accepts permitted nicknames', () => {
    expect(validateNickname('Zero_42')).toBeNull();
    expect(validateNickname('Ёжик-7')).toBeNull();
  });

  it('rejects values outside permitted format', () => {
    expect(validateNickname('x')).toBe('length');
    expect(validateNickname('name space')).toBe('characters');
    expect(validateNickname('бляха')).toBe('profanity');
  });
});
