# Dependency upgrade and deployment preparation

Verified on October 6, 2026 on `feature-data-export-v2`: a clean `npm ci` and
`npm run check` passed. The full npm audit reported **0 vulnerabilities**,
including development dependencies. The previous Next.js 14 dependency has been
replaced, resolving the advisories reported by the earlier audit.

These results describe the checked dependency tree and automated checks. They do
not establish that a public deployment has occurred or that the application is
free from every possible security issue. Local browser checks also passed as
listed below; verification on the eventual hosting platform is still required.

## Toolchain

| Component | Version used |
| --- | --- |
| Node.js | 24.19.0 |
| npm | 11.17.0 |
| Next.js and Next ESLint plugin | 16.4.0 |
| React and React DOM | 19.3.0 |
| Tailwind CSS and its PostCSS plugin | 4.3.3 |
| PostCSS | 8.5.29 |
| TypeScript | 6.0.3 |
| ESLint and `@eslint/js` | 9.39.5 |
| typescript-eslint | 8.71.1 |

Direct dependency versions are pinned in `package.json`; `package-lock.json`
records the resolved tree. `.nvmrc` specifies Node 24.19.0 and the package engine
range is `>=24.19.0 <25`. Use this runtime on the build host and production server.

ESLint **9.39.5 is deprecated and end-of-life**, and remains a development-only
compatibility constraint. It is the latest compatible version for the selected
React and accessibility plugins: `eslint-plugin-react@7.37.5` accepts ESLint
through `^9.7`, and `eslint-plugin-jsx-a11y@6.10.2` through `^9`; neither declares
ESLint 10 support. Do not force an unsupported peer combination. Revisit the
plugins and migrate together when a compatible maintained configuration is
available. See [ESLint version support](https://eslint.org/version-support/),
the [React plugin manifest](https://github.com/jsx-eslint/eslint-plugin-react/blob/v7.37.5/package.json),
and the [accessibility plugin manifest](https://github.com/jsx-eslint/eslint-plugin-jsx-a11y/blob/v6.10.2/package.json).

TypeScript 6.0.3 is intentional: the installed typescript-eslint version supports
`>=4.8.4 <6.1.0`, so TypeScript 7 is outside its supported range. Upgrade the
parser and compiler together after checking their declared support. See
[typescript-eslint dependency versions](https://typescript-eslint.io/users/dependency-versions/).

## Compatibility changes

- Next.js 16 replaces the removed `next lint` command with a direct ESLint CLI
  script. The project uses an explicit flat configuration for JavaScript,
  TypeScript, React, hooks, accessibility, and Next's core-web-vitals rules.
  Linting runs separately because `next build` no longer runs it. See the
  [Next.js 16 migration guide](https://nextjs.org/docs/app/guides/upgrading/version-16).
  `typecheck` first runs `next typegen` so a fresh checkout has Next's generated
  environment and route declarations before TypeScript runs.
- React's `useSyncExternalStore` integrates the browser expense store with
  hydration and cross-tab updates. Existing local expense data and export
  behavior remain compatible; storage behavior has regression coverage.
- Modal initialization focuses marked controls after opening the native dialog.
  The dialog retains Escape handling, focus containment, and focus restoration.
- Tailwind 4 uses `@tailwindcss/postcss` and a CSS import with explicit source
  scanning. The empty v3 configuration and redundant Autoprefixer dependency
  were removed. Shared buttons use `@utility`; shadow, blur, and outline names
  were migrated to preserve their earlier appearance and accessibility behavior.
  Tailwind 4 requires Safari 16.4+, Chrome 111+, or Firefox 128+. See the
  [Tailwind upgrade guide](https://tailwindcss.com/docs/upgrade-guide).

## Temporary Next lint dependency replacement

Next's ESLint plugin 16.4.0 pulls in
`fast-glob -> micromatch -> braces`. The
[braces advisory GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)
affects versions through 3.0.3 and has no patched release at the time of this
upgrade. Updating Next alone therefore left a development dependency finding.

The package manifest uses this exact-parent override:

```json
"overrides": {
  "@next/eslint-plugin-next@16.4.0": {
    "fast-glob": "npm:tinyglobby@0.2.17"
  }
}
```

This replaces the vulnerable dependency chain rather than suppressing audit
output. In this specific Next plugin version, the sole fast-glob call is
`globSync(pattern, { onlyDirectories: true })`, which tinyglobby supports.
The override is intentionally scoped to that exact plugin version; it is not a
claim that every fast-glob API can be replaced globally. See
[tinyglobby](https://github.com/SuperchupuDev/tinyglobby) and
[npm overrides](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/#overrides).

`tests/lint-config.test.ts` loads the actual project configuration and creates an
isolated page fixture. A `settings.next.rootDir` glob exercises the replacement:
an internal native anchor must trigger `no-html-link-for-pages`, while a Next
`Link` must pass. Next-specific lint rules therefore remain enabled and tested.

When upstream releases a compatible fixed dependency chain, upgrade the Next
plugin with Next, remove the override, and repeat the clean install, regression
test, full audit, and project checks. Do not simply broaden the override to a new
plugin version without reviewing its actual API usage.

## Reproduce verification

From the repository with the specified toolchain:

```powershell
npm ci
npm run check
npm start -- --hostname 127.0.0.1 --port 3102
```

The completed automated verification included zero-warning lint, TypeScript
checking, **31 passing tests**, a production build, and
`npm audit --audit-level=low` with zero findings. No audit category is excluded.
The production-only audit (`npm audit --omit=dev`) also reported zero findings,
and `npm ls --all` found no invalid dependency relationships.

The local production browser check covered empty exports, creating and editing
expenses, persistence after reload, edits appearing in a second tab, filtered
and all-expense previews, initial input focus, Tab/Shift+Tab containment, Escape,
focus restoration, and a 320px viewport with no page overflow. Actual CSV and
JSON downloads each contained two test expenses totaling 4,024 cents; CSV
protected a formula-like description while JSON preserved its original text.
No application console errors were observed.

For the browser verification procedure, follow [the export guide](data-export.md).
Before public deployment, run the same checks on the release commit, use the
production start command or the hosting platform's supported Next.js deployment
process, and verify its production URL and HTTPS behavior. The localhost command
above is for local verification only.

## Carry the upgrade into V3

V3 must inherit the dependency tree, lint configuration and regression, runtime
requirements, and React/Tailwind compatibility changes. Cherry-picking only the
historical export-foundation commit `3087bb5` would leave those improvements out.
Use the complete upgraded V2 as the starting point when the exercise permits;
otherwise port both the reusable export foundation and this upgrade onto the
independent V3 branch, then run `npm ci` and `npm run check` there.
