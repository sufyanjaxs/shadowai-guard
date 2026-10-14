import { DataType } from '@shadowai/shared';

export type PolicyAction = 'WARN' | 'REDACT' | 'BLOCK';

export type Policy = { [K in DataType]?: PolicyAction };

// Hard-coded policy for Phase 3. Will be fetched from backend in Phase 5.
export const DEFAULT_POLICY: Policy = {
  [DataType.CREDIT_CARD]: 'WARN',
  [DataType.EMIRATES_ID]: 'WARN',
  [DataType.IBAN]: 'WARN',
  [DataType.EMAIL]: 'REDACT',
  [DataType.PHONE]: 'REDACT',
  [DataType.API_KEY]: 'BLOCK',
  [DataType.PASSWORD]: 'BLOCK',
  [DataType.CUSTOM_KEYWORD]: 'WARN',
};

export interface SiteConfig {
  name: string;
  inputSelectors: string[]; // Selectors for the text input areas
  submitSelectors: string[]; // Selectors for the send/submit buttons
}

// Isolated site-specific selectors. If an AI site updates their DOM, we only fix it here.
export const SITE_CONFIGS: Record<string, SiteConfig> = {
  'chatgpt.com': {
    name: 'ChatGPT',
    // A contenteditable entry is required: if ChatGPT ever drops #prompt-textarea the
    // send-button path silently stopped enforcing (there is no <textarea> fallback).
    inputSelectors: ['#prompt-textarea', 'textarea', 'div[contenteditable="true"]'],
    submitSelectors: ['button[data-testid="send-button"]'],
  },
  'claude.ai': {
    name: 'Claude',
    inputSelectors: ['div[contenteditable="true"]', 'textarea'],
    submitSelectors: ['button[aria-label="Send Message"]'],
  },
  'gemini.google.com': {
    name: 'Gemini',
    inputSelectors: ['rich-textarea', 'textarea', 'div[contenteditable="true"]'],
    submitSelectors: ['button[aria-label="Send message"]'],
  }
};

// Hostname matching is exact on purpose: a site must be explicitly listed before the
// extension touches it. Previously this map was never imported anywhere, so the
// interceptor fell back to "monitor every field on every site".
export function normalizeHost(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, '');
}

export function getSiteConfig(): SiteConfig | null {
  return SITE_CONFIGS[normalizeHost(window.location.hostname)] || null;
}

export function isKnownAiSite(hostname: string): boolean {
  return normalizeHost(hostname) in SITE_CONFIGS;
}
