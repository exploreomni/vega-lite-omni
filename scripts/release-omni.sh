#!/usr/bin/env bash
#
# release-omni.sh — build vega-lite and publish a self-contained git tag on the
# omni-dist branch. Consumers reference the tag from package.json:
#
#   "vega-lite": "exploreomni/vega-lite-omni#v6.4.3-omni.1"
#
# Source stays on omni/main. Built artifacts live on omni-dist.
#
# Usage:
#   scripts/release-omni.sh <version-suffix>
# Example:
#   scripts/release-omni.sh omni.0     # tag becomes v<upstream>-omni.0

set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "usage: $0 <version-suffix>  (e.g. omni.0)" >&2
  exit 2
fi

SUFFIX="$1"
REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

# 1. Validate state
if [ -n "$(git status --porcelain)" ]; then
  echo "error: working tree not clean" >&2
  exit 1
fi

CURRENT_BRANCH="$(git branch --show-current)"
if [ "$CURRENT_BRANCH" != "omni/main" ] && [ "${ALLOW_BRANCH:-}" != "1" ]; then
  echo "error: not on omni/main (current: $CURRENT_BRANCH). Set ALLOW_BRANCH=1 to override." >&2
  exit 1
fi

UPSTREAM_BASE="$(git describe --tags --abbrev=0 --match 'v[0-9]*' 2>/dev/null | head -1)"
if [ -z "$UPSTREAM_BASE" ]; then
  echo "error: no upstream version tag found" >&2
  exit 1
fi

# Guard: omni/main must be anchored on the release tag itself, not on
# upstream/main HEAD past it.
EXPECTED_PATCH_COUNT="$(git rev-list --count "$UPSTREAM_BASE..HEAD")"
DESCRIBE_FULL="$(git describe --tags --match 'v[0-9]*' 2>/dev/null)"
if ! [[ "$DESCRIBE_FULL" =~ ^${UPSTREAM_BASE}-${EXPECTED_PATCH_COUNT}-g[0-9a-f]+$ ]]; then
  echo "error: omni/main is not cleanly anchored on $UPSTREAM_BASE." >&2
  echo "       git describe says: $DESCRIBE_FULL" >&2
  echo "       expected: ${UPSTREAM_BASE}-${EXPECTED_PATCH_COUNT}-gXXXX" >&2
  echo "       Likely the branch was rebased onto upstream/main HEAD." >&2
  echo "       Fix:  git rebase --onto $UPSTREAM_BASE upstream/main HEAD" >&2
  exit 1
fi

TAG="${UPSTREAM_BASE}-${SUFFIX}"
echo "→ Releasing $TAG (based on upstream $UPSTREAM_BASE, $EXPECTED_PATCH_COUNT omni commits)"

# 2. Build
echo "→ Building vega-lite"
npm run build:only

if [ ! -d build ]; then
  echo "error: build/ not produced" >&2
  exit 1
fi

# 3. Verify build/ contains the subtrees that types_unstable exports point at.
#    omni/bi-app imports from e.g. vega-lite/types_unstable/spec/unit.js
#    which resolves to build/spec/unit.d.ts via the exports entry.
echo "→ Verifying types_unstable subpath exports resolve"
required_subdirs=(spec compositemark normalize compile)
for d in "${required_subdirs[@]}"; do
  if [ ! -d "build/$d" ]; then
    echo "error: build/$d missing — types_unstable/$d/* would be unresolvable" >&2
    exit 1
  fi
done
required_files=(build/index.d.ts build/index.js build/vega-lite-schema.json)
for f in "${required_files[@]}"; do
  if [ ! -f "$f" ]; then
    echo "error: $f missing from build/" >&2
    exit 1
  fi
done

# 4. Stage
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT
echo "→ Staging artifacts at $STAGE"
cp -R build "$STAGE/build"
cp LICENSE "$STAGE/" 2>/dev/null || true
# bin/ scripts (vl2pdf, vl2png, etc.) — keep, they're declared in package.json bin
cp -R bin "$STAGE/bin" 2>/dev/null || true

# Slimmed package.json: name, version, exports (incl. types_unstable!), peerDeps
node - "$STAGE" "$TAG" "$REPO_ROOT/package.json" <<'NODE'
const fs = require('fs');
const [stage, tag, srcPkgPath] = process.argv.slice(2);
const src = JSON.parse(fs.readFileSync(srcPkgPath, 'utf8'));

// Keep only true runtime deps. vega-lite has none of vega-* in deps; its only
// runtime deps are tslib, json-stringify-pretty-compact, etc. Pass them all
// through unchanged.
const slim = {
  name: src.name,
  version: tag.replace(/^v/, ''),
  description: src.description,
  license: src.license,
  type: src.type,
  // Critical: preserve all three exports entries. Omni's bi-app imports
  // both '.' (build/index.js) and './types_unstable/*' (build/*).
  exports: src.exports,
  unpkg: src.unpkg,
  jsdelivr: src.jsdelivr,
  bin: src.bin,
  repository: src.repository,
  dependencies: src.dependencies,
  peerDependencies: src.peerDependencies,
};
fs.writeFileSync(stage + '/package.json', JSON.stringify(slim, null, 2) + '\n');
NODE

# 5. Create or update the omni-dist worktree
DIST_DIR="$(mktemp -d)/omni-dist"
trap 'rm -rf "$STAGE" "$(dirname "$DIST_DIR")"' EXIT

if git show-ref --verify --quiet refs/heads/omni-dist || \
   git show-ref --verify --quiet refs/remotes/origin/omni-dist; then
  git worktree add "$DIST_DIR" omni-dist
  ( cd "$DIST_DIR" && git rm -rf -q . 2>/dev/null || true )
else
  echo "→ Bootstrapping omni-dist as a fresh orphan branch"
  git worktree add --orphan -b omni-dist "$DIST_DIR"
fi

echo "→ Copying built artifacts onto omni-dist worktree"
( cd "$STAGE" && tar c . ) | ( cd "$DIST_DIR" && tar x )

# 6. Commit + tag
cd "$DIST_DIR"
git add -A
SOURCE_SHA="$(git -C "$REPO_ROOT" rev-parse HEAD)"
git -c commit.gpgsign=false commit -m "release: $TAG (from $SOURCE_SHA)"
git tag "$TAG"
echo "→ Tagged $TAG on omni-dist (source: $SOURCE_SHA)"

cd "$REPO_ROOT"
git worktree remove --force "$DIST_DIR"

cat <<EOF

✓ Done. To publish:
    git push origin omni-dist --tags

Consumers reference this release as:
    "vega-lite": "exploreomni/vega-lite-omni#$TAG"

EOF
