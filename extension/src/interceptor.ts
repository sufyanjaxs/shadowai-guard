import { scanText, DataType } from '@shadowai/shared';
import {
  DEFAULT_POLICY,
  Policy,
  PolicyAction,
  SiteConfig,
  GENERIC_CONFIG,
  getSiteConfig,
  looksLikeSendButton,
} from './config';
import { getInputText, setInputText, isMonitoredElement } from './domUtils';
import { showDialog } from './ui/dialog';

let isBypassing = false;
let currentPolicy: Policy = DEFAULT_POLICY;

// Resolved once per page. Listed sites get their precise selectors; every other
// host uses GENERIC_CONFIG so that a brand new AI site is still enforced on
// send-button clicks rather than only on Enter.
const site: SiteConfig = getSiteConfig() ?? GENERIC_CONFIG;

// Fetch policy from background script on initialization
chrome.runtime.sendMessage({ type: 'GET_POLICY' }, (response) => {
  if (response?.policy) {
    // Merge fetched policy with defaults for any missing types
    currentPolicy = { ...DEFAULT_POLICY, ...response.policy };
    console.log('ShadowAI Guard: Policy synced from backend.');
  } else {
    console.log('ShadowAI Guard: Using default fallback policy (not logged in).');
  }
});

function getAction(type: DataType, policy: Policy): PolicyAction {
  return policy[type] || 'WARN';
}

function redactText(text: string, policy: Policy, force?: Set<DataType>): string {
  const detections = scanText(text);
  const redactions: { start: number, end: number, placeholder: string }[] = [];

  for (const det of detections) {
    const shouldRedact = force ? force.has(det.type) : getAction(det.type, policy) === 'REDACT';
    if (shouldRedact) {
      redactions.push({ start: det.start, end: det.end, placeholder: `[${det.type}]` });
    }
  }

  if (redactions.length === 0) return text;

  // Apply from the end so earlier offsets stay valid.
  redactions.sort((a, b) => b.start - a.start);
  let newText = text;
  for (const r of redactions) {
    newText = newText.substring(0, r.start) + r.placeholder + newText.substring(r.end);
  }
  return newText;
}

// Redaction only. Never called from a keystroke handler — see initInterceptor.
function handleRedact(element: HTMLElement, policy: Policy, force?: Set<DataType>) {
  const text = getInputText(element);
  if (!text) return;

  const newText = redactText(text, policy, force);
  if (newText !== text) {
    setInputText(element, newText);
  }
}

// 'BLOCK_BYPASSED' / 'WARN_BYPASSED' are logged when a user clicks "Send anyway".
type ReportedAction = PolicyAction | 'BLOCK_BYPASSED' | 'WARN_BYPASSED';

function reportEvent(dataType: DataType, action: ReportedAction) {
  // CRITICAL PRIVACY: Only metadata is sent. No text content.
  chrome.runtime.sendMessage({
    type: 'REPORT_EVENT',
    payload: {
      data_type: dataType,
      action: action,
      hostname: window.location.hostname
    }
  });
}

function handleSubmit(element: HTMLElement, policy: Policy, event: Event) {
  if (isBypassing) return;

  const text = getInputText(element);
  if (!text) return;

  const detections = scanText(text);
  if (detections.length === 0) return;

  const blockingTypes = new Set<DataType>();
  const redactTypes = new Set<DataType>();
  let highestAction: PolicyAction | null = null;
  const severity: Record<PolicyAction, number> = { 'BLOCK': 3, 'WARN': 2, 'REDACT': 1 };

  for (const det of detections) {
    const action = getAction(det.type, policy);
    if (action === 'REDACT') {
      redactTypes.add(det.type);
    } else if (action === 'BLOCK' || action === 'WARN') {
      if (!highestAction || severity[action] > severity[highestAction]) {
        highestAction = action;
      }
      blockingTypes.add(det.type);
    }
  }

  // Replay the original submit without re-entering this handler.
  const originalEventType = event.type;
  const originalTarget = event.target as HTMLElement;
  const performOriginalSubmit = () => {
    isBypassing = true;
    try {
      if (originalEventType === 'submit') {
        (originalTarget as HTMLFormElement).submit();
      } else if (originalEventType === 'click') {
        originalTarget.click();
      } else {
        const enterEvent = new KeyboardEvent('keydown', {
          key: 'Enter', code: 'Enter', keyCode: 13, which: 13,
          bubbles: true, cancelable: true
        });
        element.dispatchEvent(enterEvent);
      }
    } finally {
      isBypassing = false;
    }
  };

  // A BLOCK or WARN takes precedence: hold the submission and ask the user.
  if (highestAction === 'BLOCK' || highestAction === 'WARN') {
    event.preventDefault();
    event.stopPropagation();

    showDialog(highestAction, Array.from(blockingTypes), {
      onSendAnyway: () => {
        // Only a WARN dialog renders this button — a BLOCK dialog has no bypass,
        // so this path can only ever record a warning the user overrode.
        for (const type of blockingTypes) {
          reportEvent(type, 'WARN_BYPASSED');
        }
        performOriginalSubmit();
      },
      onRedactAndSend: () => {
        for (const type of blockingTypes) {
          reportEvent(type, 'REDACT');
        }
        handleRedact(element, policy, blockingTypes);
        performOriginalSubmit();
      }
    });

    // Report the initial block/warn event
    for (const type of blockingTypes) {
      reportEvent(type, highestAction);
    }
    return;
  }

  // Nothing blocking: apply REDACT silently at submit time. Previously redaction only
  // existed on the per-keystroke path, so a REDACT-only policy did nothing here.
  if (redactTypes.size > 0) {
    for (const type of redactTypes) {
      reportEvent(type, 'REDACT');
    }
    handleRedact(element, policy);
  }
}

