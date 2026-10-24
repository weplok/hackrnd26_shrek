const nicknameKey = 'zero-day.profile.nickname';

export function readNickname(): string | null {
  try {
    const value = window.localStorage.getItem(nicknameKey);
    return value || null;
  } catch {
    return null;
  }
}

export function saveNickname(nickname: string): boolean {
  try {
    window.localStorage.setItem(nicknameKey, nickname);
    return true;
  } catch {
    return false;
  }
}
