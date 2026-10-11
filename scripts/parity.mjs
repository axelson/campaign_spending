// Drives two builds of the site through the same interactions and checks that
// they behave identically: bubble layout, visible text, Socrata requests,
// console errors and screenshots.
//
// Usage: node scripts/parity.mjs <reference-url> <candidate-url> [out-dir]
//   e.g. node scripts/parity.mjs http://localhost:8001 http://localhost:4173
//
// Set CHROMIUM_PATH to use a specific Chromium build instead of Playwright's.

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { chromium } from 'playwright'
import pixelmatch from 'pixelmatch'
import { PNG } from 'pngjs'

const [referenceUrl, candidateUrl, outDir = 'parity-output'] = process.argv.slice(2)
if (!referenceUrl || !candidateUrl) {
  console.error('Usage: node scripts/parity.mjs <reference-url> <candidate-url> [out-dir]')
  process.exit(2)
}

// Hosts the pages may reach; everything else is aborted. Analytics, Google
// Fonts and the ArcGIS power ballot lookup are blocked so both runs see the
// same (offline) conditions.
const SOCRATA = 'hicscdata.hawaii.gov'
const SOCRATA_FIXTURE = [
  {
    date: '2021-03-29T00:00:00.000',
    expenditure_category: 'Contract, Employee & Professional Services',
    vendor_name: 'Squarespace',
    purpose_of_expenditure: 'webhosting services and update of site',
    amount: '152.46',
  },
  {
    date: '2020-09-02T00:00:00.000',
    expenditure_category: 'Contract, Employee & Professional Services',
    vendor_name: 'Example Vendor',
    purpose_of_expenditure: 'consulting',
    amount: '1200',
  },
]

// Runs before any page script. Seeds Math.random so the bubble start positions
// and the force layout are reproducible, and stubs Google Analytics.
const INIT_SCRIPT = `
  (() => {
    let seed = 0x2f6b9a1d
    Math.random = () => {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
    window.ga = () => {}
  })()
`

// Snapshot of everything the comparison cares about, taken inside the page.
function captureState() {
  const r = (v) => (v == null ? null : Math.round(parseFloat(v) * 100) / 100)
  const visibleText = (selector) => {
    const el = document.querySelector(selector)
    if (!el) return null
    const style = getComputedStyle(el)
    if (style.display === 'none' || style.visibility === 'hidden') return null
    return el.innerText.replace(/\s+/g, ' ').trim()
  }
  return {
    circles: [...document.querySelectorAll('circle')].map((c) => [
      c.id,
      c.getAttribute('class'),
      r(c.getAttribute('r')),
      r(c.getAttribute('cx')),
      r(c.getAttribute('cy')),
      getComputedStyle(c).fill,
      r(getComputedStyle(c).opacity),
    ]),
    svgText: [...document.querySelectorAll('#vis text')].map((t) => [
      t.textContent,
      r(t.getAttribute('x')),
      r(t.getAttribute('y')),
      getComputedStyle(t).display,
    ]),
    nav: [...document.querySelectorAll('.viz_nav')].map((n) => [n.dataset.name, n.className, n.dataset.year ?? null]),
    yearArrows: [...document.querySelectorAll('.viz_nav img')].map((i) => [i.className, i.getAttribute('src')]),
    legend: visibleText('#mini-legend-body'),
    tooltip: visibleText('#expenditure_tooltip'),
    modal: visibleText('#candidate_modal'),
    search: visibleText('.candidate_search_container'),
    searchValue: document.querySelector('.candidate_search_container input')?.value ?? null,
    hash: location.hash,
  }
}

// Waits until nothing on the page is moving: the captured state is unchanged
// across several polls and no jQuery animations are running.
async function settle(page) {
  let previous = null
  let stable = 0
  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    await page.waitForTimeout(250)
    const state = JSON.stringify(await page.evaluate(captureState))
    const animating = await page.evaluate(() => (window.jQuery ? jQuery(':animated').length : 0))
    stable = state === previous && animating === 0 ? stable + 1 : 0
    if (stable >= 4) return
    previous = state
  }
  throw new Error('page did not settle within 60s')
}

// The first candidate bubble in DOM order; plain `circle` also matches the size legend.
const BUBBLE = 'circle[id^=bubble_] >> nth=0'

const STEPS = [
  ['load', async (page, baseUrl) => {
    await page.goto(baseUrl)
    await page.waitForSelector('circle', { timeout: 30_000 })
  }],
  ...['office', 'expenditure', 'candidate', 'party', 'island'].map((name) => [
    `group-${name}`,
    (page) => page.click(`.viz_nav[data-name=${name}]`),
  ]),
  ['group-off', (page) => page.click('.viz_nav[data-name=island]')],
  ['previous-year', (page) => page.click('.viz_nav .left-arrow')],
  ['previous-year-again', (page) => page.click('.viz_nav .left-arrow')],
  ['next-year', (page) => page.click('.viz_nav .right-arrow')],
  ['next-year-again', (page) => page.click('.viz_nav .right-arrow')],
  ['legend-open', (page) => page.click('#mini-legend')],
  ['legend-close', (page) => page.click('#mini-legend')],
  ['hover-bubble', (page) => page.dispatchEvent(BUBBLE, 'mouseover')],
  ['unhover-bubble', (page) => page.dispatchEvent(BUBBLE, 'mouseout')],
  ['group-candidate-for-search', (page) => page.click('.viz_nav[data-name=candidate]')],
  ['search-type', async (page) => {
    const input = page.locator('.candidate_search_container input.autocomplete')
    if (!(await input.isVisible())) throw new Error('candidate search input is not visible')
    await input.pressSequentially('Baker', { delay: 50 })
    await page.waitForSelector('.autocomplete-suggestion', { timeout: 5000 })
  }],
  ['search-select', (page) => page.click('.autocomplete-suggestion >> nth=0')],
  ['search-clear', (page) => page.fill('.candidate_search_container input.autocomplete', '')],
  ['group-candidate-off', (page) => page.click('.viz_nav[data-name=candidate]')],
  ['modal-open', async (page) => {
    await page.click(BUBBLE)
    await page.waitForSelector('#candidate_modal .expenditure-record-table', { timeout: 10_000 })
  }],
  ['modal-close', (page) => page.click('#candidate_modal .close-reveal-modal')],
]