// Resolve which composer the click actually belongs to.
// Previously this used document.querySelector(inputSelectors), i.e. the FIRST monitored
// field on the page. Any page with two composers then scanned an empty field and let
// the real one through, so enforcement silently depended on DOM order.
function resolveComposerFor(target: HTMLElement, site: SiteConfig): HTMLElement | null {
  // 1. The user just typed here, so that is the composer under the cursor.
  const active = document.activeElement as HTMLElement | null;
  if (active && isMonitoredElement(active, site)) return active;

  // 2. Look inside the clicked button's own form/section before the whole page.
  const scope = target.closest('form') as HTMLElement | null
    ?? target.parentElement
    ?? null;
  if (scope) {
    const candidates = scope.querySelectorAll<HTMLElement>('textarea, input, [contenteditable="true"]');
    for (const el of Array.from(candidates)) {
      if (isMonitoredElement(el, site)) return el;
    }
  }

  // 3. Last resort: the first monitored composer on the page.
  return document.querySelector(site.inputSelectors.join(',')) as HTMLElement | null;
}

// Did this click land on a send/submit control?
//
// Configured selectors are tried first. If none match, a structural fallback
// runs: a button that carries a send-ish label, or that sits in the same
// container as a monitored composer. Without it, a site that renames or
// re-icons its send button loses click enforcement with no error anywhere —
// exactly what happened on chatgpt.com, whose data-testid disappeared.
//
// A false positive here is harmless: handleSubmit scans the composer and does
// nothing at all when it finds no detections.
function isSendControl(target: HTMLElement, site: SiteConfig): boolean {
  for (const selector of site.submitSelectors) {
    try {
      if (target.closest(selector)) return true;
    } catch {
      // An invalid selector must never break enforcement.
    }
  }

  const button = target.closest('button, [role="button"], input[type="submit"]') as HTMLElement | null;
  if (!button) return false;
  if (looksLikeSendButton(button)) return true;

  // Icon-only buttons ("➤", an SVG, a bare class name) share a container with
  // the composer. That proximity is enough evidence to scan on click.
  const container = button.closest('form, section, [class*="composer" i], [data-testid*="composer" i], [role="group"]');
  if (container?.querySelector('textarea, [contenteditable="true"]')) return true;

  return false;
}

export function initInterceptor() {
  // Re-scan + redact the focused field on demand (used by the dialog's "Redact & Send").
  window.addEventListener('shadowai-redact-now', () => {
    const activeEl = document.activeElement as HTMLElement;
    if (activeEl && isMonitoredElement(activeEl, site)) {
      handleRedact(activeEl, currentPolicy);
    }
  });

  // Drag-and-drop inserts text without ever firing `paste`, so dropped secrets
  // used to bypass the composer entirely. Same treatment as paste: inspect after
  // the browser has inserted the content.
  document.addEventListener('drop', (e) => {
    const target = e.target as HTMLElement;
    if (!isMonitoredElement(target, site)) return;
    setTimeout(() => handleRedact(target, currentPolicy), 0);
  }, true);

  // Paste only. A previous 'input' listener rewrote the field on every keystroke, which
  // destroyed partially-typed emails and phones (the caret/selection is lost when we
  // assign to .value) and swallowed characters. Destructive actions belong on paste.
  document.addEventListener('paste', (e) => {
    const target = e.target as HTMLElement;
    if (!isMonitoredElement(target, site)) return;
    // Let the browser insert the text first, then inspect the result.
    setTimeout(() => handleRedact(target, currentPolicy), 0);
  }, true);

  document.addEventListener('keydown', (e) => {
    if (isBypassing) return;
    const target = e.target as HTMLElement;
    if (isMonitoredElement(target, site) && e.key === 'Enter' && !e.shiftKey) {
      handleSubmit(target, currentPolicy, e);
    }
  }, true);

  document.addEventListener('submit', (e) => {
    if (isBypassing) return;
    const form = e.target as HTMLFormElement;
    const inputs = form.querySelectorAll('textarea, input, [contenteditable="true"]');
    for (let i = 0; i < inputs.length; i++) {
      const el = inputs[i] as HTMLElement;
      if (isMonitoredElement(el, site)) {
        handleSubmit(el, currentPolicy, e);
        break;
      }
    }
  }, true);

  // Clicking a send button does not fire 'submit' on every app (ChatGPT is the common
  // case), so intercept clicks on buttons within a monitored composer too.
  document.addEventListener('click', (e) => {
    if (isBypassing) return;
    const target = e.target as HTMLElement;
    if (!target.closest) return;
    if (!isSendControl(target, site)) return;

    const composer = resolveComposerFor(target, site);
    if (composer) {
      handleSubmit(composer, currentPolicy, e);
    }
  }, true);
}
