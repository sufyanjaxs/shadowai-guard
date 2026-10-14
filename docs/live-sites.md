# Live AI sites — observed markup

Snapshot taken **14 Oct 2026** by `node extension/e2e/recon-live-sites.mjs` against the
real sites in a real browser. `extension/src/config.ts` is keyed off this file; when a
site redesigns, re-run the recon script and update the config from the output.

## What was observed

| Site | Composer (input) | Send control | Status |
|---|---|---|---|
| `chatgpt.com` | `textarea#mobile-composer-prompt` with `aria-label="Chat with ChatGPT"`, placeholder `Ask ChatGPT` | `button[aria-label="Send message"]` | **changed** — `data-testid="send-button"` no longer exists |
| `gemini.google.com` | `div[contenteditable][role="textbox"][aria-label="Enter a prompt for Gemini"]` (two nodes) | icon-only, no send-ish label found | changed — `rich-textarea` gone |
| `perplexity.ai` | `div#ask-input[contenteditable][role="textbox"]` (two nodes) | not found by label scan | newly supported |
| `claude.ai` | — | — | **not verified**: logged-out visits hit an hCaptcha interstitial |
| `copilot.microsoft.com` | — | only `Go to Chat` / `Go to Search` buttons | **not verified**: login wall |
| `chat.deepseek.com` | — | — | **not verified**: HTTP 202 bot wall |

## The bug this found

`chatgpt.com` used to match `button[data-testid="send-button"]`. That attribute is gone.
The click path was `if (!site.submitSelectors.some(...)) return;` — so **clicking send
on ChatGPT stopped being enforced with no error anywhere**. Enter-to-send still worked,
which made it look healthy.

Three layers now prevent a repeat:

1. **Fallback chains.** Every selector list is ordered and has several entries, so one
   renamed attribute no longer disarms enforcement.
2. **A structural heuristic.** If no configured selector matches, any button that
   carries a send-ish label, or that shares a container (`form`, `section`,
   `[class*="composer"]`, `[role="group"]`) with a monitored composer, is treated as a
   send control. A false positive is harmless: the composer is scanned and nothing
   happens unless a secret is present.
3. **A regression test.** `extension/e2e/run-e2e.mjs` has a "live markup" section that
   reproduces today's real selectors, including a send button matching *no* known
   selector.

## Known gap (honest status)

The three sites marked **not verified** could not be inspected without a logged-in
account. Their composers may have changed in ways we cannot see. Treat them as
best-effort until someone with an account re-runs the recon with cookies.

## Turning this into an early-warning system

`recon-live-sites.mjs` is already the canary: run it on a schedule, diff the output
against this file, and you learn about a redesign within hours instead of finding out
from a customer. Wiring that into GitHub Actions with an alerting step is backlog item
20.