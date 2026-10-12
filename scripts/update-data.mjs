// Downloads the Socrata data into raw_data/ and reshapes it into the data files
// the pages load from src/public/data/.
//
// Usage: npm run update-data [-- --skip-download]
//   --skip-download  reuse the files already in raw_data/
//
// All sources are public; no API key is needed.

import { readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { parse } from 'csv-parse/sync'
import { stringify } from 'csv-stringify/sync'

const ROOT = resolve(import.meta.dirname, '..')

// Expenditures Made By Hawaii State and County Candidates (reports from 2015 on)
// https://hicscdata.hawaii.gov/dataset/Expenditures-Made-By-Hawaii-State-and-County-Candi/3maa-4fgr
const EXPENDITURES_URL = 'https://hicscdata.hawaii.gov/resource/3maa-4fgr.json'

// Socrata caps a response at $limit rows; a response that fills it was probably
// truncated.
const ROW_LIMIT = 1_000_000
const soql = (base, params) =>
  `${base}?${new URLSearchParams({ ...params, $limit: String(ROW_LIMIT) })}`

const SOURCES = {
  // Total spent per candidate, category and election period
  'raw_data/expenditure_totals.json': soql(EXPENDITURES_URL, {
    $select: 'reg_no,expenditure_category,election_period,sum(amount) as amount',
    $group: 'reg_no,expenditure_category,election_period',
  }),
  // Every name/office/party combination each candidate has filed under in each
  // election period, with the date of its latest expenditure
  'raw_data/candidates.json': soql(EXPENDITURES_URL, {
    $select:
      'reg_no,election_period,candidate_name,office,district,county,party,max(date) as last_date',
    $group: 'reg_no,election_period,candidate_name,office,district,county,party',
  }),
  // Durable assets reported from 2015 on
  // https://hicscdata.hawaii.gov/dataset/Durable-Assets-For-Hawaii-State-and-County-Candida/fmfj-bac2
  'raw_data/durable_assets.json': soql('https://hicscdata.hawaii.gov/resource/fmfj-bac2.json', {}),
}

// Snapshots of the expenditure rollup and the organizational reports downloaded
// in August 2021, when the expenditures dataset still held reports from 2006 on.
// They can't be re-downloaded.
const EXPENDITURES_ARCHIVE = 'raw_data/expenditures_2021.csv'
const ORGANIZATIONAL_REPORTS_ARCHIVE = 'raw_data/organizational_reports_2021.csv'

// The live dataset is missing every report filed before 2015, so election
// periods that started by 2014 come from the snapshot. Those had all closed by
// 2021 apart from 2014-2022, whose 2014 reports are only ~$2k, so it comes from
// the live data with the later periods (which also picks up amendments filed
// since 2021).
const fromArchive = (period) => {
  const [start, end] = period.split('-').map(Number)
  return start <= 2014 && end <= 2020
}

// Snapshot of the durable assets dataset taken in February 2014 (records dated
// 2006-11 to 2013-12). The live dataset only covers reports from 2015 on, so this
// supplies the purchases of assets that were disposed of later, and the assets
// bought and disposed of before 2014. It can't be re-downloaded.
const DURABLE_ASSETS_ARCHIVE = 'raw_data/durable_assets_2006-2013.json'

// Ronald, Strode's data is bad
const SKIPPED_REG_NOS = new Set(['CC11033'])

// Test filings in the live data ("Test", "Test, Hannah", "Test, Sept. 15")
const isTestCandidate = (row) => /^Test(,|$)/.test(row.candidate_name)

async function download() {
  // Fetch everything before writing anything, so a failed download leaves
  // raw_data/ untouched instead of half updated.
  const downloads = []
  for (const [path, url] of Object.entries(SOURCES)) {
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`${url} returned ${response.status} ${response.statusText}`)
    }
    const rows = await response.json()
    if (rows.length >= ROW_LIMIT) {
      throw new Error(`${url} returned ${rows.length} rows, the $limit; raise ROW_LIMIT`)
    }
    downloads.push([path, rows])
  }
  for (const [path, rows] of downloads) {
    await writeFile(join(ROOT, path), JSON.stringify(rows) + '\n')
    console.log(`Downloaded ${rows.length} rows to ${path}`)
  }
}

async function readJson(path) {
  return JSON.parse(await readFile(join(ROOT, path), 'utf8'))
}

