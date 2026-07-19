import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchPsxClose } from '../../src/services/prices/psx'
import { fetchMufapNavs } from '../../src/services/prices/mufap'

const asResponse = (body: string | object, ok = true) =>
  ({ ok, status: ok ? 200 : 500, json: async () => body, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) }) as Response

afterEach(() => vi.unstubAllGlobals())

describe('PSX EOD parser', () => {
  it('reads close from index 1 — the field order is [ts, close, volume, open]', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => asResponse({
      status: 1,
      data: [[1784286000, 540.94, 884337, 547], [1784199600, 547.51, 1136450, 539.26]],
    })))
    const r = await fetchPsxClose('MEBL')
    expect(r?.price).toBe(540.94) // NOT 547 (open) — the classic trap
    expect(r?.asOf).toBe('2026-07-17')
  })

  it('fails soft on empty data and non-200s', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => asResponse({ status: 1, data: [] })))
    expect(await fetchPsxClose('XXXX')).toBeNull()
    vi.stubGlobal('fetch', vi.fn(async () => asResponse({}, false)))
    expect(await fetchPsxClose('MEBL')).toBeNull()
  })
})

describe('MUFAP NAV parser', () => {
  const page = `
    <table><thead><tr>
      <th class="d-none">Sector</th><th class="d-none">AMC</th><th>Fund</th><th>Category</th>
      <th>Inception Date</th><th>Offer</th><th>Repurchase</th><th>NAV</th><th>Validity Date</th><th>Trustee</th>
    </tr></thead><tbody>
      <tr><td>Open-End</td><td>Al Meezan</td><td>  Al Meezan   Mutual Fund  </td><td>Equity</td>
        <td>1995</td><td>50.1</td><td>49.2</td><td>49.5473</td><td>Jul 17, 2026</td><td>CDC</td></tr>
      <tr><td>Open-End</td><td>Mahaana</td><td>Mahaana Islamic Cash Fund</td><td>Money Market</td>
        <td>2022</td><td>107.8</td><td>107.7</td><td>1,107.7085</td><td>Jul 18, 2026</td><td>CDC</td></tr>
      <tr><td>Open-End</td><td>Broken</td><td>No NAV Fund</td><td>x</td><td>x</td><td>x</td><td>x</td><td>n/a</td><td>Jul 18, 2026</td><td>x</td></tr>
    </tbody></table>`

  it('locates columns by header name, collapses whitespace, parses thousands and dates', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => asResponse(page)))
    const navs = await fetchMufapNavs()
    expect(navs.get('Al Meezan Mutual Fund')).toEqual({ nav: 49.5473, asOf: '2026-07-17' })
    expect(navs.get('Mahaana Islamic Cash Fund')?.nav).toBe(1107.7085)
    expect(navs.has('No NAV Fund')).toBe(false) // unparseable NAV rows are skipped
  })
})
