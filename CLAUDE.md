# Working in this repo

This is **`exploreomni/vega-lite-omni`**, a GitHub fork of `vega/vega-lite` with Omni-specific patches. Read [`README-OMNI-FORK.md`](./README-OMNI-FORK.md) for the full picture before making non-trivial changes.

## Branch hygiene

- **Always branch from `omni/main`**, never from `main`. `main` is a pristine mirror of upstream.
- PRs target `omni/main`, not `main`.
- Don't add commits directly to `main` or `omni-dist`.

## Patch stack discipline

`omni/main` is anchored on the most recent upstream release tag (currently `v6.4.3`). The release script's drift guard refuses to tag if the anchor is wrong.

When upstream cuts a new release:

```bash
git rebase --onto v6.5.0 v6.4.3
```

## Local dev

```bash
npm install
```

Build:

```bash
npm run build:only
```

Tests (vitest):

```bash
npx vitest run test/
```

`npm test` also runs lint, schema generation, `examples/`, and `test-runtime/`; for iterating on a feature, `npx vitest run test/<file>` is faster. Everything passes except `test-runtime/animation.test.ts`, which fails to import upstream too: it reads `examples/specs/data/gapminder.json`, a path nothing populates (`npm run data` rsyncs vega-datasets into `site/data`).

Expectations for the aria `description` signal are hand-written strings, not snapshots, so `-u` won't refresh them. If upstream changes that generator, edit them by hand — the inner quotes need escaping (`join(x, \' \')`) since the enclosing literal is single-quoted.

## Releasing

```bash
./scripts/release-omni.sh omni.<N>
git push origin omni-dist --tags
```

The release script preserves the `./types_unstable/*` subpath exports in the slim `package.json` — Omni's bi-app imports types from `vega-lite/types_unstable/spec/unit.js`, etc., and breaking that subpath would break consumer TypeScript.

## peerDependencies

`peerDependencies.vega` is `*` in our fork (not `^6.0.0` like upstream). Don't tighten this. Reason: omni-tagged versions are prereleases (`6.2.0-omni.0`); per semver, `^6.0.0` only matches a prerelease if its `major.minor.patch` tuple matches `6.0.0` exactly. Widening to `*` lets `npm install` succeed cleanly without `--legacy-peer-deps`. This is part of the `chore(omni)` commit at the top of the patch stack — preserve it through every rebase.

## The label patch

`feat(labels): adds new Label mark to VegaLite (#2)` is a revert-of-a-revert. Upstream merged `feat: add label encoding (#7222)` in 2021 and reverted it the same month (`132b3da0d`) with no explanation. Omni resurrected it in 2025.

**Implication for upstreaming:** this patch is mechanically applicable but socially expensive. It requires relitigating a 2021 maintainer decision, not a drive-by PR. Plan accordingly. The other patches (facet autosize) are clean greenfield additions and should upstream cleanly.

## Upstreaming a patch

```bash
git checkout -b upstream-pr/foo upstream/main
git cherry-pick <sha-from-omni-main>
git push origin upstream-pr/foo
# Open PR via GitHub UI: exploreomni/vega-lite-omni:upstream-pr/foo → vega/vega-lite:main
```

## Things to avoid

- **Don't tighten the `vega: *` peerDep** — see above.
- **Don't merge `main` into `omni/main`.** Rebase, don't merge.
- **Don't publish to npm.** Consumers fetch the `omni-dist` tag via git URL.
- **Don't drop the `types_unstable/*` exports entry** from the slim `package.json` in the release script — that subpath is what bi-app's type imports rely on.