// Parses a CSV with a header row, failing with a clear message if any of the
// required columns are missing (e.g. Socrata renamed one).
async function readCsv(path, requiredColumns) {
  return parse(await readFile(join(ROOT, path)), {
    bom: true,
    columns: (header) => {
      const missing = requiredColumns.filter((column) => !header.includes(column))
      if (missing.length > 0) {
        throw new Error(
          `${path} is missing column(s) ${missing.map((c) => `"${c}"`).join(', ')}; found ${header.map((c) => `"${c}"`).join(', ')}`,
        )
      }
      return header
    },
  })
}

async function writeCsv(path, columns, rows) {
  await writeFile(join(ROOT, path), stringify(rows, { header: true, columns }))
  console.log(`Wrote ${rows.length} rows to ${path}`)
}

const trimmed = (value) => (value ?? '').trim()

// Party is sometimes left as the form's placeholder
const validParty = (party) => (party && party !== '*Please Select*' ? party.trim() : '')

const CANDIDATE_FIELDS = ['office', 'district', 'county', 'party']

async function archivedCandidates() {
  return new Map(
    (
      await readCsv(ORGANIZATIONAL_REPORTS_ARCHIVE, ['reg_no', 'candidate_name', ...CANDIDATE_FIELDS])
    ).map((row) => [row.reg_no.trim(), row]),
  )
}

// Election periods from the 2021 snapshot, with the candidate details from the
// 2021 organizational reports
async function archivedExpenditures(candidates) {
  const rows = await readCsv(EXPENDITURES_ARCHIVE, [
    'Expenditure Category',
    'Election Period',
    'Amount',
    'Reg No',
  ])
  return rows
    .map((row) => {
      const reg_no = row['Reg No'].trim()
      const candidate = candidates.get(reg_no)
      return {
        expenditure_category: row['Expenditure Category'].trim(),
        election_period: row['Election Period'].trim(),
        amount: row['Amount'].trim(),
        reg_no,
        candidate_name: trimmed(candidate?.candidate_name),
        office: trimmed(candidate?.office),
        district: trimmed(candidate?.district),
        county: trimmed(candidate?.county),
        party: validParty(candidate?.party),
      }
    })
    .filter((row) => fromArchive(row.election_period))
}

// The other election periods come from the live data. A candidate can file under several
// names, offices and parties, so the details for each election period come from
// the candidate's most recent filing in it: district and county from the latest
// filing for that office, and party from the latest filing that gives one (it's
// often blank), in this period if possible, else any. Blank districts and
// parties fall back to the 2021 organizational reports.
async function liveExpenditures(archivedCandidate) {
  const filings = Map.groupBy(await readJson('raw_data/candidates.json'), (row) => trimmed(row.reg_no))
  for (const rows of filings.values()) rows.sort((a, b) => b.last_date.localeCompare(a.last_date))

  const detailsFor = (reg_no, election_period) => {
    const all = filings.get(reg_no) ?? []
    const inPeriod = all.filter((row) => row.election_period === election_period)
    const latest = inPeriod[0] ?? all[0]
    if (!latest) return undefined
    const office = trimmed(latest.office)
    const sameOffice = [...inPeriod, ...all].filter((row) => row.office === latest.office)
    const old = archivedCandidate(reg_no)
    const oldSameOffice = trimmed(old?.office) === office ? old : undefined
    return {
      candidate_name: trimmed(latest.candidate_name),
      office,
      district: trimmed(sameOffice.find((row) => row.district)?.district ?? oldSameOffice?.district),
      county: trimmed(sameOffice.find((row) => row.county)?.county ?? oldSameOffice?.county),
      party:
        validParty([...inPeriod, ...all].find((row) => validParty(row.party))?.party) ||
        validParty(old?.party) ||
        'Unknown',
    }
  }

  return (await readJson('raw_data/expenditure_totals.json'))
    .map((row) => {
      const reg_no = trimmed(row.reg_no)
      const election_period = trimmed(row.election_period)
      return {
        expenditure_category: trimmed(row.expenditure_category),
        election_period,
        amount: Number(row.amount).toFixed(2),
        reg_no,
        ...detailsFor(reg_no, election_period),
      }
    })
    .filter((row) => !fromArchive(row.election_period))
}

