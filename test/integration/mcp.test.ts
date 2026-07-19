import { describe, expect, it } from 'vitest'
import { json, makeUser, mcp } from '../helpers'

describe('MCP endpoint', () => {
  it('rejects calls without a key', async () => {
    const r = await mcp(null, 'tools/list')
    expect(r.status).toBe(401)
  })

  it('initializes and lists the full toolset', async () => {
    const u = await makeUser()
    const init = await mcp(u.key, 'initialize', {
      protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'test', version: '0' },
    })
    expect(init.body.result.serverInfo.name).toBe('hamara-hisaab')

    const list = await mcp(u.key, 'tools/list')
    const names = list.body.result.tools.map((t: { name: string }) => t.name)
    expect(names.length).toBeGreaterThanOrEqual(28)
    for (const required of ['add_transaction', 'get_report', 'get_zakat_summary', 'update_loan', 'record_fx_rate']) {
      expect(names).toContain(required)
    }
  })

  it('executes tools against the caller household', async () => {
    const u = await makeUser()
    const call = await mcp(u.key, 'tools/call', {
      name: 'add_transaction',
      arguments: { type: 'expense', amount: 1200, category: 'Food & Dining', note: 'via MCP' },
    })
    const payload = JSON.parse(call.body.result.content[0].text)
    expect(payload.amount).toBe('1200.00')

    const txs = await json('/api/v1/transactions', { key: u.key })
    expect(txs).toHaveLength(1)

    // foreign entry through MCP too
    const fx = await mcp(u.key, 'tools/call', {
      name: 'add_transaction',
      arguments: { type: 'expense', amount: 20, currency: 'USD', fx_rate: 280, category: 'Other' },
    }, 2)
    expect(JSON.parse(fx.body.result.content[0].text).amount).toBe('5600.00')
  })
})
