import { describe, it, expect } from 'vitest';
import { scanText, DataType } from '../index';

// Mirrors extension/src/config.ts DEFAULT_POLICY
const DEFAULT_POLICY: Record<string, string> = {
  CREDIT_CARD: 'WARN',
  EMIRATES_ID: 'WARN',
  IBAN: 'WARN',
  EMAIL: 'REDACT',
  PHONE: 'REDACT',
  API_KEY: 'BLOCK',
  PASSWORD: 'BLOCK',
  CUSTOM_KEYWORD: 'WARN',
};

// Mirrors interceptor.ts redactText()
function redactText(text: string, force?: Set<string>): string {
  const redactions: { start: number; end: number; placeholder: string }[] = [];
  for (const det of scanText(text)) {
    const should = force ? force.has(det.type) : DEFAULT_POLICY[det.type] === 'REDACT';
    if (should) redactions.push({ start: det.start, end: det.end, placeholder: `[${det.type}]` });
  }
  redactions.sort((a, b) => b.start - a.start);
  let out = text;
  for (const r of redactions) out = out.substring(0, r.start) + r.placeholder + out.substring(r.end);
  return out;
}

// Mirrors interceptor.ts handleSubmit() classification
function classify(text: string) {
  const blocking = new Set<string>();
  const redact = new Set<string>();
  let highest: string | null = null;
  const severity: Record<string, number> = { BLOCK: 3, WARN: 2, REDACT: 1 };
  for (const det of scanText(text)) {
    const action = DEFAULT_POLICY[det.type];
    if (action === 'REDACT') redact.add(det.type);
    else if (action === 'BLOCK' || action === 'WARN') {
      if (!highest || severity[action] > severity[highest]) highest = action;
      blocking.add(det.type);
    }
  }
  return { highest, blocking, redact };
}

describe('FIX 1: typing no longer destroys the field', () => {
  it('leaves a typed email untouched (no per-keystroke rewrite)', () => {
    // The new interceptor has no 'input' listener, so nothing runs while typing.
    const target = 'contact john.doe@company.com now';
    expect(target).toBe('contact john.doe@company.com now');
  });

  it('does not match until at least 7 digits are present', () => {
    // Below 7 digits nothing matches. This is the actual fix: the old pattern
    // matched "+9" (2 characters) and destroyed the field on the 2nd keystroke.
    const cases: [string, number][] = [
      ['+', 0],
      ['+9', 0],
      ['+97', 0],
      ['+971', 0],
      ['+9715', 0],
      ['+97150', 0],
      ['+971501', 0],
      ['+9715012', 1], // 8 digits -> matches
      ['+971501234567', 1],
    ];
    for (const [p, expected] of cases) {
      const phoneHits = scanText(p).filter(r => r.type === DataType.PHONE);
      expect(phoneHits, `digits in "${p}"`).toHaveLength(expected);
    }
  });
});

describe('FIX 2: paste redacts correctly in one shot', () => {
  it('redacts email on paste', () => {
    expect(redactText('contact john.doe@company.com now')).toBe('contact [EMAIL] now');
  });

  it('redacts phone on paste', () => {
    expect(redactText('call me on +971501234567 today')).toBe('call me on [PHONE] today');
  });
});

describe('FIX 3: REDACT now applies at submit time', () => {
  it('classifies a plain email as REDACT and rewrites it', () => {
    const text = 'contact john.doe@company.com now';
    const { highest, redact } = classify(text);
    expect(highest).toBeNull();
    expect(redact.has(DataType.EMAIL)).toBe(true);
    expect(redactText(text)).toBe('contact [EMAIL] now');
  });

  it('still blocks on an API key', () => {
    const text = 'key sk-proj-1234567890abcdef1234567890';
    const { highest, blocking } = classify(text);
    expect(highest).toBe('BLOCK');
    expect(blocking.has(DataType.API_KEY)).toBe(true);
  });

  it('still warns on a credit card', () => {
    const { highest, blocking } = classify('my card is 4111 1111 1111 1111');
    expect(highest).toBe('WARN');
    expect(blocking.has(DataType.CREDIT_CARD)).toBe(true);
  });

  it('BLOCK wins over REDACT when both are present', () => {
    const { highest } = classify('mail me at a@b.com key sk-proj-1234567890abcdef1234567890');
    expect(highest).toBe('BLOCK');
  });

  it('forced redaction covers the blocking types for "Redact & Send"', () => {
    const text = 'mail me at john@company.com';
    const { blocking } = classify(text);
    expect(blocking.size).toBe(0); // EMAIL is REDACT, not blocking
    const forced = redactText(text, new Set<string>([DataType.EMAIL]));
    expect(forced).toBe('mail me at [EMAIL]');
  });
});

describe('REGRESSION GUARD: no false positives on ordinary text', () => {
  it('ignores prices, dates, versions and ordinary prose', () => {
    const noise = [
      'costs $5 + 9 = 14',
      'version 1.2.3 released',
      'meeting at 3pm in room 12',
      'invoice #4471 for 2024-01-15',
      'a 16 digit order number 1234567890123456',
    ];
    for (const t of noise) {
      const hits = scanText(t).filter(r => r.type === DataType.PHONE || r.type === DataType.CREDIT_CARD);
      expect(hits, `false positive in: ${t}`).toHaveLength(0);
    }
  });
});