// Writes the expenditures with each election's candidate details, and one name
// per candidate: from the 2021 reports if they're in them, so older elections
// read as before (the live data sometimes appends a "*"), else their latest
// live name.
async function writeExpendituresAndCandidates() {
  const candidates = await archivedCandidates()
  const archived = await archivedExpenditures(candidates)
  const live = await liveExpenditures((reg_no) => candidates.get(reg_no))

  const names = new Map()
  const kept = []
  const dropped = new Map()
  for (const row of [...archived, ...live]) {
    if (SKIPPED_REG_NOS.has(row.reg_no) || !row.candidate_name || !row.party || isTestCandidate(row)) {
      const skip = dropped.get(row.reg_no) ?? { name: row.candidate_name || 'unknown', amount: 0 }
      skip.amount += Number(row.amount)
      dropped.set(row.reg_no, skip)
      continue
    }
    if (!names.has(row.reg_no)) {
      names.set(row.reg_no, trimmed(candidates.get(row.reg_no)?.candidate_name) || row.candidate_name)
    }
    kept.push(row)
  }
  for (const [reg_no, { name, amount }] of dropped) {
    console.log(`Skipping $${amount.toFixed(2)} of expenditures by ${reg_no} (${name})`)
  }

  // The visualization merge-joins the two files on reg_no, so both must be
  // sorted by it and every expenditure must have a candidate.
  const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0)
  kept.sort(
    (a, b) =>
      compare(a.reg_no, b.reg_no) ||
      compare(a.election_period, b.election_period) ||
      compare(a.expenditure_category, b.expenditure_category),
  )
  await writeCsv(
    'src/public/data/campaign_spending_summary.csv',
    ['expenditure_category', 'election_period', 'amount', 'reg_no', 'id', ...CANDIDATE_FIELDS],
    kept.map((row, index) => ({ ...row, id: index + 1 })),
  )
  await writeCsv(
    'src/public/data/organizational_report.csv',
    ['reg_no', 'candidate_name'],
    [...names]
      .sort(([a], [b]) => compare(a, b))
      .map(([reg_no, candidate_name]) => ({ reg_no, candidate_name })),
  )
}

// A durable asset is reported as a purchase row and, once it's gone, a
// disposal row with the same durable_asset_id. Disposal rows carry the
// disposition `method` (Sold, Donated, ...); since 2015 purchase rows can also
// carry a placeholder diposition_amount of "0", so that field isn't a reliable
// marker.
const durableAssetKind = (row) => (row.method === undefined ? 'purchase' : 'disposal')

async function writeDurableAssets() {
  const downloaded = await readJson('raw_data/durable_assets.json')
  const current = downloaded.filter((row) => !isTestCandidate(row))
  for (const name of new Set(downloaded.filter(isTestCandidate).map((row) => row.candidate_name))) {
    console.log(`Skipping durable assets of test candidate ${name}`)
  }
  const archive = await readJson(DURABLE_ASSETS_ARCHIVE)

  // Current rows win: an archived row is kept only if the current data has no
  // row of the same kind for that asset.
  const key = (row) => `${row.durable_asset_id}/${durableAssetKind(row)}`
  const currentKeys = new Set(current.map(key))
  const rows = [...current, ...archive.filter((row) => !currentKeys.has(key(row)))]

  // Name formats changed between the two (e.g. "Anderson, J. Ikaika" vs
  // "Anderson, Ikaika"); use the current name for each registration number so
  // one candidate isn't split in two.
  const currentNames = new Map(current.map((row) => [row.reg_no, row.candidate_name]))
  for (const row of rows) row.candidate_name = currentNames.get(row.reg_no) ?? row.candidate_name

  // Socrata returns rows in no particular order; sort for stable diffs.
  rows.sort(
    (a, b) => a.durable_asset_id - b.durable_asset_id || a.date.localeCompare(b.date),
  )
  await writeFile(join(ROOT, 'src/public/data/durable_assets.json'), JSON.stringify(rows) + '\n')
  console.log(
    `Wrote ${rows.length} rows to src/public/data/durable_assets.json ` +
      `(${current.length} current, ${rows.length - current.length} from ${DURABLE_ASSETS_ARCHIVE})`,
  )
}

if (!process.argv.includes('--skip-download')) await download()
await writeExpendituresAndCandidates()
await writeDurableAssets()
