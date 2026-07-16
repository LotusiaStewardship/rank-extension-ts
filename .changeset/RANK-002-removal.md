---
'rank-extension-ts': minor
---

Removed `flowbite` and `flowbite-vue` dependencies. Replaced all Flowbite components with shadcn-vue v2.x components (Button, Input, Textarea, Switch, Tabs) and raw Tailwind HTML. This eliminates a legacy dependency with 33% dead imports, removes duplicate bundled Flowbite CSS, and reduces the bundle footprint.
