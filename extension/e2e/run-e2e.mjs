/**
 * ShadowAI Guard â€” real-browser end-to-end test.
 *
 * Loads the ACTUAL built extension (extension/dist) into a real Chromium, fakes the
 * chatgpt.com hostname so the site-specific selectors are exercised, and verifies the
 * four product behaviours: BLOCK, WARN (send-anyway / redact-and-send), silent REDACT,
 * and clean pass-through.
 *
 *   node e2e/run-e2e.mjs
 *
 * Exit code 0 = every case passed.
 */
import { createServer } from 'node:http';
import { readFileSync, existsSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const HERE = dirname(fileURLToPath(import.meta.url));
const DIST = resolve(HERE, '..', 'dist');
const HARNESS = readFileSync(resolve(HERE, 'harness.html'), 'utf8');
const PORT = 8080;

function loadPlaywright() {
  const candidates = [
    'playwright',
    'playwright-core',
    'C:/Users/Admin/.opencode/skills/autobroker-pro/node_modules/playwright-core',
  ];
  for (const c of candidates) {
    try {
      return require(c);
    } catch {
      /* try next */
    }
  }
  throw new Error('Playwright not found. Install it or set PLAYWRIGHT_PATH.');
}

if (!existsSync(resolve(DIST, 'manifest.json'))) {
  console.error('FAIL: extension/dist/manifest.json missing. Run `pnpm build:ext` first.');
  process.exit(2);
}

const server = createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(HARNESS);
});
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));

const { chromium } = loadPlaywright();
// A stale profile makes this suite lie. Chrome keeps the previously installed
// service worker in the profile directory, so after a rebuild the extension runs
// OLD code — pointing at the previous Supabase project — and the logged-in tests
// fail with a confusing "Invalid login credentials". The profile is a test
// artifact, so it is recreated on every run.
const userDataDir = resolve(HERE, '.profile');
if (existsSync(userDataDir)) {
  rmSync(userDataDir, { recursive: true, force: true });
  console.log('recreated a clean browser profile (stale service workers are removed)');
}

const context = await chromium.launchPersistentContext(userDataDir, {
  headless: true,
  channel: 'chromium',
  viewport: { width: 1280, height: 900 },
  args: [
    `--disable-extensions-except=${DIST}`,
    `--load-extension=${DIST}`,
    `--host-resolver-rules=MAP chatgpt.com 127.0.0.1:${PORT}`,
  ],
});

// Required for the real-clipboard paste case (Ctrl+V reads the OS clipboard).
await context.grantPermissions(['clipboard-read', 'clipboard-write']);

// The MV3 service worker must register, otherwise nothing can enforce a policy.
let [worker] = context.serviceWorkers();
if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 15000 });
console.log(`extension loaded: service worker = ${worker.url().split('/').pop()}\n`);
// The login and the event reporting both happen in the worker, so its console is
// where a network failure shows up.
worker.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') {
    console.log(`        [sw ${m.type()}] ${m.text().slice(0, 200)}`);
  }
});
worker.on('requestfailed', (r) =>
  console.log('        [sw request failed]', r.url().slice(0, 140), r.failure()?.errorText));

