# Migrate build from Jekyll to Vite

Replace the Ruby toolchain (Jekyll, jekyll-assets/Sprockets, CoffeeScript, Ruby Sass, `parse.rb`) with Vite and Node. The built site keeps deploying from `docs/` with the same URLs.

## Target layout

```
src/                      # Vite root (replaces _jekyll/)
  index.html
  durable_assets.html
  starter.html
  js/vis.js               # decaffeinated vis.coffee
  css/app.scss
  public/                 # copied verbatim to docs/
    CNAME
    data/                 # generated CSV/JSON
    images/
    js/ css/              # legacy static files used by durable_assets.html, starter.html
    vendor/               # jQuery 2.1, d3 v3, lodash 2.4, foundation, d3-tip, queue, autocomplete, CustomTooltip
scripts/update-data.mjs   # replaces update_data.sh + parse.rb
vite.config.js
package.json
```

## Steps

1. **Scaffold.** Rewrite `package.json` (drop the Grunt/Bower dependencies), add `vite` and `sass` as dev dependencies, delete `bower.json`. Add a `.node-version` file. Scripts:
   `dev` → `vite`, `build` → `vite build`, `preview` → `vite preview`, `update-data` → `node --env-file=.env scripts/update-data.mjs`.
2. **vite.config.js.** `root: 'src'`, `build.outDir: '../docs'`, `emptyOutDir: true`. Every HTML page is listed in `build.rollupOptions.input`.
3. **Move static files.** Move `_jekyll/{data,images,css,js,CNAME}` into `src/public/`. Paths such as `data/...` and `js/...` stay the same.
4. **Vendor JS stays as classic globals.** `vis.coffee` relies on the globals `$`, `_`, `d3` and `queue`, and the jQuery plugins expect a global `jQuery`. Move the files listed in `_assets/js/application.js` into `public/vendor/` and replace `{% asset application.js %}` with plain `<script src="/vendor/...">` tags in the same order. Vite copies these files without processing them, so they aren't minified. That's acceptable for now, and moving them to npm can be a separate change later.
5. **Convert CoffeeScript.** Run `npx decaffeinate vis.coffee`, then tidy the output.
   - Watch for `root = exports ? this` (line 757). In an ES module, `this` is `undefined`, so change it to `window`.
   - Load `vis.js` with `<script type="module">` so Vite bundles and minifies it. Make sure it still runs after the vendor scripts. Module scripts are deferred, so this works.
