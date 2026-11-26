# rank-extension-ts

Add a voting system to social media platforms that cannot be influenced by Big Tech

## How does it work?

This browser extension integrates with existing social media platforms (e.g. X.com) in order to overlay an external voting system outside of the platform's control.

The votes are cast by burning [Lotus cryptocurrency](https://lotusia.org/faq). The extension has a built-in wallet that holds your Lotus. When you cast a vote on the social media platform, the extension will automatically burn the Lotus from your wallet in order to cast your vote with the positive sentiment (upvote) or negative sentiment (downvote).

Posts that have accummulated a negative reputation (i.e. more downvotes than upvotes) will automatically be blurred from immediate view. These posts can still be viewed if the user desires. For example, on X.com, a button is displayed over the blurred post that will navigate you to the post's page to see the full context of the post and all replies.

## Manual install

### Chrome-based Browsers

1. Download the `chrome-mv3.zip` file on the [Releases](https://github.com/LotusiaStewardship/rank-extension-ts/releases) page and extract the contents to your desktop
2. Open your Chromium-based browser
3. Type `chrome://extensions` in the URL field and press `Enter`
4. In the top-right corner of the extensions settings page, click the toggle to turn on **Developer mode**
5. Click the **Load unpacked** button, then browse to the folder you extracted to your desktop in Step 1
6. The extension should now be loaded

![image](https://github.com/user-attachments/assets/c81ed8ef-d5c2-4201-be9b-4b87703a9efc)

### Firefox

#### COMING SOON

### Safari

#### COMING SOON

## Styling

The popup consumes the Lotusia design model through `@lotusia/theme` and `@lotusia/ui`, both pinned at exactly `0.4.0`. `entrypoints/popup/app.css` carries the documented plain-Vue import chain and nothing else:

```css
@import "tailwindcss";
@import "@lotusia/theme";
@import "@lotusia/ui/base.css";
```

Tailwind v4 (via `@tailwindcss/vite` in `wxt.config.ts`) needs no config file, but the stylesheets do declare its sources: automatic source detection would scan every file Git does not ignore, so each stylesheet turns it off with `source(none)` and names its own sources with `@source` allowlists instead, and a utility-named word in prose or a script cannot add a rule to the built CSS. The old committed `entrypoints/popup/style.css` build artifact is gone: the build writes compiled CSS into `.output/` only. Flowbite and flowbite-vue have been removed; the popup uses plain markup, the model's semantic roles (`bg-surface`, `text-content`, `text-primary-text`, and friends), and the `L*` primitives (`LApp`, `LBadge`, `LCard`, `LKeyValue`, `LStat`, `LPageHeader`, `LContainer`, `LLink`) imported from `@lotusia/ui`.

## Typecheck

`npm run typecheck` runs `vue-tsc --noEmit` through `scripts/typecheck.mjs` and enforces `typecheck-baseline.json`: every error the typechecker still reports is allowlisted by file, TS code, and message with a count and a reason stating why it is exempt. The list only shrinks: a fix that removes errors makes the gate fail until the entry is reduced or removed, and an entry is never added without a reason. To retire an entry, fix the errors it covers, run `npm run typecheck`, and update the baseline as the failure instructs. `npm run compile` stays the raw, ungated view.

## Overlay

The blurred-post widget on x.com is injected UI, a bounded context with inverted rules (branding ADR-006). It is mounted inside its own shadow root through WXT's `createShadowRootUi` with `cssInjectionMode: 'ui'` and `isolateEvents: true`, one mount per blurred post. The shadow root guarantees isolation in both directions: no style of ours reaches the host page (Tailwind's Preflight, carried by the chain below, applies inside the boundary only), and no style of the host page reaches the widget. Tokens resolve inside the boundary because `@lotusia/theme` emits them on the shadow host as well as the document root (ADR-003), and `overlayTeleportTarget()` creates one sanctioned portal destination inside the boundary per mount, though nothing portals today.

The content script's stylesheets have two jobs with opposite rules, so there are two files in `entrypoints/twitter.content/`:

- `shadow.css` is the only stylesheet the entrypoint imports. With `cssInjectionMode: 'ui'` its compiled output is injected into the shadow root, never into the document. It carries the same chain as the popup: `@import "tailwindcss"`, `@import "@lotusia/theme"`, and `@import "@lotusia/ui/base.css"`.
- `host-effects.css` styles x.com's own DOM (post hiding, post blur, vote button colouring, avatar reputation badges), so it cannot live inside the shadow root. It is injected into `document.head` as a plain string at startup, guarded by an element id so a re-entered content script does not add a second copy. It is deliberately not a normal import, because with `cssInjectionMode: 'ui'` every imported stylesheet goes into the shadow root instead. It carries no Tailwind, no Preflight, and no reset.

Because the host page owns its own variable names, `host-effects.css` declares nothing on the document root: every custom property is prefixed `--rank-` and is declared on the extension-owned rules that consume it. The model's token names (`--surface`, `--content`, `--border`) stay inside the boundary.

The widget (`BlurredPostOverlay.vue`) composes only components from `OVERLAY_SUBSET` of `@lotusia/ui` (today `LBadge`) over a plain `<button>` element, themed with the model's semantic roles and radii; the base contract's focus ring comes from `@lotusia/ui/base.css` in the same shadow root. Its click routes to the same reveal handler as before, so unblurring works exactly as it did.
