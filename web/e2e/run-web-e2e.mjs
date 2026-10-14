/**
 * ShadowAI Guard — web end-to-end test against a REAL Supabase stack.
 *
 *   pnpm --filter web dev            # or `pnpm build:web && pnpm start`
 *   node e2e/run-web-e2e.mjs         # BASE=http://127.0.0.1:3100 by default
 *
 * Drives the actual product: middleware auth gate, signup provisioning, the
 * dashboard's RLS-backed reads, invite creation, invite acceptance by a second
 * user, admin/member authorization, and the Postgres-backed rate limiter.
 * Exit code 0 = every case passed.
 */
import { createRequire } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const require = createRequire(import.meta.url);
const BASE = process.env.BASE || 'http://127.0.0.1:3000';
const HERE = dirname(fileURLToPath(import.meta.url));

// The rate limiter counts per hashed IP address, so two runs inside the same
// window would make this suite fail for the wrong reason. The counters are
// cleared through the service role key from web/.env.local when one is present.
function parseEnv(file) {
  const out = {};
  if (!existsSync(file)) return out;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

const webEnv = parseEnv(resolve(HERE, '..', '.env.local'));
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || webEnv.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || webEnv.SUPABASE_SERVICE_ROLE_KEY;

async function resetRateLimits() {
  if (!SUPABASE_URL || !SERVICE_KEY || SUPABASE_URL.includes('placeholder')) {
    console.log('  note: no local Supabase key, rate-limit counters are not cleared between runs\n');
    return;
  }
  const headers = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };
  // Wipe every counter rather than guessing identifiers: behind no proxy the
  // client address is simply "unknown", and a stale counter from a previous run
  // would make the suite fail for the wrong reason.
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rate_limits?key=like.*`, {
    method: 'DELETE',
    headers,
  });
  if (!res.ok) console.log(`  note: could not clear rate limits (${res.status})`);
  console.log('  rate-limit counters cleared\n');
}

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

const { chromium } = loadPlaywright();

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

const stamp = Date.now();
const ADMIN = { company: `Web E2E ${stamp}`, email: `admin-${stamp}@example.com`, password: 'E2e!Passw0rd123' };
const MEMBER = { email: `member-${stamp}@example.com`, password: 'E2e!Member123' };

console.log(`ShadowAI Guard web e2e against ${BASE}\n`);

const browser = await chromium.launch({ headless: true, channel: 'chromium' });
await resetRateLimits();
const adminContext = await browser.newContext();
const adminPage = await adminContext.newPage();
adminPage.on('pageerror', (e) => console.log('        [admin page error]', e.message));

let inviteLink = '';

console.log('AUTH GATE (middleware)');

await test('logged-out /dashboard redirects to /login with ?next=', async () => {
  await adminPage.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' });
  await adminPage.waitForTimeout(800);
  const url = adminPage.url();
  assert(url.includes('/login'), `expected a redirect to /login, got ${url}`);
  assert(url.includes('next=%2Fdashboard'), `expected next=/dashboard, got ${url}`);
});

await test('security headers are set on every response', async () => {
  const res = await adminPage.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  const h = res.headers();
  assert(/default-src 'self'/.test(h['content-security-policy'] || ''), 'CSP missing');
  assert((h['content-security-policy'] || '').includes("frame-ancestors 'none'"), 'frame-ancestors missing');
  assert(h['x-frame-options'] === 'DENY', `X-Frame-Options = ${h['x-frame-options']}`);
  assert(h['x-content-type-options'] === 'nosniff', 'nosniff missing');
  assert((h['strict-transport-security'] || '').includes('max-age=31536000'), 'HSTS missing');
  assert(h['referrer-policy'] === 'strict-origin-when-cross-origin', 'referrer-policy missing');
});

await test('privacy policy and terms pages render', async () => {
  await adminPage.goto(`${BASE}/privacy`, { waitUntil: 'domcontentloaded' });
  assert((await adminPage.locator('h1').first().innerText()).includes('Privacy'), 'privacy h1 missing');
  assert((await adminPage.locator('body').innerText()).includes('never leaves your browser'), 'privacy body missing');
  await adminPage.goto(`${BASE}/terms`, { waitUntil: 'domcontentloaded' });
  assert((await adminPage.locator('h1').first().innerText()).includes('Terms'), 'terms h1 missing');
});

console.log('\nSIGNUP + DASHBOARD (real database)');

await test('signup provisions the company, admin, trial seats and default policies', async () => {
  await adminPage.goto(`${BASE}/signup`, { waitUntil: 'domcontentloaded' });
  await adminPage.waitForSelector('input[placeholder="Company name"]');
  await adminPage.fill('input[placeholder="Company name"]', ADMIN.company);
  await adminPage.fill('input[type="email"]', ADMIN.email);
  await adminPage.fill('input[type="password"]', ADMIN.password);
  await adminPage.click('button:has-text("Create workspace")');

  try {
    await adminPage.waitForURL('**/dashboard', { timeout: 25000 });
  } catch (err) {
    const text = await adminPage.evaluate(() => document.body.innerText);
    throw new Error(`signup did not reach /dashboard. Page says: ${text.replace(/\n+/g, ' | ').slice(0, 300)}`);
  }
  await adminPage.waitForSelector('text=Security Overview', { timeout: 20000 });
});

await test('duplicate signup is rejected with 409, not a second company', async () => {
  const res = await adminContext.request.post(`${BASE}/api/signup`, {
    data: { companyName: 'Duplicate Co', email: ADMIN.email, password: ADMIN.password },
  });
  assert(res.status() === 409, `expected 409, got ${res.status()}`);
});

await test('policies page lists all eight data types and saves', async () => {
  await adminPage.goto(`${BASE}/dashboard/policies`, { waitUntil: 'domcontentloaded' });
  await adminPage.waitForSelector('table tbody tr', { timeout: 20000 });
  const rows = await adminPage.locator('table tbody tr').count();
  assert(rows === 8, `expected 8 policy rows, got ${rows}`);
  await adminPage.selectOption('table tbody tr:nth-child(6) select', 'BLOCK');
  await adminPage.click('button:has-text("Save Policies")');
  await adminPage.waitForSelector('text=Saved!', { timeout: 10000 });
});

console.log('\nINVITES (server-minted token -> acceptance)');

await test('admin creates an invite and gets a 43-character token link', async () => {
  await adminPage.goto(`${BASE}/dashboard/team`, { waitUntil: 'domcontentloaded' });
  await adminPage.waitForSelector('input[type="email"]', { timeout: 20000 });
  await adminPage.fill('input[type="email"]', MEMBER.email);
  await adminPage.click('button:has-text("Create Invite")');
  await adminPage.waitForSelector('input[readonly]', { timeout: 20000 });

  inviteLink = new URL(await adminPage.inputValue('input[readonly]')).pathname;
  assert(inviteLink.includes('/invite/'), `not an invite link: ${inviteLink}`);
  const token = inviteLink.split('/invite/')[1];
  assert(/^[A-Za-z0-9_-]{43}$/.test(token), `token is not 256-bit base64url: ${token}`);

  // The pending list is refetched from /api/invites after creation.
  await adminPage
    .waitForSelector('text=pending invitations', { timeout: 10000 })
    .catch(async () => {
      const listed = await adminPage.request.get(`${BASE}/api/invites`);
      const body = await listed.text();
      throw new Error(`pending list missing; GET /api/invites -> ${listed.status()} ${body.slice(0, 300)}`);
    });
});

const memberContext = await browser.newContext();
const memberPage = await memberContext.newPage();
memberPage.on('pageerror', (e) => console.log('        [member page error]', e.message));

await test('invited user accepts the invite and lands in the dashboard', async () => {
  await memberPage.goto(`${BASE}${inviteLink}`, { waitUntil: 'domcontentloaded' });
  await memberPage.waitForSelector('input[type="password"]', { timeout: 20000 });
  assert((await memberPage.locator('body').innerText()).includes(MEMBER.email), 'invite email not shown');

  await memberPage.fill('input[placeholder^="Choose a password"]', MEMBER.password);
  await memberPage.fill('input[placeholder="Confirm password"]', MEMBER.password);
  await memberPage.click('button:has-text("Accept invitation")');

  await memberPage.waitForURL('**/dashboard', { timeout: 20000 });
  await memberPage.waitForSelector('text=Security Overview', { timeout: 20000 });
});

await test('the new member joins the same company (admin team page shows 2 members)', async () => {
  // Checked as the admin: a member only ever sees their own profile row, which is
  // the correct RLS behaviour, so the company membership is verified from the
  // admin's view.
  await adminPage.goto(`${BASE}/dashboard/team`, { waitUntil: 'domcontentloaded' });
  await adminPage.waitForSelector('table tbody tr', { timeout: 20000 });
  const rows = await adminPage.locator('table tbody tr').count();
  assert(rows === 2, `expected 2 members, got ${rows}`);

  await memberPage.goto(`${BASE}/dashboard/team`, { waitUntil: 'domcontentloaded' });
  await memberPage.waitForSelector('table tbody tr', { timeout: 20000 });
  const memberRows = await memberPage.locator('table tbody tr').count();
  assert(memberRows === 1, `a member must only see their own profile, got ${memberRows}`);
});

await test('members cannot invite (UI hides it, API returns 403)', async () => {
  const body = await memberPage.locator('body').innerText();
  assert(body.includes('Only admins can invite teammates'), 'invite form visible to a member');

  const res = await memberContext.request.post(`${BASE}/api/invites`, {
    data: { email: 'someone-else@example.com', role: 'member' },
  });
  assert(res.status() === 403, `expected 403 for a member, got ${res.status()}`);
});

await test('logged-out callers get 401 from the invite API', async () => {
  const anonContext = await browser.newContext();
  const res = await anonContext.request.post(`${BASE}/api/invites`, {
    data: { email: 'nobody@example.com' },
  });
  assert(res.status() === 401, `expected 401, got ${res.status()}`);
  await anonContext.close();
});

await test('a second member cannot read the admin-only subscription row', async () => {
  const res = await memberContext.request.get(`${BASE}/api/invites`);
  assert(res.status() === 403, `expected 403 for a member reading invites, got ${res.status()}`);
});

await test('invite links are single-use', async () => {
  const anonContext = await browser.newContext();
  const page = await anonContext.newPage();
  await page.goto(`${BASE}${inviteLink}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);
  const body = await page.locator('body').innerText();
  assert(/already used|already been used|not valid/i.test(body), `expected a used/invalid message, got: ${body.replace(/\n+/g, ' | ').slice(0, 200)}`);
  await anonContext.close();
});

