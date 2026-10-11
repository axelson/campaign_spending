#!/bin/sh
# Builds the site into docs/ (served by GitHub Pages) and stages the result.
set -e

if [ -n "$(git status --porcelain)" ]; then
    echo "Requires a clean git directory"
    exit 1
fi

npm run build
git add --all docs/
