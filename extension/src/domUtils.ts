// Utilities to safely read and write to textareas, inputs, and contenteditable elements.
import type { SiteConfig } from './config';

// Input types that never carry prose or secrets. Acting on these breaks real forms
// (date pickers, file uploads, colour swatches) without adding any protection.
const IGNORED_INPUT_TYPES = new Set([
  'password', 'hidden', 'submit', 'button', 'reset', 'checkbox', 'radio',
  'file', 'range', 'color', 'image', 'date', 'datetime-local', 'month',
  'time', 'week',
]);

function matchesAny(el: Element, selectors: string[]): boolean {
  return selectors.some((selector) => {
    try {
      return el.matches(selector);
    } catch {
      return false;
    }
  });
}

export function isMonitoredElement(el: HTMLElement, site?: SiteConfig | null): boolean {
  // On a site we have explicit selectors for, require the element to match one of them.
  // Otherwise fall back to a type check so unlisted sites still get coverage.
  if (el instanceof HTMLTextAreaElement) {
    return !site || matchesAny(el, site.inputSelectors);
  }
  if (el instanceof HTMLInputElement) {
    if (IGNORED_INPUT_TYPES.has(el.type)) return false;
    return !site || matchesAny(el, site.inputSelectors);
  }
  // Rich-text composers (ChatGPT, Claude, Gemini) are contenteditable hosts.
  if (el.isContentEditable) return true;
  return false;
}

export function getInputText(element: HTMLElement): string {
  if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
    return element.value;
  }
  if (element.isContentEditable) {
    return element.innerText; 
  }
  return '';
}

export function setInputText(element: HTMLElement, text: string): void {
  if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
    element.value = text;
    element.dispatchEvent(new Event('input', { bubbles: true }));
  } else if (element.isContentEditable) {
    element.innerText = text;
    element.dispatchEvent(new Event('input', { bubbles: true }));
  }
}
