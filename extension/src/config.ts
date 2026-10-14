import { DataType } from '@shadowai/shared';

export type PolicyAction = 'WARN' | 'REDACT' | 'BLOCK';

export type Policy = { [K in DataType]?: PolicyAction };

// Hard-coded policy used until the company policy is fetched from the backend.
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
  /** Ordered fallbacks: the first match wins. */
  inputSelectors: string[];
  submitSelectors: string[];
  /** Set to false only for a host we deliberately do not auto-detect. */
  sendButtonHeuristic?: boolean;
}

// ---------------------------------------------------------------------------
// SELECTORS — keep this file current with `node extension/e2e/recon-live-sites.mjs`
//
// Observed live on 2026-10-14 (recon output kept in docs/live-sites.md):
//   chatgpt.com        textarea#mobile-composer-prompt[aria-label="Chat with ChatGPT"],
//                      send button aria-label="Send message"  (data-testid="send-button" is GONE)
//   gemini.google.com  div[contenteditable][role=textbox][aria-label="Enter a prompt for Gemini"]
//   perplexity.ai      div#ask-input[contenteditable][role=textbox]
//   claude.ai          captcha interstitial when logged out — composer unverified
//   copilot.microsoft.com / chat.deepseek.com  login or bot wall — composer unverified
//
// Every list is a fallback CHAIN on purpose: a single selector is a single point
// of silent failure, which is exactly how enforcement disappears after a site
// redesign without any error ever being raised.
// ---------------------------------------------------------------------------
export const SITE_CONFIGS: Record<string, SiteConfig> = {
  'chatgpt.com': {
    name: 'ChatGPT',
    inputSelectors: [
      '#prompt-textarea',
      'textarea#mobile-composer-prompt',
      'textarea[aria-label="Chat with ChatGPT"]',
      'div[contenteditable="true"][role="textbox"]',
      'textarea',
      'div[contenteditable="true"]',
    ],
    submitSelectors: [
      'button[data-testid="send-button"]',
      'button[aria-label="Send message"]',
      'button[aria-label*="Send" i]',
      'button[data-testid*="send" i]',
    ],
  },
  'claude.ai': {
    name: 'Claude',
    inputSelectors: [
      'div[contenteditable="true"][role="textbox"]',
      'textarea',
      'div[contenteditable="true"]',
    ],
    submitSelectors: [
      'button[aria-label="Send Message"]',
      'button[aria-label*="Send" i]',
      'button[data-testid*="send" i]',
    ],
  },
  'gemini.google.com': {
    name: 'Gemini',
    inputSelectors: [
      'rich-textarea',
      'div[contenteditable="true"][aria-label="Enter a prompt for Gemini"]',
      'div[contenteditable="true"][role="textbox"]',
      'textarea',
      'div[contenteditable="true"]',
    ],
    // Gemini's send control is an icon-only button whose label changes with
    // state, so the heuristic below carries most of the weight here.
    submitSelectors: [
      'button[aria-label="Send message"]',
      'button[aria-label*="Send" i]',
      'button[data-testid*="send" i]',
    ],
  },
  'copilot.microsoft.com': {
    name: 'Microsoft Copilot',
    inputSelectors: [
      '#prompt-input-container textarea',
      'textarea#prompt-textarea',
      'div[contenteditable="true"][role="textbox"]',
      'textarea',
      'div[contenteditable="true"]',
    ],
    submitSelectors: [
      'button#submit-button',
      'button[aria-label="Send"]',
      'button[aria-label*="Send" i]',
      'button[data-testid*="send" i]',
    ],
  },
  'perplexity.ai': {
    name: 'Perplexity',
    inputSelectors: [
      '#ask-input',
      'div[contenteditable="true"][role="textbox"]',
      'textarea',
      'div[contenteditable="true"]',
    ],
    submitSelectors: [
      'button[aria-label="Submit"]',
      'button[aria-label*="Send" i]',
      'button[aria-label*="Submit" i]',
      'button[data-testid*="send" i]',
    ],
  },
  'chat.deepseek.com': {
    name: 'DeepSeek',
    inputSelectors: [
      'div[contenteditable="true"]',
      'textarea',
    ],
    submitSelectors: [
      'button[aria-label*="Send" i]',
      'button[data-testid*="send" i]',
    ],
  },
};

// Used when a site is not listed above. Without this, a brand new AI site would
// be protected on Enter and form submit but NOT on a send-button click.
export const GENERIC_CONFIG: SiteConfig = {
  name: 'Generic site',
  inputSelectors: ['textarea', 'div[contenteditable="true"]', 'input[type="text"]'],
  submitSelectors: [
    'button[type="submit"]',
    'button[aria-label*="Send" i]',
    'button[aria-label*="Submit" i]',
    'button[data-testid*="send" i]',
  ],
};

// A button that looks like a send control, used only when no configured selector
// matched. Prevents "the site redesigned and enforcement silently vanished".
const SEND_LABEL_HINT = /\b(send|submit|ask|go|enter)\b/i;

export function looksLikeSendButton(el: Element): boolean {
  const label = [
    el.getAttribute('aria-label'),
    el.getAttribute('title'),
    el.getAttribute('data-testid'),
    el.textContent,
  ]
    .filter(Boolean)
    .join(' ');
  return SEND_LABEL_HINT.test(label);
}

// Hostname matching is exact on purpose: a site must be explicitly listed before
// the extension touches it.
export function normalizeHost(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, '');
}

export function getSiteConfig(): SiteConfig | null {
  return SITE_CONFIGS[normalizeHost(window.location.hostname)] || null;
}

export function isKnownAiSite(hostname: string): boolean {
  return normalizeHost(hostname) in SITE_CONFIGS;
}