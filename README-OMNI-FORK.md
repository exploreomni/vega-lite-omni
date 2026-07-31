# Omni's fork of vega/vega-lite

This is `exploreomni/vega-lite-omni`, a GitHub fork of [`vega/vega-lite`](https://github.com/vega/vega-lite) that carries Omni-specific patches we've not yet upstreamed.

## What's in this fork

`omni/main` is anchored on the most recent upstream release tag (`v6.4.3`) and carries a small linear stack of patches:

```
chore(omni): peerDep relax + release script + drift guard            ← omni-only
feat: container sizing of facet with autosize fixes                  ← upstreamable
feat(labels): Label mark for Vega-Lite (#2)                          ← upstreamable*
─────────────────────────────────────────────────────────────────────
upstream tag v6.4.3
```

\* The label patch is a revert-of-a-revert: upstream merged `feat: add label encoding (#7222)` in 2021 and reverted it the same month. Upstreaming it is not a drive-by — it requires relitigating that 2021 maintainer decision, not just opening a PR.

## Branch model

| Ref | Purpose | Mutability |
| --- | --- | --- |
| `main` | Mirror of `vega/vega-lite:main`. No Omni commits. | Force-reset to `upstream/main` during sync. |
| `omni/main` | Default branch. Linear patch stack on top of the most recent upstream release tag. | Force-pushed during upstream sync, otherwise append-only via PRs. |
| `omni-dist` | Orphan branch holding pre-built artifacts (`build/`, slim `package.json`, `bin/`). What consumers fetch via git URL. | Force-updated by `./scripts/release-omni.sh`. |
| `v6.4.3-omni.N` (tag) | Immutable consumer reference, points to a commit on `omni-dist`. | Re-tagged only if the underlying release was wrong. |

## Consumption

```json
{
  "dependencies": {
    "vega-lite": "exploreomni/vega-lite-omni#v6.4.3-omni.0"
  }
}
```

The git URL points at the `omni-dist` tag. The fetched tree includes the entire `build/` directory — including the `types_unstable/` subpath exports (`build/spec/`, `build/compositemark/`, `build/normalize/`, `build/compile/`, etc.) that Omni's bi-app imports from.

## peerDeps

This fork's `peerDependencies.vega` is `*` instead of upstream's `^6.0.0`. Reason: our omni vega is published with a prerelease-style version (`6.2.0-omni.0`), and per semver, `^6.0.0` doesn't match prerelease tags whose `[major,minor,patch]` differs from `6.0.0`. Widening to `*` lets `npm install` complete cleanly without `--legacy-peer-deps`. This is part of the `chore(omni)` commit at the top of the patch stack — preserve it through every rebase.

## How to add a patch

```bash
git clone git@github.com:exploreomni/vega-lite-omni
cd vega-lite-omni
git fetch origin
git checkout -b feat/your-thing origin/omni/main

npm install
$EDITOR src/...
npx vitest run test/

git commit -am "feat: your-thing"
git push -u origin feat/your-thing
# Open PR in GitHub UI: feat/your-thing → omni/main
```

After merge into `omni/main`, cut a new release:

```bash
git checkout omni/main && git pull
./scripts/release-omni.sh omni.N
git push origin omni-dist --tags
```

Bump `~/src/omni/packages/bi-app/package.json` to point at the new tag.

## How to pull upstream

When `vega/vega-lite` cuts `v6.5.0`:

```bash
git fetch upstream --tags
git checkout main && git reset --hard upstream/main && git push -f origin main

git checkout omni/main
git rebase --onto v6.5.0 v6.4.3
# Resolve conflicts patch-by-patch.
git push -f origin omni/main

./scripts/release-omni.sh omni.0
git push origin omni-dist --tags
```

The release script's drift guard refuses to tag if `omni/main` is anchored on anything other than the latest release tag. Trust it.

## How to upstream a patch

Same as the vega-omni README — branch off `upstream/main`, cherry-pick the omni commit, push to `exploreomni/vega-lite-omni`, open PR in GitHub UI to `vega/vega-lite:main`.

## Known: `test-runtime/animation.test.ts` fails to import

It reads `examples/specs/data/gapminder.json`, which nothing populates — `npm run data` rsyncs vega-datasets into `site/data`. Fails the same way on upstream `v6.4.3`, so it's an upstream bug rather than fork drift. Every other suite passes.

## Links

- Upstream: https://github.com/vega/vega-lite
- The label feature's contested history: see PR vega/vega-lite#7222 and commit `132b3da0d` on upstream
- Migration history: ask Nate
