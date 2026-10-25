import { describe, expect, it } from 'vitest';
import { complete, normalizeVuln, parseCommand } from './parser';

const ctx = { nodes: ['wifi', 'router', 'speaker'], vulns: ['SL-01', 'SL-02', 'SL-12'] };

describe('terminal parser', () => {
  it('treats Latin and Cyrillic weakness ids as equal', () => {
    expect(normalizeVuln('SL-02')).toBe('SL-02');
    expect(normalizeVuln('СЛ-02')).toBe('SL-02');
    expect(normalizeVuln('сл2')).toBe('SL-02');
    expect(normalizeVuln('XL-02')).toBeNull();
  });

  it('parses hypothesis, scan, help and codex', () => {
    expect(parseCommand('router СЛ-02', ctx)).toEqual({ type: 'hypothesis', node: 'router', vuln: 'SL-02' });
    expect(parseCommand('  scan  WIFI ', ctx)).toEqual({ type: 'scan', node: 'wifi' });
    expect(parseCommand('help', ctx)).toEqual({ type: 'help' });
    expect(parseCommand('codex sl-01', ctx)).toEqual({ type: 'codex', vuln: 'SL-01' });
    expect(parseCommand('bruteforce Router', ctx)).toEqual({ type: 'attack', attack: 'brute', node: 'router' });
  });

  it('reports errors without touching the engine', () => {
    expect(parseCommand('', ctx)).toEqual({ type: 'error', code: 'empty' });
    expect(parseCommand('rm -rf', ctx)).toEqual({ type: 'error', code: 'unknown-command', token: 'rm' });
    expect(parseCommand('scan vault', ctx)).toEqual({ type: 'error', code: 'unknown-node', token: 'vault' });
    expect(parseCommand('router SL-99', ctx)).toEqual({ type: 'error', code: 'unknown-vuln', token: 'SL-99' });
    expect(parseCommand('scan', ctx)).toEqual({ type: 'error', code: 'usage' });
    expect(parseCommand('router SL-01 extra', ctx)).toEqual({ type: 'error', code: 'usage' });
  });
});

describe('terminal completion', () => {
  it('completes a unique command or node', () => {
    expect(complete('sc', ctx)).toEqual({ value: 'scan ', options: [] });
    expect(complete('scan ro', ctx)).toEqual({ value: 'scan router ', options: [] });
  });

  it('lists options when ambiguous', () => {
    expect(complete('s', ctx)).toEqual({ value: 's', options: ['scan', 'social', 'speaker'] });
    expect(complete('router SL-0', ctx)).toEqual({ value: 'router SL-0', options: ['SL-01', 'SL-02'] });
  });

  it('keeps the script the player typed', () => {
    expect(complete('router сл-1', ctx)).toEqual({ value: 'router СЛ-12 ', options: [] });
    expect(complete('codex С', ctx).options).toEqual(['СЛ-01', 'СЛ-02', 'СЛ-12']);
  });

  it('extends to the shared prefix', () => {
    expect(complete('router ', ctx)).toEqual({ value: 'router SL-', options: ['SL-01', 'SL-02', 'SL-12'] });
  });
});