const results = [];
async function test(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`  PASS  ${name}`);
  } catch (err) {
    results.push({ name, ok: false, err: err.message });
    console.log(`  FAIL  ${name}\n        ${err.message}`);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const DIALOG = '#shadowai-dialog-host';
const AI_URL = `http://chatgpt.com:${PORT}/`;      // site-specific selectors active
const GENERIC_URL = `http://127.0.0.1:${PORT}/`;   // unknown host -> generic fallback

async function newPage(url) {
  const page = await context.newPage();
  page.on('pageerror', (e) => console.log('        [page error]', e.message));
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  // content script runs at document_idle
  await page.waitForTimeout(400);
  return page;
}

async function typeIn(page, selector, text) {
  await page.click(selector);
  await page.keyboard.type(text, { delay: 0 });
}

async function sentLines(page) {
  return page.evaluate(() => window.__sent);
}

async function dialogTitle(page) {
  return page.evaluate(() => {
    const host = document.getElementById('shadowai-dialog-host');
    return host ? host.shadowRoot.querySelector('h2').textContent.trim() : null;
  });
}

async function clickDialog(page, id) {
  await page.evaluate((btnId) => {
    document.getElementById('shadowai-dialog-host').shadowRoot
      .getElementById(btnId).click();
  }, id);
  await page.waitForTimeout(250);
}

console.log('CHATGPT.COM path (site-specific selectors)');
const page = await newPage(AI_URL);

await test('API key + send button -> BLOCK, nothing sent', async () => {
  await page.goto(AI_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(300);
  await typeIn(page, '#prompt-textarea', 'here is my key sk-proj-abcdefghijklmnopqrstuvwxyz1234567890');
  await page.click('#send');
  await page.waitForSelector(DIALOG, { timeout: 4000 });
  const title = await dialogTitle(page);
  assert(title === 'Submission Blocked', `expected BLOCK dialog, got "${title}"`);
  assert((await sentLines(page)).length === 0, 'message was sent despite BLOCK');
  await clickDialog(page, 'btn-cancel');
});

await test('credit card + send button -> WARN dialog (Redact & Send offered)', async () => {
  await page.goto(AI_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(300);
  await typeIn(page, '#prompt-textarea', 'my card is 4111111111111111 ok?');
  await page.click('#send');
  await page.waitForSelector(DIALOG, { timeout: 4000 });
  assert((await dialogTitle(page)) === 'Sensitive Data Detected', 'expected WARN dialog');
  const labels = await page.evaluate(() =>
    [...document.getElementById('shadowai-dialog-host').shadowRoot.querySelectorAll('button')]
      .map((b) => b.textContent.trim()));
  assert(labels.includes('Redact & Send'), `missing redact option: ${labels.join('/')}`);
  await clickDialog(page, 'btn-cancel');
});

await test('credit card -> "Redact & Send" replaces the number and sends', async () => {
  await page.goto(AI_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(300);
  await typeIn(page, '#prompt-textarea', 'my card is 4111111111111111 ok?');
  await page.click('#send');
  await page.waitForSelector(DIALOG, { timeout: 4000 });
  await clickDialog(page, 'btn-redact');
  const sent = await sentLines(page);
  assert(sent.length === 1, `expected 1 send, got ${sent.length}`);
  assert(sent[0].includes('[CREDIT_CARD]'), `card was not redacted: ${sent[0]}`);
  assert(!sent[0].includes('4111111111111111'), 'raw card number leaked to the site');
});

await test('credit card -> "Send Anyway" sends the unmodified text and is reported', async () => {
  await page.goto(AI_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(300);
  await typeIn(page, '#prompt-textarea', 'my card is 4111111111111111 ok?');
  await page.click('#send');
  await page.waitForSelector(DIALOG, { timeout: 4000 });
  await clickDialog(page, 'btn-send');
  const sent = await sentLines(page);
  assert(sent.length === 1, `expected 1 send, got ${sent.length}`);
  assert(sent[0].includes('4111111111111111'), 'Send Anyway should pass text through');
});

console.log('\nGENERIC HOST path (unknown host -> type-based fallback)');

await test('clean message passes through untouched, no dialog', async () => {
  await page.goto(GENERIC_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(300);
  await typeIn(page, '#prompt', 'summarise this quarterly report please');
  await page.click('#submitBtn');
  await page.waitForTimeout(400);
  assert(!(await page.$(DIALOG)), 'clean text should never raise a dialog');
  const sent = await sentLines(page);
  assert(sent[0] === 'form:summarise this quarterly report please', `unexpected: ${sent[0]}`);
});

await test('email in a form -> silently redacted on submit, still delivered', async () => {
  await page.goto(GENERIC_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(300);
  await typeIn(page, '#prompt', 'mail me at jane.doe@corp-example.com about it');
  await page.click('#submitBtn');
  await page.waitForTimeout(400);
  assert(!(await page.$(DIALOG)), 'REDACT-only types must not raise a dialog');
  const sent = await sentLines(page);
  assert(sent[0].includes('[EMAIL]'), `email not redacted: ${sent[0]}`);
  assert(!sent[0].includes('jane.doe@corp-example.com'), 'raw email leaked to the site');
});

await test('Enter key on API key -> BLOCK (keyboard path, no send button)', async () => {
  await page.goto(GENERIC_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(300);
  await typeIn(page, '#prompt', 'key sk-proj-abcdefghijklmnopqrstuvwxyz1234567890');
  await page.keyboard.press('Enter');
  await page.waitForSelector(DIALOG, { timeout: 4000 });
  assert((await dialogTitle(page)) === 'Submission Blocked', 'expected BLOCK on Enter');
  assert((await sentLines(page)).length === 0, 'message sent despite BLOCK');
  await clickDialog(page, 'btn-cancel');
});

await test('paste of an email -> redacted immediately on paste', async () => {
  await page.goto(GENERIC_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(300);
  // A real paste: write to the OS clipboard and press Ctrl+V. Dispatching a synthetic
  // ClipboardEvent does not insert any text, so it proves nothing about the paste path.
  await page.click('#prompt');
  await page.evaluate(() => navigator.clipboard.writeText('ping ops@corp-example.com now'));
  await page.keyboard.press('Control+V');
  await page.waitForTimeout(400);
  const val = await page.inputValue('#prompt');
  assert(val.includes('[EMAIL]'), `paste was not redacted: "${val}"`);
  assert(!val.includes('ops@corp-example.com'), 'raw email survived the paste');
});

await test('composer whose id drifted -> still BLOCKed via the send button', async () => {
  await page.goto(AI_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(300);
  await typeIn(page, '#weird-composer-xyz', 'key sk-proj-abcdefghijklmnopqrstuvwxyz1234567890');
  await page.click('#send2');
  await page.waitForSelector(DIALOG, { timeout: 4000 });
  assert((await dialogTitle(page)) === 'Submission Blocked',
    'selector drift must not silently disable enforcement');
  assert((await sentLines(page)).length === 0, 'message sent despite BLOCK');
  await clickDialog(page, 'btn-cancel');
});

await test('password <input> is ignored so login forms keep working', async () => {
  await page.goto(GENERIC_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(300);
  await page.fill('#pw', 'sup3r-s3cret-value');
  await page.focus('#pw');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  assert(!(await page.$(DIALOG)), 'password inputs must not trigger the dialog');
});

console.log('\nLIVE MARKUP (recon 2026-10-14: what the real sites serve today)');

await test('chatgpt.com textarea + aria-label send button -> BLOCK', async () => {
  await page.goto(GENERIC_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(300);
  await typeIn(page, '#mobile-composer-prompt', 'key sk-proj-abcdefghijklmnopqrstuvwxyz1234567890');
  await page.click('#chatgpt-send');
  await page.waitForSelector(DIALOG, { timeout: 4000 });
  assert((await dialogTitle(page)) === 'Submission Blocked', 'expected BLOCK on the live chatgpt markup');
  assert((await sentLines(page)).length === 0, 'message sent despite BLOCK');
  await clickDialog(page, 'btn-cancel');
});

await test('send button with an unrecognised selector -> still enforced (heuristic)', async () => {
  await page.goto(GENERIC_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(300);
  await typeIn(page, '#mystery-composer', 'key sk-proj-abcdefghijklmnopqrstuvwxyz1234567890');
  await page.click('#mystery-send');
  await page.waitForSelector(DIALOG, { timeout: 4000 });
  assert((await dialogTitle(page)) === 'Submission Blocked',
    'a redesigned send button must not silently disable enforcement');
  assert((await sentLines(page)).length === 0, 'message sent despite BLOCK');
  await clickDialog(page, 'btn-cancel');
});

await test('gemini-style contenteditable composer -> BLOCK on click and on Enter', async () => {
  await page.goto(GENERIC_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(300);
  await typeIn(page, '#gemini-box', 'key sk-proj-abcdefghijklmnopqrstuvwxyz1234567890');
  await page.click('#gemini-send');
  await page.waitForSelector(DIALOG, { timeout: 4000 });
  assert((await dialogTitle(page)) === 'Submission Blocked', 'expected BLOCK (click path)');
  await clickDialog(page, 'btn-cancel');

  await page.evaluate(() => { document.getElementById('gemini-box').innerText = ''; });
  await typeIn(page, '#gemini-box', 'sk-proj-abcdefghijklmnopqrstuvwxyz1234567890');
  await page.keyboard.press('Enter');
  await page.waitForSelector(DIALOG, { timeout: 4000 });
  assert((await dialogTitle(page)) === 'Submission Blocked', 'expected BLOCK (Enter path)');
  await clickDialog(page, 'btn-cancel');
});

await test('perplexity-style #ask-input composer -> BLOCK', async () => {
  await page.goto(GENERIC_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(300);
  await typeIn(page, '#ask-input', 'key sk-proj-abcdefghijklmnopqrstuvwxyz1234567890');
  await page.click('#perplexity-send');
  await page.waitForSelector(DIALOG, { timeout: 4000 });
  assert((await dialogTitle(page)) === 'Submission Blocked', 'expected BLOCK on perplexity markup');
  assert((await sentLines(page)).length === 0, 'message sent despite BLOCK');
  await clickDialog(page, 'btn-cancel');
});

console.log('\nINPUT METHODS (every way a secret can enter a composer)');

await test('drag-and-drop of an email -> redacted in the composer', async () => {
  await page.goto(GENERIC_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(300);

  // Focus first: a real drop only inserts into a focused composer.
  await page.click('#mystery-composer');

  // A real DataTransfer carrying real text. A synthetic event with no payload
  // would prove nothing.
  await page.evaluate(() => {
    const dt = new DataTransfer();
    dt.setData('text/plain', 'mail me at ops@corp-example.com today');
    const composer = document.getElementById('mystery-composer');
    composer.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
    composer.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
  });
  await page.waitForTimeout(500);

  const text = await page.evaluate(() => document.getElementById('mystery-composer').innerText);
  assert(!text.includes('ops@corp-example.com'), `dropped email survived: "${text}"`);
  assert(text.includes('[EMAIL]'), `dropped email was not redacted (composer holds: "${text.slice(0, 120)}")`);
});

await test('drag-and-drop of an API key -> survives the composer but is BLOCKed on send', async () => {
  // Same semantics as paste: only REDACT types are rewritten in the composer.
  // BLOCK types are caught at send time, which is the point of this test.
  await page.goto(GENERIC_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(300);
  await page.click('#mystery-composer');
  await page.evaluate(() => {
    const dt = new DataTransfer();
    dt.setData('text/plain', 'key sk-proj-abcdefghijklmnopqrstuvwxyz1234567890');
    document.getElementById('mystery-composer').dispatchEvent(
      new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
  });
  await page.waitForTimeout(400);
  await page.click('#mystery-send');
  await page.waitForSelector(DIALOG, { timeout: 4000 });
  assert((await dialogTitle(page)) === 'Submission Blocked',
    'a dropped API key must still be blocked on send');
  await clickDialog(page, 'btn-cancel');
});

await test('drag-and-drop of a card number -> still caught on send', async () => {
  await page.goto(GENERIC_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(300);
  await page.click('#mystery-composer');
  await page.evaluate(() => {
    const dt = new DataTransfer();
    dt.setData('text/plain', 'my card is 4111111111111111');
    document.getElementById('mystery-composer').dispatchEvent(
      new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
  });
  await page.waitForTimeout(400);
  await page.click('#mystery-send');
  await page.waitForSelector(DIALOG, { timeout: 4000 });
  assert((await dialogTitle(page)) === 'Sensitive Data Detected',
    'a dropped card number must still be caught on send');
  await clickDialog(page, 'btn-cancel');
});

await test('typing then clicking send is enforced (no paste, no drop)', async () => {
  await page.goto(GENERIC_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(300);
  await typeIn(page, '#mobile-composer-prompt', 'sk-proj-abcdefghijklmnopqrstuvwxyz1234567890');
  await page.click('#chatgpt-send');
  await page.waitForSelector(DIALOG, { timeout: 4000 });
  assert((await dialogTitle(page)) === 'Submission Blocked', 'typed-then-sent must be blocked');
  assert((await sentLines(page)).length === 0, 'message sent despite BLOCK');
  await clickDialog(page, 'btn-cancel');
});

await test('a 50,000-character paste is scanned and the tab stays responsive', async () => {
  await page.goto(GENERIC_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(300);

  // An EMAIL (a REDACT type) is the measurable outcome here: BLOCK types are
  // caught at send time instead, so a card number would legitimately survive
  // the paste itself.
  const bigText = `${'lorem ipsum dolor sit amet '.repeat(2000)} ping ops@corp-example.com now`;
  await page.click('#prompt');
  await page.evaluate(async (text) => { await navigator.clipboard.writeText(text); }, bigText);
  await page.keyboard.press('Control+V');
  await page.waitForTimeout(800);

  const val = await page.inputValue('#prompt');
  assert(
    val.includes('[EMAIL]'),
    `the email inside a huge paste was not redacted (length ${val.length}, tail: "${val.slice(-80)}")`
  );
  assert(val.length > 40000, `paste looks truncated: ${val.length} chars`);

  const elapsed = await page.evaluate(() => {
    const started = performance.now();
    document.getElementById('prompt').focus();
    return performance.now() - started;
  });
  assert(elapsed < 250, `tab became unresponsive after a large paste (${elapsed.toFixed(0)}ms)`);
});

console.log('\nPRIVACY (source-level invariants)');
const bgSrc = readFileSync(resolve(HERE, '..', 'src', 'background.ts'), 'utf8');
await test('REPORT_EVENT never forwards raw text', () => {
  assert(/CRITICAL PRIVACY/.test(bgSrc), 'privacy guard comment missing (was edited?)');
  assert(/request\.payload/.test(bgSrc), 'payload read missing');
  assert(!/payload\.text|payload\.content/.test(bgSrc), 'background must not read text/content');
  return Promise.resolve();
});

// ---------------------------------------------------------------------------
// LOGGED IN: policy fetch + event reporting against a real Supabase stack.
// Skipped (with a notice, still exit 0) when the service key is unavailable.
// ---------------------------------------------------------------------------
console.log('\nLOGGED IN (real Supabase: policy fetch + event reporting)');

const WEB_ENV_PATH = resolve(HERE, '..', '..', 'web', '.env.local');
function parseEnv(file) {
  const out = {};
  if (!existsSync(file)) return out;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

const webEnv = parseEnv(WEB_ENV_PATH);
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || parseEnv(resolve(HERE, '..', '.env')).VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || webEnv.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY || SUPABASE_URL.includes('placeholder')) {
  console.log('  SKIP  no local Supabase stack (set SUPABASE_SERVICE_ROLE_KEY and a real VITE_SUPABASE_URL)');
} else {
  const ADMIN = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' };

  async function adminPost(path, body, extra = {}) {
    const res = await fetch(`${SUPABASE_URL}${path}`, {
      method: 'POST',
      headers: { ...ADMIN, ...extra },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error(`${path} -> ${res.status} ${await res.text()}`);
    // return=minimal replies carry no body.
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }

  async function adminGet(path) {
    const res = await fetch(`${SUPABASE_URL}${path}`, { headers: ADMIN });
    if (!res.ok) throw new Error(`${path} -> ${res.status} ${await res.text()}`);
    return res.json();
  }

  async function adminDelete(path) {
    const res = await fetch(`${SUPABASE_URL}${path}`, { method: 'DELETE', headers: ADMIN });
    if (!res.ok) throw new Error(`DELETE ${path} -> ${res.status} ${await res.text()}`);
  }

  let tenant = null;

  await test('provisioning: user + company + profile + policy rows', async () => {
    const email = `e2e-${Date.now()}@example.com`;
    const password = `E2e!${Math.random().toString(36).slice(2, 12)}9z`;

    const created = await adminPost('/auth/v1/admin/users', { email, password, email_confirm: true });
    const userId = created.id || created.user?.id;
    assert(userId, `no user id returned: ${JSON.stringify(created).slice(0, 200)}`);

    const company = await adminPost('/rest/v1/companies', { name: 'E2E Co' }, { Prefer: 'return=representation' });
    const companyId = company[0].id;

    // The auth.users trigger already created the profile row, so this is an
    // upsert rather than an insert.
    await adminPost('/rest/v1/profiles', { id: userId, company_id: companyId, role: 'admin' },
      { Prefer: 'resolution=merge-duplicates,return=minimal' });
    await adminPost('/rest/v1/subscriptions', {
      company_id: companyId, plan: 'trial', status: 'trialing', seat_limit: 25,
    }, { Prefer: 'resolution=merge-duplicates,return=minimal' });
    await adminPost('/rest/v1/policies', [
      { company_id: companyId, data_type: 'API_KEY', action: 'BLOCK' },
      { company_id: companyId, data_type: 'EMAIL', action: 'REDACT' },
    ], { Prefer: 'resolution=merge-duplicates,return=minimal' });

    tenant = { email, password, userId, companyId };
  });

  if (tenant) {
    const extensionId = worker.url().split('/')[2];
    const popup = await context.newPage();
    popup.on('pageerror', (e) => console.log('        [popup error]', e.message));
    popup.on('console', (m) => {
      if (m.type() === 'error') console.log('        [popup console]', m.text().slice(0, 200));
    });
    popup.on('requestfailed', (r) =>
      console.log('        [popup request failed]', r.url().slice(0, 120), r.failure()?.errorText));

    await test('popup login succeeds and shows the company policy', async () => {
      // The profile directory is reused between runs, so a session left over from
      // a previous (now deleted) test user must be cleared first: auth-js tries to
      // refresh that dead token before signing in and reports "Failed to fetch".
      await popup.goto(`chrome-extension://${extensionId}/popup.html`, { waitUntil: 'domcontentloaded' });
      await popup.waitForSelector('input[type="email"]', { timeout: 10000 });
      await popup.evaluate(
        () => new Promise((resolve) => chrome.runtime.sendMessage({ type: 'LOGOUT' }, () => resolve(null)))
      );
      await popup.reload({ waitUntil: 'domcontentloaded' });
      await popup.waitForSelector('input[type="email"]', { timeout: 10000 });

      await popup.fill('input[type="email"]', tenant.email);
      await popup.fill('input[type="password"]', tenant.password);
      await popup.click('button:has-text("Log In")');
      await popup.waitForTimeout(3000);

      const summary = await popup.evaluate(() => document.body.innerText);
      assert(/Sync Policy/.test(summary),
        `popup did not reach the signed-in state: ${summary.replace(/\n+/g, ' | ')}`);
      assert(/API KEY/.test(summary) && /BLOCK/.test(summary),
        `company policy not displayed in popup: ${summary.replace(/\n+/g, ' | ')}`);
    });

    await test('BLOCK on chatgpt.com is reported to the database as metadata only', async () => {
      const p = await newPage(AI_URL);
      await typeIn(p, '#prompt-textarea', 'here is my key sk-proj-abcdefghijklmnopqrstuvwxyz1234567890');
      await p.click('#send');
      await p.waitForSelector(DIALOG, { timeout: 5000 });
      await clickDialog(p, 'btn-cancel');
      await p.close();

      // The insert happens in the service worker; give PostgREST a moment.
      let rows = [];
      for (let i = 0; i < 20; i++) {
        rows = await adminGet(
          `/rest/v1/events?select=*&company_id=eq.${tenant.companyId}&order=created_at&limit=10`);
        if (rows.length > 0) break;
        await new Promise((r) => setTimeout(r, 250));
      }

      assert(rows.length > 0, 'no event row reached the database');
      const blocked = rows.find((r) => r.data_type === 'API_KEY' && r.action === 'BLOCK');
      assert(blocked, `expected an API_KEY/BLOCK event, got ${JSON.stringify(rows)}`);
      assert(blocked.ai_tool === 'chatgpt.com', `hostname not recorded: ${blocked.ai_tool}`);

      const columns = Object.keys(blocked);
      const allowed = ['id', 'company_id', 'user_id', 'ai_tool', 'data_type', 'action', 'count', 'created_at'];
      const extra = columns.filter((c) => !allowed.includes(c));
      assert(extra.length === 0, `unexpected columns on events row: ${extra.join(', ')}`);
      const serialized = JSON.stringify(blocked);
      assert(!serialized.includes('sk-proj-') && !serialized.includes('abcdefghijklmnopqrstuvwxyz'),
        'the detected secret reached the database');
    });

    await test('REDACT-only policy comes from the backend, not the hard-coded default', async () => {
      const p = await newPage(GENERIC_URL);
      await typeIn(p, '#prompt', 'write to jane.doe@corp-example.com please');
      await p.click('#submitBtn');
      await p.waitForTimeout(500);
      const sent = await sentLines(p);
      assert(sent[0]?.includes('[EMAIL]'), `email was not redacted: ${sent[0]}`);
      await p.close();
    });

    await test('cleanup: tenant removed', async () => {
      await adminDelete('/rest/v1/companies?id=eq.' + tenant.companyId);
      const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${tenant.userId}`, {
        method: 'DELETE', headers: ADMIN,
      });
      assert(res.ok, `could not delete test user: ${res.status}`);
    });
  }
}

await context.close();
server.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
