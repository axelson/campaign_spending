#!/bin/sh
# Builds the site into docs/ (served by GitHub Pages) and stages the result.
set -e

if ! git diff --quiet; then
    echo "Requires a clean git directory"
    exit 1
fi

npm run build
git add --all docs/
