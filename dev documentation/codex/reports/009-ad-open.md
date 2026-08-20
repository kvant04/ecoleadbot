# Codex Report 009 — Ad deep-link `?elb_open=1`

## Files

- `widget/src/01-config.js` — bumped `WIDGET_VERSION` to `1.5.48`; added guarded `shouldOpenFromUrl()` query helper.
- `widget/src/22-init.js` — after `buildDom()` and inline CTA setup, opens the hidden overlay immediately for the ad deep-link, marks `autoTriggerUsed`, then installs the existing auto triggers.
- `app.js` — rebuilt deploy artifact with `py scripts/build_widget.py`.
- `dev documentation/codex/reports/009-ad-open.md` — this report.

## URL parameters

The immediate open is enabled only when either parameter has the exact value `1`:

- `elb_open=1`
- `ecoleadbot_open=1`

The helper only reads `location.search` through `URLSearchParams` inside `try/catch`. It does not rewrite the URL, so UTM and other query parameters remain intact. Without either exact parameter, initialization and normal auto-popup / exit-banner rules are unchanged.

## Popup attribution and behavior

The deep-link calls:

```js
openPopup("direct", "url_open", { resume: false });
```

Therefore `entry_type` is `direct`, `popup_trigger` is `url_open`, and the visible screen is intro rather than a saved mid-flow screen. This call is made directly and does not consult `inCooldown()`, so ad opens bypass cooldown. `autoTriggerUsed = true` prevents the later time/scroll trigger from reopening the popup. If the overlay is already open, the initialization guard does nothing extra.

## Version and build

- Previous version: `1.5.47`
- New version: `1.5.48`
- Build command: `py scripts/build_widget.py`
- Build result: `app.js` generated successfully from 27 fragments.

## Manual test checklist

- `index.html?elb_open=1&utm_source=manual`: expected immediate intro popup; query/UTM remains unchanged.
- `index.html?ecoleadbot_open=1`: expected immediate intro popup through the alias.
- `index.html` (clean load): expected popup remains closed initially and existing time/scroll/exit behavior remains in effect.

Generated-source verification passed for all three branches: both exact parameter checks are present, the deep-link path sets `autoTriggerUsed` and calls `direct` / `url_open` with `resume: false`, while the clean-load path falls through to the unchanged `setupAutoTriggers()`. A rendered browser check could not be completed in this environment: the in-app browser lacked required sandbox metadata, and installed Chrome/Edge redirected to an existing interactive session instead of producing headless DOM output.

No deploy, git commit, Bitrix template edit, landing-page change, or URL rewrite was performed.
