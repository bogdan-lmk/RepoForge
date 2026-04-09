`src/app` was intentionally retired in favor of the active `app` tree.

These `.bak` files are a snapshot of the removed `src/app` files so they can be restored quickly without digging through git history.

Restore examples:

```bash
cp docs/archive/src-app/page.tsx.bak src/app/page.tsx
cp docs/archive/src-app/layout.tsx.bak src/app/layout.tsx
cp docs/archive/src-app/globals.css.bak src/app/globals.css
cp docs/archive/src-app/_home-content.tsx.bak src/app/_home-content.tsx
cp docs/archive/src-app/favicon.ico.bak src/app/favicon.ico
```

Canonical app router tree:

- `app/`

Archived duplicate tree:

- `docs/archive/src-app/`
