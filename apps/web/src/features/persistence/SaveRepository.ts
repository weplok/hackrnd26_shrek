import type { CareerProfile, GameState } from '@zero-day/engine';

export const SAVE_VERSION = 2;
export const SAVE_KEY = 'zero-day.save';

export interface SaveData {
  saveVersion: number;
  contentVersion: string;
  /** Campaign progress: cases closed with a win. */
  completedCases: string[];
  /** Current case snapshot; holds its own checkpoint (ADR-11). */
  caseRun: GameState | null;
  /** Codex cards opened across the campaign. */
  codex: string[];
  /** Successes across completed cases; used for the career profile. */
  profile: CareerProfile;
}

export type LoadStatus = 'empty' | 'ok' | 'case-reset' | 'corrupt';

export interface LoadResult {
  status: LoadStatus;
  save: SaveData;
}

export type KeyValueStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

type RawSave = Record<string, unknown>;

/** Migration from version N (key) to N + 1. */
export type Migration = (raw: RawSave) => RawSave;

export const migrations: Record<number, Migration> = {
  1: (raw) => ({ ...raw, profile: { technicalSuccesses: 0, socialSuccesses: 0 } }),
};

export function emptySave(contentVersion: string): SaveData {
  return {
    saveVersion: SAVE_VERSION,
    contentVersion,
    completedCases: [],
    caseRun: null,
    codex: [],
    profile: { technicalSuccesses: 0, socialSuccesses: 0 },
  };
}

export function memoryStore(): KeyValueStore {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
  };
}

// Private mode or disabled storage throws on access or write (FR-113).
export function detectLocalStorage(): KeyValueStore | null {
  try {
    const storage = window.localStorage;
    const probe = `${SAVE_KEY}.probe`;
    storage.setItem(probe, probe);
    storage.removeItem(probe);
    return storage;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is RawSave {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function careerProfile(value: unknown): CareerProfile {
  if (!isRecord(value)) return { technicalSuccesses: 0, socialSuccesses: 0 };
  return {
    technicalSuccesses: typeof value.technicalSuccesses === 'number' ? value.technicalSuccesses : 0,
    socialSuccesses: typeof value.socialSuccesses === 'number' ? value.socialSuccesses : 0,
  };
}

export class SaveRepository {
  readonly persistent: boolean;
  private readonly store: KeyValueStore;

  constructor(
    private readonly contentVersion: string,
    store: KeyValueStore | null = detectLocalStorage(),
    private readonly chain: Record<number, Migration> = migrations,
  ) {
    this.persistent = store !== null;
    this.store = store ?? memoryStore();
  }

  load(): LoadResult {
    const empty = emptySave(this.contentVersion);
    let text: string | null;
    try {
      text = this.store.getItem(SAVE_KEY);
    } catch {
      return { status: 'corrupt', save: empty };
    }
    if (text === null) return { status: 'empty', save: empty };

    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      return { status: 'corrupt', save: empty };
    }
    if (!isRecord(raw) || typeof raw.saveVersion !== 'number' || raw.saveVersion > SAVE_VERSION) {
      return { status: 'corrupt', save: empty };
    }

    let data = raw;
    for (let version = raw.saveVersion; version < SAVE_VERSION; version += 1) {
      const migrate = this.chain[version];
      if (!migrate) return { status: 'corrupt', save: empty };
      data = { ...migrate(data), saveVersion: version + 1 };
    }

    const save: SaveData = {
      ...empty,
      completedCases: stringList(data.completedCases),
      codex: stringList(data.codex),
      profile: careerProfile(data.profile),
    };
    const caseRun = data.caseRun;
    if (caseRun === null || caseRun === undefined) return { status: 'ok', save };
    // Snapshot from other content or a broken one: restart the case, keep campaign progress (FR-111).
    if (data.contentVersion !== this.contentVersion || !isRecord(caseRun) || typeof caseRun.caseId !== 'string') {
      return { status: 'case-reset', save };
    }
    return { status: 'ok', save: { ...save, caseRun: caseRun as unknown as GameState } };
  }

  write(save: SaveData): boolean {
    try {
      this.store.setItem(SAVE_KEY, JSON.stringify({ ...save, saveVersion: SAVE_VERSION }));
      return true;
    } catch {
      return false;
    }
  }

  update(change: (save: SaveData) => SaveData): boolean {
    return this.write(change(this.load().save));
  }
}