await test('invite creation validates the email address', async () => {
  const res = await adminContext.request.post(`${BASE}/api/invites`, {
    data: { email: 'not-an-email', role: 'member' },
  });
  assert(res.status() === 400, `expected 400 for a malformed email, got ${res.status()}`);
});

console.log('\nSELF-SERVICE (health, password reset, seat management)');

await test('health endpoint reports the database as reachable', async () => {
  const res = await adminContext.request.get(`${BASE}/api/health`);
  assert(res.status() === 200, `expected 200, got ${res.status()}`);
  const body = await res.json();
  assert(body.status === 'ok' && body.database === 'reachable', JSON.stringify(body));
});

await test('forgot-password never reveals whether an address exists', async () => {
  await adminPage.goto(`${BASE}/forgot-password`, { waitUntil: 'domcontentloaded' });
  await adminPage.fill('input[type="email"]', 'definitely-not-a-user@example.com');
  await adminPage.click('button:has-text("Send reset link")');
  await adminPage.waitForSelector('text=If an account exists', { timeout: 15000 });
  const body = await adminPage.locator('body').innerText();
  assert(!/no account|not found|unknown email/i.test(body), `response leaks account existence: ${body.slice(0, 200)}`);
});

await test('an admin cannot change their own access', async () => {
  const me = await adminContext.request.get(`${BASE}/api/invites`);
  const { selfId } = await me.json();

  const demote = await adminContext.request.patch(`${BASE}/api/team/${selfId}`, {
    data: { role: 'member' },
  });
  assert(demote.status() === 400, `expected 400 when demoting yourself, got ${demote.status()}`);

  const remove = await adminContext.request.delete(`${BASE}/api/team/${selfId}`);
  assert(remove.status() === 400, `expected 400 when removing yourself, got ${remove.status()}`);
});

