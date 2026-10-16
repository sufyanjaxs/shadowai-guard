/**
 * Builds a store-submission package from extension/dist.
 *
 * A store upload must contain manifest.json at the ROOT of the zip, not inside a
 * folder, and developer mode must be off. Both are easy to get wrong by zipping the
 * folder itself, so this asserts the shape rather than trusting it.
 *
 *   node extension/scripts/package-store.mjs            -> dist/shadowai-guard-<version>-edge.zip
 *   node extension/scripts/package-store.mjs --force    -> rebuild even if the zip is current
 */
import { existsSync, readFileSync, rmSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { createHash } from 'node:crypto';

const HERE = dirname(fileURLToPath(import.meta.url));
const EXT = resolve(HERE, '..');
const DIST = join(EXT, 'dist');
const force = process.argv.includes('--force');

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  process.exit(2);
}

if (!existsSync(join(DIST, 'manifest.json'))) {
  fail('extension/dist/manifest.json is missing. Run `pnpm build:ext` first.');
}

const manifest = JSON.parse(readFileSync(join(DIST, 'manifest.json'), 'utf8'));

if (manifest.manifest_version !== 3) fail(`manifest_version must be 3, got ${manifest.manifest_version}`);
if (!manifest.version) fail('manifest has no version');
if (!manifest.name || !manifest.description) fail('manifest is missing name or description');

// A store rejects a package whose declared icons are not actually shipped.
const declaredIcons = Object.values(manifest.icons || {});
for (const icon of declaredIcons) {
  if (!existsSync(join(DIST, icon))) fail(`manifest declares icon "${icon}" but it is not in dist`);
}

// The background entry must exist or the extension registers and then does nothing.
const bg = manifest.background?.service_worker;
if (!bg || !existsSync(join(DIST, bg))) fail(`background service_worker "${bg}" is not in dist`);

for (const cs of manifest.content_scripts || []) {
  for (const js of cs.js || []) {
    if (!existsSync(join(DIST, js))) fail(`content script "${js}" is not in dist`);
  }
}

// Never ship secrets to a store listing, where anyone can unpack the zip.
//
// The anon key is EXPECTED to be in here - every browser extension ships it and
// row level security is what actually protects the data. What must never ship is a
// service_role key, because it bypasses RLS completely. So a JWT is decoded and its
// role checked, rather than pattern-matching every token-shaped string.
const JWT = /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g;

function jwtRole(token) {
  try {
    const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = JSON.parse(Buffer.from(part + '='.repeat((4 - (part.length % 4)) % 4), 'base64').toString('utf8'));
    return json.role ?? null;
  } catch {
    return null;
  }
}

const bundleDir = join(DIST, 'assets');
const { readdirSync, readFileSync: read } = await import('node:fs');
const SECRET_VALUE_PATTERNS = [
  { name: 'stripe live key', re: /sk_live_[A-Za-z0-9]{16,}/g },
  { name: 'stripe webhook secret', re: /whsec_[A-Za-z0-9]{16,}/g },
  { name: 'resend key', re: /re_[A-Za-z0-9_-]{16,}/g },
];

let scanned = 0;
let anonKeys = 0;
for (const f of readdirSync(bundleDir)) {
  if (!f.endsWith('.js')) continue;
  const text = read(join(bundleDir, f), 'utf8');
  scanned++;

  for (const { name, re } of SECRET_VALUE_PATTERNS) {
    if (text.match(re)) fail(`dist/assets/${f} appears to contain a ${name} - a secret would be published`);
  }

  for (const token of text.match(JWT) || []) {
    const role = jwtRole(token);
    if (role === 'service_role') {
      fail(`dist/assets/${f} contains a SERVICE_ROLE key. It bypasses RLS and must never be shipped.`);
    }
    if (role === 'anon') anonKeys++;
  }
}
if (scanned === 0) fail('no bundles found in dist/assets - did the build produce output?');
if (anonKeys === 0) console.warn('WARN: no anon key found in the bundles - is the extension pointed at a real project?');

// Output lives OUTSIDE dist. Writing the zip into dist makes the recursive glob
// pick up the zip it is currently writing and fail on a file lock.
const RELEASE = join(EXT, 'release');
if (!existsSync(RELEASE)) mkdirSync(RELEASE);
const out = join(RELEASE, `shadowai-guard-${manifest.version}-edge.zip`);
if (existsSync(out) && !force) {
  console.log(`Already packaged and current: ${out}`);
  console.log('Re-run with --force to rebuild.');
  process.exit(0);
}
if (existsSync(out)) rmSync(out);

// Built with .NET's ZipArchive rather than `Compress-Archive`, because PowerShell 5.1
// writes entry names with BACKSLASHES ("assets\background.js"). Both stores then
// reject the upload with "manifest.json is missing or unreadable" even though the zip
// opens fine in Explorer. Zip entry names must always use forward slashes.
const ps = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$src = '${DIST.replace(/'/g, "''")}'
$dst = '${out.replace(/'/g, "''")}'
$zip = [System.IO.Compression.ZipFile]::Open($dst, 'Create')
try {
  Get-ChildItem -LiteralPath $src -Recurse -File | ForEach-Object {
    $rel = $_.FullName.Substring($src.Length).TrimStart('\\','/')
    $name = $rel -replace '\\\\', '/'
    [void][System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
      $zip, $_.FullName, $name, [System.IO.Compression.CompressionLevel]::Optimal)
  }
} finally { $zip.Dispose() }
`;

execFileSync('powershell', ['-NoProfile', '-Command', ps], { stdio: 'inherit' });

// Verify the shape rather than trusting it: forward slashes, manifest at the root.
const { readdirSync: readdir2 } = await import('node:fs');
const zipPath = out;
const bytes = readFileSync(zipPath);
const sha = createHash('sha256').update(bytes).digest('hex');

// Read the central directory back through .NET to list real entry names.
const listPs = `
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead('${zipPath.replace(/'/g, "''")}')
$zip.Entries | ForEach-Object { $_.FullName }
$zip.Dispose()
`;
const entries = execFileSync('powershell', ['-NoProfile', '-Command', listPs], { encoding: 'utf8' })
  .split(/\r?\n/)
  .map((s) => s.trim())
  .filter(Boolean);

if (!entries.includes('manifest.json')) {
  fail(`manifest.json is not at the zip root. Entries: ${entries.join(', ')}`);
}
const bad = entries.filter((e) => e.includes('\\'));
if (bad.length) fail(`zip entries contain backslashes: ${bad.join(', ')}`);

console.log(`ZIP ENTRIES (${entries.length}):`);
for (const e of entries) console.log(`  ${e}`);

console.log(`
PACKAGED
  name        ${manifest.name} ${manifest.version}
  file        ${out}
  size        ${(bytes.length / 1024).toFixed(1)} KB
  sha256      ${sha}
  root        manifest.json is at the zip root (required by both stores)

Edge Add-ons: https://partnercenter.microsoft.com -> Edge Add-ons -> Upload new package
Chrome Web Store: https://chrome.google.com/webstore/devconsole (one-time $5 developer fee)
`);