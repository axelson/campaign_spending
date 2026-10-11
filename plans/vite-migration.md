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
10. **Verify.**
    - Run `npm run build`, then diff `docs/` against the current build: the same pages and data files, with only asset hashes changed.
    - Run `npm run preview` and click through the year toggles, the candidate autocomplete, a candidate modal (it calls the Socrata API live), `durable_assets.html` and `starter.html`. Check the console for errors.
    - Run `update-data` against the current `raw_data/` files and confirm its output matches the existing `campaign_spending_summary.csv` and `organizational_report.csv`.
11. **Delete Ruby.** Remove `Gemfile`, `Gemfile.lock`, `.ruby-version`, `_config.yml`, `_deploy_config.yml`, `_plugins/`, `parse.rb`, `update_data.sh`, the `*-jekyll*.sh` scripts and `_site/`. Replace `deploy.sh` with `npm run build && git add docs/`, which also fixes the old `doc/` typo. Update README and `.gitignore`.

## Known risks / follow-ups

- **Google Analytics:** the site uses Universal Analytics (`UA-50186636-1`), which stopped collecting data in 2023. `vis.js` calls `ga(...)` in 7 places, so removing the snippet means stubbing `ga` or deleting those calls. Keep the snippet for this migration and remove it in a follow-up.
- `show_powerballot_link` calls a 2014 ArcGIS endpoint over `http://`, which is likely dead or blocked as mixed content. That's out of scope here, but test it during verification.
- `durable_assets.html` uses a second, older set of libraries from `js/`. It gets copied as-is and isn't modernized in this migration.
- Later: move vendor libraries to npm imports and drop Foundation and jQuery where they're barely used.