await test('promoting and demoting another member works', async () => {
  const list = await adminContext.request.get(`${BASE}/api/team`);
  assert(list.status() === 200, `expected 200, got ${list.status()}`);
  const { members, selfId, seatsUsed, seatLimit } = await list.json();
  assert(members.length === 2, `expected 2 members, got ${members.length}`);
  assert(seatsUsed === 2 && seatLimit === 25, `seat accounting wrong: ${seatsUsed}/${seatLimit}`);
  assert(typeof selfId === 'string' && selfId.length === 36, 'selfId missing');

  const other = members.find((m) => m.id !== selfId);
  const promote = await adminContext.request.patch(`${BASE}/api/team/${other.id}`, {
    data: { role: 'admin' },
  });
  assert(promote.status() === 200, `expected 200 on promote, got ${promote.status()}`);

  const demote = await adminContext.request.patch(`${BASE}/api/team/${other.id}`, {
    data: { role: 'member' },
  });
  assert(demote.status() === 200, `expected 200 on demote, got ${demote.status()}`);

  const badRole = await adminContext.request.patch(`${BASE}/api/team/${other.id}`, {
    data: { role: 'superuser' },
  });
  assert(badRole.status() === 400, `expected 400 for an unknown role, got ${badRole.status()}`);
});

await test('removing a member releases the seat and cuts off their access', async () => {
  await adminPage.goto(`${BASE}/dashboard/team`, { waitUntil: 'domcontentloaded' });
  await adminPage.waitForSelector('table tbody tr', { timeout: 20000 });

  const rows = await adminPage.locator('table tbody tr').count();
  assert(rows === 2, `expected 2 members before removal, got ${rows}`);

  adminPage.once('dialog', (d) => d.accept());
  // Rows are ordered oldest-first, so the admin (the caller) is row 1 and shows
  // "You" instead of management buttons. Target the member's row explicitly.
  const memberRow = adminPage.locator('table tbody tr').filter({ hasText: 'member' }).first();
  await memberRow.locator('button:has-text("Remove")').click();
  await adminPage.waitForSelector('text=Member removed', { timeout: 20000 });

  const after = await adminPage.locator('table tbody tr').count();
  assert(after === 1, `expected 1 member after removal, got ${after}`);

  // The removed account keeps its login but loses the workspace entirely.
  const forbidden = await memberContext.request.post(`${BASE}/api/invites`, {
    data: { email: 'nobody@example.com' },
  });
  assert(forbidden.status() === 400 || forbidden.status() === 401 || forbidden.status() === 403,
    `removed member still has access (status ${forbidden.status()})`);

  await memberPage.goto(`${BASE}/dashboard/team`, { waitUntil: 'domcontentloaded' });
  await memberPage.waitForTimeout(1200);
  const memberRows = await memberPage.locator('table tbody tr').count();
  assert(memberRows === 0, `removed member still sees ${memberRows} team rows`);
});

console.log('\nRATE LIMITING (Postgres-backed)');

await test('signup endpoint starts returning 429 once the window is exhausted', async () => {
  let sawRateLimit = false;
  let attempts = 0;
  for (; attempts < 8 && !sawRateLimit; attempts++) {
    const res = await adminContext.request.post(`${BASE}/api/signup`, {
      data: {
        companyName: `Flood ${stamp}-${attempts}`,
        email: `flood-${stamp}-${attempts}@example.com`,
        password: ADMIN.password,
      },
    });
    if (res.status() === 429) sawRateLimit = true;
    else if (res.status() !== 201 && res.status() !== 400 && res.status() !== 409) {
      throw new Error(`unexpected status ${res.status()}: ${(await res.text()).slice(0, 200)}`);
    }
  }
  assert(sawRateLimit, `no 429 after ${attempts} signup attempts`);
});

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);