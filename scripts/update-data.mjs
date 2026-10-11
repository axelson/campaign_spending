// Downloads the Socrata exports into raw_data/ and reshapes them into the CSVs
// the visualization loads from src/public/data/.
//
// Usage: npm run update-data [-- --skip-download]
//   --skip-download  reuse the files already in raw_data/
//
// Downloading needs API_KEY_ID and API_KEY_SECRET in .env (see README).

import { readFile, writeFile } from 'node:fs/promises'
import { parse } from 'csv-parse/sync'
import { stringify } from 'csv-stringify/sync'

const SOURCES = {
  // Rolled up data set for expenditures
  // https://hicscdata.hawaii.gov/dataset/Hawaii-Campaign-Spending-Rollup/9g8z-ggqz/data
  'raw_data/expenditures.csv':
    'https://hicscdata.hawaii.gov/resource/9g8z-ggqz.csv?$limit=100000',
  'raw_data/organizational_reports.csv':
    'https://hicscdata.hawaii.gov/resource/8ry8-ip7m.csv?$limit=50000',
}

// Ronald, Strode's data is bad
const SKIPPED_REG_NOS = new Set(['CC11033'])

async function download() {
  const { API_KEY_ID, API_KEY_SECRET } = process.env
  if (!API_KEY_ID || !API_KEY_SECRET) {
    throw new Error('API_KEY_ID and API_KEY_SECRET must be set (see .env.sample)')
  }
  const auth = 'Basic ' + Buffer.from(`${API_KEY_ID}:${API_KEY_SECRET}`).toString('base64')

  for (const [path, url] of Object.entries(SOURCES)) {
    const response = await fetch(url, { headers: { Authorization: auth } })
    if (!response.ok) {
      throw new Error(`${url} returned ${response.status} ${response.statusText}`)
    }
    await writeFile(path, await response.text())
    console.log(`Downloaded ${path}`)
  }
}

async function readCsv(path) {
  return parse(await readFile(path), { columns: true })
}

async function writeCsv(path, columns, rows) {
  await writeFile(path, stringify(rows, { header: true, columns }))
  console.log(`Wrote ${rows.length} rows to ${path}`)
}

async function writeExpenditures() {
  const rows = (await readCsv('raw_data/expenditures.csv')).map((row, index) => ({
    expenditure_category: row['Expenditure Category'].trim(),
    election_period: row['Election Period'].trim(),
    amount: row['Amount'].trim(),
    reg_no: row['Reg No'].trim(),
    id: index + 1,
  }))
  await writeCsv(
    'src/public/data/campaign_spending_summary.csv',
    ['expenditure_category', 'election_period', 'amount', 'reg_no', 'id'],
    rows,
  )
}

async function writeOrganizationalReports() {
  const rows = []
  for (const row of await readCsv('raw_data/organizational_reports.csv')) {
    if (SKIPPED_REG_NOS.has(row.reg_no)) continue
    if (!row.party) {
      console.log(
        `Skipping candidate with Reg No ${row.reg_no} and name ${row.candidate_name} because missing party`,
      )
      continue
    }
    rows.push({
      reg_no: row.reg_no.trim(),
      candidate_name: row.candidate_name.trim(),
      office: row.office.trim(),
      district: row.district.trim(),
      county: row.county.trim(),
      party: row.party.trim(),
    })
  }
  await writeCsv(
    'src/public/data/organizational_report.csv',
    ['reg_no', 'candidate_name', 'office', 'district', 'county', 'party'],
    rows,
  )
}

if (!process.argv.includes('--skip-download')) await download()
await writeExpenditures()
await writeOrganizationalReports()