6. **Sass.** Move `app.scss` to `src/css/`. Replace `{% asset app.scss %}` with `<link rel="stylesheet" href="/css/app.scss">`. Vite compiles and fingerprints it.
7. **Remove Liquid.**
   - `{% if site.internet %}` is always true in both configs, so keep the contents and delete the tags.
   - Paste the contents of `nav.html` into `durable_assets.html` (it's the only page that uses it). Paste `starter.js` and `bar-chart.js` into `starter.html`.
8. **Remove the duplicate page.** `candidate_spending.html` is byte-identical to `index.html`. Keep it as a one-line redirect to `/` so old links keep working, or delete it.
9. **Data script.** Write `scripts/update-data.mjs`:
   - Download both Socrata CSVs with `fetch`, using basic auth from `API_KEY_ID`/`API_KEY_SECRET`, into `raw_data/`.
   - Port the `parse.rb` transforms: trim fields, add the sequential `id`, skip `CC11033`, skip rows with no party.
   - Write the results to `src/public/data/`.
   - Use the `csv-parse`/`csv-stringify` packages rather than hand-rolling CSV handling, because the fields include quoted commas.
10. **Verify.** Run the parity check described under "Verifying the JS rewrite" below. Also:
    - Run `npm run build`, then diff the file list in `docs/` against the current build. Expect the same pages and data files, with only asset hashes changed.
    - Run `update-data` against the current `raw_data/` files and confirm its output matches the existing `campaign_spending_summary.csv` and `organizational_report.csv` byte for byte.
11. **Remove Google Analytics** (separate commit, after the parity check passes).
    - Delete the analytics snippet from `index.html`.
    - Delete the 7 `ga(...)` calls in `vis.js`: modal show, candidate search select and search, and the navigation, year and legend clicks around lines 994–1021 of the original file.
    - Check that nothing else references `ga`: `grep -n "ga(" src/js`.
12. **Remove the power ballot link** (separate commit).
    - Delete `show_powerballot_link` and its call in the candidate modal (lines 610 and 822–833 of the original file).
    - Delete the `.powerballot_link_container` markup from `index.html` and any CSS that targets it.
13. **Serve the fonts locally** (separate commit, after the parity check).
    - `index.html` loads Open Sans from Google Fonts in weights 300, 400, 600 and 700, plus 300, 400 and 600 italic.
    - Install `@fontsource-variable/open-sans` and import it, plus its italic file, from `app.scss` or `vis.js`. One variable font covers every weight in use. Vite copies the `.woff2` files into `docs/assets/` with hashed names.
    - Delete the `fonts.googleapis.com` `<link>` and the commented-out WebFont loader block.
    - In CSS, change `'Open Sans'` to `'Open Sans Variable', 'Open Sans', sans-serif`. That's `app.scss`, and `durable_assets.css` lines 17 and 79.
    - `durable_assets.html` uses Open Sans but never loads it, so add the import there too.
    - To verify:
      - Run Playwright with every request outside localhost aborted. Check that `document.fonts.check('600 16px "Open Sans Variable"')` is true and that nothing was blocked.
      - Compare screenshots by eye against the old site loaded with Google Fonts allowed. Expect small differences, because Google may serve a different build of the font.
14. **Delete Ruby.** Remove `Gemfile`, `Gemfile.lock`, `.ruby-version`, `_config.yml`, `_deploy_config.yml`, `_plugins/`, `parse.rb`, `update_data.sh`, the `*-jekyll*.sh` scripts and `_site/`. Replace `deploy.sh` with `npm run build && git add docs/`, which also fixes the old `doc/` typo. Update README and `.gitignore`.

## Verifying the JS rewrite

`decaffeinate` is a mechanical translation, so the main risks are a few edge cases: implicit returns, `this` binding in `=>` methods, existence operators (`?`), and the `root = exports ? this` pattern. The current `docs/` build is the reference, because it contains the JS compiled from `vis.coffee` and it already runs. The check compares the old and new builds in the same browser and expects identical behavior.

**Order matters.** Port first with no behavior changes, run the parity check, and only then remove analytics and the power ballot link (steps 11–12). If they were removed before the check, every comparison would show expected differences mixed in with real ones.

**Parity harness** (`scripts/parity.mjs`, Playwright; the Chromium browsers are already in `~/Library/Caches/ms-playwright`):

1. Serve the old site from `git show master:docs` (or a copy of the current `docs/`), and the new site with `vite preview`.
2. Make both runs deterministic with an init script injected before any page code:
   - Replace `Math.random` with a seeded PRNG. The bubble starting positions (`vis.coffee` lines 54–55) and the d3 force layout both use it.
   - Stub `window.ga = () => {}`. Block `google-analytics.com`, `fonts.googleapis.com` and `arcgis.com`.
   - Serve fixed JSON fixtures for `hicscdata.hawaii.gov/resource/*`, the live Socrata call made by the candidate modal.
3. Run the same script of interactions on both sites, and after each one wait until the force layout settles (`force.alpha()` reaches 0, or the circle positions stop changing):
   - load the page
   - click through each grouping/navigation button
   - go to the next year and the previous year
   - toggle the mini legend
   - type a candidate name, pick an autocomplete suggestion, open and close the candidate modal
4. After each step, record:
   - for every `circle`: its `id`, `r`, `cx`, `cy` and `fill`, rounded to 2 decimal places
   - the visible text of the legend, tooltip and modal
   - the URLs of the requests sent to `hicscdata`, which checks the `$where` query string is built the same way
   - console errors and page errors
   - a screenshot
5. Compare the two runs. The records must match exactly, and screenshots must match within a small pixel tolerance to allow for font antialiasing. Both runs must have no console errors.

If the circle positions differ even though they're seeded, the order of `Math.random` calls has changed. That usually means a loop or callback was reordered, so look for it in the diff rather than loosening the tolerance.

**Supplementary checks:**
- Read the decaffeinated output next to `vis.coffee`, focusing on the spots `decaffeinate` marks with `// TODO` / `DS` comments.
- After the removals, run the harness again with only the analytics and arcgis rules dropped. The records should still match the old build except for the missing power ballot link.

## Known risks / follow-ups

- `durable_assets.html` uses a second, older set of libraries from `js/`. It gets copied as-is and isn't modernized in this migration, so check it by hand: it loads and shows no console errors.
- The "Fork me on GitHub" ribbon image is loaded from `s3.amazonaws.com`. Once fonts are local, it's the only external request left on page load (apart from the candidate modal's Socrata call). It could be copied into `public/images/` or dropped.
- Later: move vendor libraries to npm imports and drop Foundation and jQuery where they're barely used.