async function run(browser, baseUrl, label) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  await context.addInitScript(INIT_SCRIPT)

  const base = new URL(baseUrl)
  const socrataRequests = []
  const blocked = []
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url())
    if (url.host === base.host) return route.continue()
    if (url.host === SOCRATA) {
      socrataRequests.push(decodeURIComponent(url.pathname + url.search))
      return route.fulfill({
        json: SOCRATA_FIXTURE,
        headers: { 'access-control-allow-origin': '*' },
      })
    }
    blocked.push(url.host)
    return route.abort('blockedbyclient')
  })

  const page = await context.newPage()
  const errors = []
  // Requests aborted by the route above log ERR_BLOCKED_BY_CLIENT; those are expected.
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !msg.text().includes('ERR_BLOCKED_BY_CLIENT')) errors.push(msg.text())
  })
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`))

  const dir = join(outDir, label)
  await mkdir(dir, { recursive: true })

  const results = []
  for (const [index, [name, action]] of STEPS.entries()) {
    const stepErrors = errors.length
    const stepRequests = socrataRequests.length
    let failure = null
    try {
      await action(page, baseUrl)
      await settle(page)
    } catch (err) {
      failure = err.message.split('\n')[0]
    }
    const screenshotPath = join(dir, `${String(index).padStart(2, '0')}-${name}.png`)
    await page.screenshot({ path: screenshotPath, fullPage: true })
    results.push({
      name,
      failure,
      state: await page.evaluate(captureState),
      socrataRequests: socrataRequests.slice(stepRequests),
      errors: errors.slice(stepErrors),
      screenshotPath,
    })
  }

  await writeFile(join(dir, 'results.json'), JSON.stringify(results, null, 2))
  await context.close()
  return { results, blocked: [...new Set(blocked)].sort() }
}

function diffScreenshots(a, b, diffPath) {
  const imgA = PNG.sync.read(a)
  const imgB = PNG.sync.read(b)
  if (imgA.width !== imgB.width || imgA.height !== imgB.height) {
    return { size: `${imgA.width}x${imgA.height} vs ${imgB.width}x${imgB.height}` }
  }
  const diff = new PNG({ width: imgA.width, height: imgA.height })
  const pixels = pixelmatch(imgA.data, imgB.data, diff.data, imgA.width, imgA.height, { threshold: 0.1 })
  return { pixels, ratio: pixels / (imgA.width * imgA.height), diffPng: PNG.sync.write(diff), diffPath }
}

function firstDifference(a, b, path = '') {
  if (JSON.stringify(a) === JSON.stringify(b)) return null
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) {
    return `${path || '(root)'}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`
  }
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const found = firstDifference(a[key], b[key], `${path}${Array.isArray(a) ? `[${key}]` : `.${key}`}`)
    if (found) return found
  }
  return `${path}: differs`
}

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
const reference = await run(browser, referenceUrl, 'reference')
const candidate = await run(browser, candidateUrl, 'candidate')
await browser.close()

// Screenshots may differ by antialiasing noise only.
const MAX_PIXEL_RATIO = 0.001
let failed = false
const report = (ok, line) => {
  if (!ok) failed = true
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${line}`)
}

for (const [i, ref] of reference.results.entries()) {
  const cand = candidate.results[i]
  const problems = []
  if (ref.failure) problems.push(`reference step failed: ${ref.failure}`)
  if (cand.failure) problems.push(`candidate step failed: ${cand.failure}`)
  const stateDiff = firstDifference(ref.state, cand.state)
  if (stateDiff) problems.push(`state ${stateDiff}`)
  const requestDiff = firstDifference(ref.socrataRequests, cand.socrataRequests)
  if (requestDiff) problems.push(`socrata requests ${requestDiff}`)
  if (ref.errors.length) problems.push(`reference errors: ${ref.errors.join(' | ')}`)
  if (cand.errors.length) problems.push(`candidate errors: ${cand.errors.join(' | ')}`)

  const shot = diffScreenshots(
    await readFile(ref.screenshotPath),
    await readFile(cand.screenshotPath),
    join(outDir, `diff-${String(i).padStart(2, '0')}-${ref.name}.png`),
  )
  if (shot.size) problems.push(`screenshot size ${shot.size}`)
  else if (shot.ratio > MAX_PIXEL_RATIO) {
    problems.push(`screenshot differs in ${shot.pixels} px (${(shot.ratio * 100).toFixed(3)}%), see ${shot.diffPath}`)
    await writeFile(shot.diffPath, shot.diffPng)
  }

  const summary = `${ref.state.circles.length} circles` + (ref.socrataRequests.length ? `, ${ref.socrataRequests.length} socrata request(s)` : '')
  report(problems.length === 0, `${ref.name} (${summary})${problems.map((p) => `\n       ${p}`).join('')}`)
}

console.log(`\nblocked hosts (reference): ${reference.blocked.join(', ') || 'none'}`)
// The candidate build should be self-contained apart from the Socrata lookup.
report(candidate.blocked.length === 0, `blocked hosts (candidate): ${candidate.blocked.join(', ') || 'none'}`)
console.log(failed ? '\nPARITY FAILED' : '\nPARITY OK')
process.exit(failed ? 1 : 0)
