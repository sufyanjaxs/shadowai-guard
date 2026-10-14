import { describe, it, expect } from 'vitest';
import { scanText } from '../scanner';
import { DataType } from '../types';

describe('ShadowAI Guard Scanner', () => {
  it('detects valid credit cards and ignores invalid ones (Luhn)', () => {
    const text = 'My card is 4111 1111 1111 1111 but not 1234 5678 9012 3456.';
    const results = scanText(text);
    
    expect(results).toHaveLength(1);
    expect(results[0].type).toBe(DataType.CREDIT_CARD);
    expect(text.substring(results[0].start, results[0].end)).toBe('4111 1111 1111 1111');
  });

  it('detects UAE Emirates ID format', () => {
    const text = 'My ID is 784-1990-1234567-8 and also 784199012345678.';
    const results = scanText(text);
    expect(results).toHaveLength(2);
    expect(results.every(r => r.type === DataType.EMIRATES_ID)).toBe(true);
  });

  it('detects valid IBANs and ignores invalid ones (Mod 97)', () => {
    const text = 'Valid: GB29 NWBK 6016 1331 9268 19. Invalid: GB29 NWBK 6016 1331 9268 18.';
    const results = scanText(text);
    
    expect(results).toHaveLength(1);
    expect(results[0].type).toBe(DataType.IBAN);
  });

  it('detects emails and phone numbers', () => {
    const text = 'Contact me at test@example.com or +971501234567 or +14155552671.';
    const results = scanText(text);
    
    const types = results.map(r => r.type);
    expect(types).toContain(DataType.EMAIL);
    expect(types).toContain(DataType.PHONE);
  });

  it('does not flag a partial "+" and digit as a phone number', () => {
    // Regression: /\+[1-9]\d{1,14}/ matched "+9", so redaction fired on the
    // second keystroke of any phone number and destroyed the field.
    const partials = ['+9', 'call +971', '+12', 'price is +5 and +6', 'a +9 b'];
    for (const text of partials) {
      const results = scanText(text);
      expect(results.filter(r => r.type === DataType.PHONE)).toHaveLength(0);
    }
  });

  it('still detects fully typed international phone numbers', () => {
    // Contiguous digits only — spaced formatting was never supported by this detector.
    for (const text of ['+971501234567', 'ring +14155552671 today', '+442079460958']) {
      const results = scanText(text);
      expect(results.some(r => r.type === DataType.PHONE)).toBe(true);
    }
  });

  it('detects API keys by prefix and high entropy', () => {
    const text = 'Key: sk-proj-1234567890abcdef1234567890. Generic: a8f9#k2Lp9@qR4vB7nM1xZ5cX8jH3tY6wE.';
    const results = scanText(text);
    
    expect(results.some(r => r.type === DataType.API_KEY)).toBe(true);
  });

  it('detects passwords in plain text', () => {
    const text = 'Here is my info: password: superSecret123 and pwd=admin.';
    const results = scanText(text);
    
    expect(results).toHaveLength(2);
    expect(results.every(r => r.type === DataType.PASSWORD)).toBe(true);
  });

  it('detects custom keywords', () => {
    const text = 'We are working on Project Phoenix and for client Acme Corp.';
    const results = scanText(text, { customKeywords: ['Project Phoenix', 'Acme Corp'] });
    
    expect(results).toHaveLength(2);
    expect(results.every(r => r.type === DataType.CUSTOM_KEYWORD)).toBe(true);
  });

  it('resolves overlapping detections correctly', () => {
    // An email that also contains a keyword
    const text = 'Email me at project.phoenix@example.com';
    const results = scanText(text, { customKeywords: ['project.phoenix'] });
    
    // Should only return the email, as it's longer and starts at the same/earlier index
    expect(results).toHaveLength(1);
    expect(results[0].type).toBe(DataType.EMAIL);
  });
});
