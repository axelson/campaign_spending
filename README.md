[![Vizualization Screenshot](src/public/images/viz-screenshot.png "Vizualization Screenshot")](http://viz.hawaiicampaignspending.com)
[![Vizualization Gif](src/public/images/screenshot.gif "Vizualization Gif")](http://viz.hawaiicampaignspending.com)

# Intro
This project is a vizualization of Hawaii Campaign Spending data for Candidates. It was initially created for [Civic*Celerator 2013](http://civic.celerator.org/).

[View Online](http://viz.hawaiicampaignspending.com)

Please note that this visualization is based on the official Hawaii Campaign
Spending data on hicscdata.hawaii.gov:
https://hicscdata.hawaii.gov/dataset/Expenditures-Made-By-Hawaii-State-and-County-Candi/3maa-4fgr
(see [Updating Data](#updating-data) for how it's combined with older snapshots).

To better understand the data you should take a look at the [Campaign Finance Data Primer](https://docs.google.com/document/d/1VC0of6-rLtFrLmpBS8xWDLjLvtoPOr9LBfDJLYy_4fw/edit)

# Development/Contributing

## Installation/Running

Requires Node (version in `.node-version`).

    npm install
    npm run dev

Visit the URL Vite prints (http://localhost:5173 by default). The source lives
in `src/`: pages at the top level, the visualization and styles in `src/app/`,
and files copied verbatim (data, images, vendored libraries) in `src/public/`.

## Updating Data

In this project the data is updated manually rather than automatically fetched (this may change in the future).

    npm run update-data

This downloads the public Socrata data into `raw_data/` and writes the
reshaped data to `src/public/data/`; no API key is needed. Pass
`-- --skip-download` to only reshape the files already in `raw_data/`. Then
commit the changes to the data (if any) and deploy.

The state's datasets now only contain reports filed from 2015 on, so older
data comes from snapshots in `raw_data/` that can't be re-downloaded:

- `expenditures_2021.csv` and `organizational_reports_2021.csv` (August 2021)
  supply the election periods that started by 2014; everything later comes from
  the live expenditures dataset, with each election's office and party taken
  from the candidate's filings for it.
- `durable_assets_2006-2013.json` (February 2014) is combined with the live
  durable assets dataset. Reports filed during 2014 are in neither.

The public "Campaign Spending OE Ledger" dataset
(https://hicscdata.hawaii.gov/resource/bjzn-cicp.json) still has the pre-2015
expenditure reports and matches the 2021 snapshot, if the snapshot ever needs
rebuilding.

## Deploying

Run the deploy script, which builds the site into `docs/` and stages it:

    ./deploy.sh

Then commit the changes and push `main`. GitHub Pages serves the `docs/` folder
of the `main` branch of https://github.com/axelson/campaign_spending at
https://viz.hawaiicampaignspending.com (`docs/CNAME` holds the custom domain).

## Checking a change against the deployed build

`scripts/parity.mjs` drives two builds through the same interactions with a
seeded `Math.random` and compares bubble layout, visible text, Socrata requests,
console errors and screenshots. Serve the reference build (e.g. a checkout of
`docs/` from before the change) and the new one, then:

    mkdir -p /tmp/reference && git archive <old-commit> docs | tar -x -C /tmp/reference
    (cd /tmp/reference/docs && python3 -m http.server 8001) &
    npm run build && npx vite preview --port 4173 &
    npm run parity -- http://localhost:8001 http://localhost:4173

It uses Playwright's Chromium (`npx playwright install chromium`), or set
`CHROMIUM_PATH` to another Chromium binary.

## Contributing

If you'd like to contribute, simply fork the repo, push your commits, and submit your pull request.
