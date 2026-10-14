/**
 * Live-site selector recon.
 *
 *   node extension/e2e/recon-live-sites.mjs            # the six supported sites
 *   node extension/e2e/recon-live-sites.mjs chatgpt.com
 *
 * Loads each real AI site in a real browser and prints what its composer
 * actually looks like today: every text input, every contenteditable, and every
 * plausible send button, with the attributes we key off in extension/src/config.ts.
 * Run it after any AI site redesign, and paste the output into the config when a
 * selector has moved.
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const SITES = {
  'chatgpt.com': { path: '/' },
  'claude.ai': { path: '/' },
  'gemini.google.com': { path: '/app' },
  'copilot.microsoft.com': { path: '/' },
  'perplexity.ai': { path: '/' },
  'chat.deepseek.com': { path: '/' },
};

function loadPlaywright() {
  for (const c of [
    'playwright',
    'playwright-core',
    'C:/Users/Admin/.opencode/skills/autobroker-pro/node_modules/playwright-core',
  ]) {
    try {
      return require(c);
    } catch {
      /* next */
    }
  }
  throw new Error('Playwright not found.');
}

const only = process.argv[2];
const targets = only ? { [only]: SITES[only] } : SITES;

const { chromium } = loadPlaywright();
const browser = await chromium.launch({
  headless: true,
  channel: 'chromium',
  args: ['--disable-blink-features=AutomationControlled'],
});

const results = [];

for (const [host, cfg] of Object.entries(targets)) {
  const url = `https://${host}${cfg.path}`;
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36',
    locale: 'en-US',
  });
  const page = await context.newPage();

  const record = { host, url, status: null, blocked: false, inputs: [], buttons: [], error: null };

  try {
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    record.status = response?.status() ?? null;
    await page.waitForTimeout(6000);

    record.inputs = await page.evaluate(() => {
      const describe = (el) => ({
        tag: el.tagName.toLowerCase(),
        id: el.id || null,
        name: el.getAttribute('name'),
        testid: el.getAttribute('data-testid'),
        aria: el.getAttribute('aria-label'),
        role: el.getAttribute('role'),
        placeholder: el.getAttribute('placeholder'),
        contenteditable: el.getAttribute('contenteditable'),
        cls: (el.className || '').toString().slice(0, 80),
      });
      return [
        ...document.querySelectorAll('textarea'),
        ...document.querySelectorAll('[contenteditable="true"]'),
        ...document.querySelectorAll('div[role="textbox"]'),
        ...document.querySelectorAll('input[type="text"]'),
      ].map(describe);
    });

    record.buttons = await page.evaluate(() => {
      const sendish = /send|submit|ask|go/i;
      return [...document.querySelectorAll('button,[role="button"]')]
        .filter((b) => {
          const label = `${b.getAttribute('aria-label') || ''} ${b.getAttribute('data-testid') || ''} ${b.title || ''}`;
          return sendish.test(label);
        })
        .map((b) => ({
          tag: b.tagName.toLowerCase(),
          aria: b.getAttribute('aria-label'),
          testid: b.getAttribute('data-testid'),
          title: b.getAttribute('title'),
          disabled: b.hasAttribute('disabled'),
        }));
    });

    const title = await page.title();
    record.error = /just a moment|access denied|attention required|unusual traffic|verify you are human/i.test(title)
      ? `interstitial: "${title}"`
      : null;
    if (record.error) record.blocked = true;
  } catch (err) {
    record.error = err.message;
  }

  results.push(record);
  await context.close();
}

await browser.close();

for (const r of results) {
  console.log(`\n=== ${r.host} (${r.status ?? 'no response'}) ${r.url}`);
  if (r.error) console.log(`  PROBLEM: ${r.error}`);
  if (!r.inputs.length) console.log('  no composer found (login wall, or the markup changed)');
  for (const i of r.inputs) {
    console.log(
      `  INPUT  <${i.tag}> id=${i.id ?? '-'} testid=${i.testid ?? '-'} aria=${JSON.stringify(i.aria)} ` +
        `role=${i.role ?? '-'} ce=${i.contenteditable ?? '-'} ph=${JSON.stringify(i.placeholder ?? null)}`
    );
  }
  for (const b of r.buttons) {
    console.log(`  SEND   aria=${JSON.stringify(b.aria)} testid=${b.testid ?? '-'} title=${JSON.stringify(b.title)}`);
  }
  if (!r.buttons.length && !r.error) console.log('  no send-ish button found');
}

console.log(`\n${results.filter((r) => !r.error && r.inputs.length).length}/${results.length} sites exposed a composer to the scraper.`);