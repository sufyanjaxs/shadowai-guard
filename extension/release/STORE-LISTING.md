# Store submission pack — ShadowAI Guard

Everything Edge Add-ons and the Chrome Web Store ask for, written out so you can
paste it rather than retype it. Both stores are reviewed by automated checks that
compare your answers against the manifest, so **answer honestly and do not
understate the `<all_urls>` permission.** An honest justification passes; a vague
one gets rejected and costs a week.

---

## Package

| | |
|---|---|
| Zip | `extension/release/shadowai-guard-0.2.0-edge.zip` |
| Size | 115.5 KB |
| Built by | `node extension/scripts/package-store.mjs` |
| Screenshots | `extension/release/screenshots/` |

`manifest.json` is at the zip **root** and every entry uses **forward slashes**
(`Compress-Archive` writes backslashes, which both stores reject with "manifest
file is missing or unreadable"). The packaging script asserts both.

The script also decodes every JWT in the built bundle and refuses to package if it
finds a `service_role` key. The `anon` key is expected to be there — every
extension ships it and row level security is what protects the data.

---

## Short description (Edge max 150 chars)

```
Stops credit cards, API keys and personal data being pasted into ChatGPT, Gemini and any web form.
```

## Long description

```
ShadowAI Guard stops sensitive data leaving your company through AI tools.

Employees paste customer credit card numbers, API keys, national ID numbers and
personal contact details into ChatGPT, Gemini, Copilot and hundreds of other AI
sites every day. Once it is pasted, it is gone: the text is in someone else's
training pipeline and there is no recall button.

ShadowAI Guard checks what you are about to send BEFORE it leaves. When it finds
something sensitive it stops the message and gives the sender a choice:

  Redact & Send   replaces the sensitive part with a placeholder and sends safely
  Send Anyway     sends it unchanged, and records that it happened
  Cancel          discards the message

Nothing is ever sent to us. Detection runs entirely inside your browser.

WHAT IT CATCHES
  Credit and debit card numbers
  API keys, tokens and private keys
  Emirates ID and similar national ID numbers
  IBANs and bank account numbers
  Email addresses and phone numbers
  Passwords
  Your own custom keywords

WORKS EVERYWHERE, NOT JUST CHATGPT
The extension works on any site, including AI tools that launch after installation.
If the page's controls change shape, a fallback path still catches the send.
Paste, typing, drag-and-drop and the Enter key are all covered.

YOUR POLICY, NOT OURS
An administrator sets the rule for each data type: warn, redact, or block. Changes
sync to the extension, so one person can enforce the whole company's policy.

PRIVACY
  Detection is 100% local. We never receive the text you type or paste.
  We store only anonymised event metadata so an administrator can see risk trends:
  which site, which data type, which action, and a count. No message content.
  Detection runs on a local copy of your policy and never uploads it for scanning.
```

---

## Answers the review forms ask for

### Why does this extension need `<all_urls>`?

> Sensitive data leaks into any AI chat interface, not a fixed list of sites. There
> are hundreds of AI tools and new ones launch constantly; a fixed host list would
> miss most of them. The extension attaches a lightweight content script to every
> page, watches only the composer's text at the moment of sending, and does nothing
> until a send is attempted. It reads no page content at any other time, and it
> transmits no user content under any circumstance.

### What data does the extension collect or transmit?

| | |
|---|---|
| **User content (typed/pasted text)** | **Never collected, never transmitted.** Enforced by a source-level test in CI (`REPORT_EVENT` is asserted not to forward raw text). |
| Event metadata | Site host, detected data type, action taken, occurrence count, timestamp, company id, user id |
| Personal information | Work email address (used to sign in and attribute events to your workspace) |
| Web browsing activity | Only the host of a page where a send was blocked/redacted, and only if your administrator's policy is enabled |
| Credentials | Supabase anon key (public, ships in every extension; row level security enforces access) |

### Why does it need the `storage` permission?

> To cache your company's policy locally so detection works offline and instantly,
> and to hold your sign-in session so you are not re-authenticating on every page.
> Stored data is cleared on sign-out.

### Single purpose statement

> Prevent sensitive company data from being submitted to AI tools and web forms,
> and record anonymised metadata so an administrator can see and reduce the risk.

### Privacy policy URL (required)

```
https://web-nu-sage-7afd8st5y4.vercel.app/privacy
```

The page must show a working contact address. It reads `NEXT_PUBLIC_SUPPORT_EMAIL`,
currently `sufyankhan.098up@gmail.com`.

---

## Edge Add-ons (free)

1. <https://partnercenter.microsoft.com> → **Edge Add-ons** → create a package.
2. Upload `shadowai-guard-0.2.0-edge.zip`.
3. Paste the short description, long description and answers above.
4. Support email: `sufyankhan.098up@gmail.com`.
5. Privacy URL as above. Category: **Productivity**.
6. Publish as **unlisted** first, install it yourself from the store, run one real
   send against production, then flip it to public.

Review is typically a few days. It is free, and the package is the same Chromium
extension Chrome uses — Chrome users can add Edge Add-ons as a source.

## Chrome Web Store ($5 one-time, only once there is revenue)

Same package, same copy. <https://chrome.google.com/webstore/devconsole> →
"Upload new item". The privacy-practices form has more questions — the table above
answers all of them. Include at least one screenshot showing the blocked-send
dialog.

---

## Checklist before you submit

- [ ] Bump `version` in `extension/manifest.json` for every upload (stores reject a re-upload of the same version)
- [ ] `pnpm build:ext` then `node extension/scripts/package-store.mjs --force`
- [ ] Confirm the privacy page renders a real contact address on the live site
- [ ] Publish **unlisted**, install from the store, sign in, and trigger one real block
- [ ] Only then make it public