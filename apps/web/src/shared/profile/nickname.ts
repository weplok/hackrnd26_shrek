export type NicknameError = 'length' | 'characters' | 'profanity';

const nicknamePattern = /^[A-Za-zА-Яа-яЁё0-9_-]+$/;
const blockedTokens = ['бля', 'пизд', 'хуй', 'хуе', 'еба', 'ёба', 'сук'];

export function validateNickname(value: string): NicknameError | null {
  if (value.length < 2 || value.length > 16) {
    return 'length';
  }

  if (!nicknamePattern.test(value)) {
    return 'characters';
  }

  if (blockedTokens.some((token) => value.toLowerCase().includes(token))) {
    return 'profanity';
  }

  return null;
}
