import { describe, expect, it, vi } from 'vitest'
import { ApiAuthAdapter, ApiClient, ApiHousingDataProvider, ApiSavedAdapter } from '../src/services/api'
import { MockHousingDataProvider } from '../src/services/mock'
import { createServices } from '../src/services/runtime'
import { defaultPreferences, validatePreferences } from '../src/services/preferences'
import { createWorkspaceStorage, LocalSavedAdapter } from '../src/services/storage'

function storage(): Storage {
  const values = new Map<string, string>()
  return {
    get length() { return values.size },
    clear: () => values.clear(),
    key: index => [...values.keys()][index] ?? null,
    getItem: key => values.get(key) ?? null,
    removeItem: key => { values.delete(key) },
    setItem: (key, value) => { values.set(key, value) },
  }
}
const provider = new MockHousingDataProvider()
const selected = ['example-street', 'sample-avenue']

describe('mock provider', () => {
  it('matches multiword addresses and boroughs, and returns no matches for an unknown address', async () => {
    expect((await provider.searchBuildings('123 example Brooklyn, NY 11211')).map(result => result.id)).toEqual(['example-street'])
    expect(await provider.searchBuildings('888 imaginary road')).toEqual([])
  })

  it('cancels pending searches', async () => {
    const controller = new AbortController()
    const result = provider.searchBuildings('123', controller.signal)
    controller.abort()
    await expect(result).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('handles missing coverage and limits a comparison to common grades', async () => {
    const result = await provider.compareBuildings(selected)
    expect(result.reports[1].grades.find(grade => grade.category === 'bedbugs')).toMatchObject({ letter: null, coverage: 'unavailable' })
    expect(result.missingCategories).toEqual(['bedbugs'])
    await expect(provider.compareBuildings([selected[0], selected[0]])).rejects.toMatchObject({ status: 400 })
  })

  it('recalculates demo scores when shared category and subcategory weights change', async () => {
    const defaults = defaultPreferences(provider.scoring)
    const semi = { ...defaults, mode: 'semi' as const, weights: { ...defaults.weights, noise: 5 } }
    const advanced = { ...semi, mode: 'advanced' as const, subcategories: { ...defaults.subcategories, 'noise-frequency': 0 } }
    const [baseline, category, subcategory] = await Promise.all([
      provider.compareBuildings(selected, defaults), provider.compareBuildings(selected, semi), provider.compareBuildings(selected, advanced),
    ])
    expect(baseline.weighted).not.toEqual(category.weighted)
    expect(category.weighted).not.toEqual(subcategory.weighted)
  })
})

describe('preferences and saved properties', () => {
  it('rejects invalid ranges, zero weights, and entirely disabled configured subcategories', () => {
    const defaults = defaultPreferences(provider.scoring)
    expect(validatePreferences(defaults, provider.scoring)).toBeNull()
    expect(validatePreferences({ ...defaults, weights: { ...defaults.weights, noise: 6 } }, provider.scoring)).toMatch(/0 to 5/)
    expect(validatePreferences({ ...defaults, mode: 'semi', weights: {
      maintenance: 0, heat: 0, pests: 0, bedbugs: 0, noise: 0,
    } }, provider.scoring)).toMatch(/above zero/)
    expect(validatePreferences({ ...defaults, mode: 'advanced', subcategories: {
      ...defaults.subcategories, 'noise-frequency': 0, 'noise-distance': 0,
    } }, provider.scoring)).toMatch(/subcategory/)
  })

  it('saves and removes ids, safely ignoring malformed storage', async () => {
    const values = storage()
    values.setItem('hearthstone:v1:mock:saved', 'invalid JSON')
    const adapter = new LocalSavedAdapter(values)
    expect(await adapter.list()).toEqual([])
    await adapter.set('example-street', true)
    await adapter.set('example-street', true)
    expect(await new LocalSavedAdapter(values).list()).toEqual(['example-street'])
    await adapter.set('example-street', false)
    expect(await adapter.list()).toEqual([])
  })

  it('isolates mock comparison and preference storage from API mode', () => {
    const values = storage()
    const mock = createWorkspaceStorage(values, 'mock')
    const api = createWorkspaceStorage(values, 'api')
    const defaults = defaultPreferences(provider.scoring)
    mock.setComparison(selected)
    mock.setPreferences(defaults)
    expect(mock.getComparison()).toEqual(selected)
    expect(mock.getPreferences()).toEqual(defaults)
    expect(api.getComparison()).toEqual([])
    expect(api.getPreferences()).toBeNull()
  })
})

describe('API adapter', () => {
  const identity = {
    id: 'nyc-000000000000000000000001', address: '1 Sample Road, Brooklyn, NY 11211', borough: 'Brooklyn',
    lat: 40.71, lng: -73.9, confidence: 'tax_lot', lotUnits: 12,
  }
  const date = '2026-10-29T12:00:00.000Z'
  const report = {
    identity, checkedAt: date, demo: false,
    records: [{ id: 'noise-1', source: 'NYC 311', category: 'noise', kind: 'complaint', scope: 'nearby',
      date, status: 'Pending', description: 'Noise complaint', url: 'https://example.test/records', lat: 40.711, lng: -73.91 }],
    coverage: [{ source: 'NYC 311', status: 'truncated', checkedAt: date, count: 1 }],
    scores: [{ category: 'noise', grade: null, count: 1, explanation: 'Insufficient comparable baseline.' }],
  }

  it('selects the requested provider and requires a URL in API mode', () => {
    expect(createServices({}, storage()).housing).toBeInstanceOf(MockHousingDataProvider)
    expect(createServices({ VITE_DATA_PROVIDER: 'api', VITE_API_BASE_URL: '/api' }, storage()).housing).toBeInstanceOf(ApiHousingDataProvider)
    expect(() => createServices({ VITE_DATA_PROVIDER: 'api' }, storage())).toThrow(/VITE_API_BASE_URL/)
  })

  it('uses existing autocomplete, resolve, and report routes and maps to frontend models', async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ candidates: [identity] }))
      .mockResolvedValueOnce(Response.json(identity))
      .mockResolvedValueOnce(Response.json(report))
    const api = new ApiHousingDataProvider(new ApiClient('/api/', fetcher))
    const signal = new AbortController().signal
    const [candidate] = await api.searchBuildings('1 Sample', signal)
    const building = await api.resolveBuilding(candidate, signal)
    expect(building).toMatchObject({ address: '1 Sample Road', zip: '11211', unitScope: 'tax lot' })
    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      '/api/address/autocomplete?q=1+Sample', '/api/address/resolve?q=1+Sample+Road%2C+Brooklyn%2C+NY+11211',
    ])
    const result = await api.getBuildingReport(building.id, signal)
    expect(result).toMatchObject({ summary: null, changes: null, confidence: 'Tax-lot match' })
    expect(result.nearby[0].point).toEqual({ kind: 'geographic', lat: 40.711, lng: -73.91 })
    expect(result.grades.find(grade => grade.category === 'noise')).toMatchObject({ letter: null, coverage: 'limited' })
    expect(fetcher.mock.calls[2][1]?.signal).toBe(signal)
  })

  it('leaves default weights to the API and accepts only supplied comparison values', async () => {
    const second = { ...identity, id: 'nyc-000000000000000000000002' }
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({
      reports: [report, { ...report, identity: second }], common: [], missing: ['noise'],
      ranked: [{ id: identity.id, value: null }, { id: second.id, value: null }],
    }))
    const api = new ApiHousingDataProvider(new ApiClient('/api', fetcher))
    const ids = [identity.id, second.id]
    const result = await api.compareBuildings(ids, defaultPreferences(api.scoring))
    expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toEqual({ ids })
    expect(result.weighted).toEqual(ids.map(id => ({ id, value: null })))
  })

  it('uses the backend session cookie and the public saved-building contract', async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ error: { message: 'unauthorized' } }, { status: 401 }))
      .mockResolvedValueOnce(Response.json({ email: 'renter@example.test' }))
      .mockResolvedValueOnce(Response.json({ buildings: [{ building_id: identity.id }], comparisons: [] }))
      .mockResolvedValueOnce(Response.json({ saved: true }))
      .mockResolvedValueOnce(Response.json({ deleted: true }))
    const client = new ApiClient('/api', fetcher)
    const auth = new ApiAuthAdapter(client)
    const saved = new ApiSavedAdapter(client)
    expect(await auth.getSession()).toBeNull()
    expect(await auth.getSession()).toEqual({ email: 'renter@example.test' })
    expect(await saved.list()).toEqual([identity.id])
    await saved.set(identity.id, true)
    await saved.set(identity.id, false)
    expect(fetcher.mock.calls[3][1]).toMatchObject({
      method: 'POST', credentials: 'include', body: JSON.stringify({ kind: 'building', ids: [identity.id] }),
    })
    expect(fetcher.mock.calls[4][1]).toMatchObject({
      method: 'DELETE', credentials: 'include', body: JSON.stringify({ kind: 'building', id: identity.id }),
    })
  })

  it('reports HTTP, malformed payload, and network failures', async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ error: { message: 'Source unavailable.' } }, { status: 503 }))
      .mockResolvedValueOnce(Response.json({ candidates: [{ address: 'bad' }] }))
      .mockRejectedValueOnce(new TypeError('offline'))
    const api = new ApiHousingDataProvider(new ApiClient('https://example.test/api', fetcher))
    await expect(api.searchBuildings('Sample')).rejects.toMatchObject({ message: 'Source unavailable.', status: 503 })
    await expect(api.searchBuildings('Sample')).rejects.toThrow(/unexpected response/)
    await expect(api.searchBuildings('Sample')).rejects.toThrow(/unreachable/)
  })
})
