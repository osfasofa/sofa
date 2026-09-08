# Browser runs

Acceptance against the real page in a real browser, driven through the page's
`__sofa` probe. Not part of `npm test` — they need a running dev server and a
browser. One suite per increment of docs/PLAN.md.

```bash
just dev                                  # vite with the isolation headers, on :5173
node tests/browser/skeleton.mjs           # S0: the turntable boots, lands a record, scratches, refuses
```

Rules, inherited from syrup's suites and kept because each one cost a session:

- **Use `127.0.0.1`, not `localhost`**, when the dev server was started from a
  sandboxed shell — vite binds one of the two and a browser outside the sandbox
  cannot reach the other.
- Real Chrome by default (`channel: 'chrome'`, headed). On a box without it,
  `SK_HEADLESS=1 SK_CHROMIUM=/path/to/chrome` runs playwright's chromium headless.
- Contexts auto-deny permission prompts: pass `permissions` when a suite needs
  the mic (none does yet).
- Never await page promises inside `evaluate`; flag-poll instead.
- Hidden tabs throttle rAF: drive `__sofa.frame(now)` by hand where a step
  depends on frames.
- Suites seed state through `localStorage` in `addInitScript` (`sofa.name`
  once S1 lands); there is no product backdoor for tests.
- Two-context suites on the real relay (S1 on): a sender should linger ~10 s
  after its last wind or the relay misses it.
