import { z } from 'zod'
import {
  categories, type Building, type BuildingReport, type Coverage, type Grade, type GradeCategory,
  type Issue, type RatingPreferences, type ScoringOptions, type Source,
} from '../domain'
import { ServiceError, type AuthAdapter, type HousingDataProvider, type SavedAdapter } from './contracts'
import { validatePreferences } from './preferences'

const category = z.enum(categories)
const id = z.string().min(1).max(150)
const date = z.string().refine(value => Number.isFinite(Date.parse(value)))
const letter = z.enum(['A', 'B', 'C', 'D', 'E', 'F'])
const latitude = z.number().min(-90).max(90)
const longitude = z.number().min(-180).max(180)
const identity = z.object({
  id, address: z.string().min(1), borough: z.string().min(1), lat: latitude, lng: longitude,
  confidence: z.enum(['building', 'tax_lot', 'unverified', 'ambiguous']),
  lotUnits: z.number().nonnegative().optional(), demo: z.boolean().optional(),
})
const evidence = z.object({
  id, source: z.string(), category,
  kind: z.enum(['violation', 'inspection', 'filing', 'complaint']),
  scope: z.enum(['building', 'tax_lot', 'nearby']), date, status: z.string(), description: z.string(),
  url: z.string(), lat: latitude.optional(), lng: longitude.optional(),
})
const sourceCoverage = z.object({
  source: z.string(), status: z.enum(['ok', 'error', 'unmatched', 'truncated', 'stale']),
  checkedAt: date, count: z.number().int().nonnegative(), message: z.string().optional(),
})
const reportSchema = z.object({
  identity, records: z.array(evidence), coverage: z.array(sourceCoverage), checkedAt: date, demo: z.boolean(),
  scores: z.array(z.object({
    category, grade: letter.nullable(), count: z.number().int().nonnegative(), explanation: z.string(),
  })),
})
const comparisonSchema = z.object({
  reports: z.array(reportSchema), common: z.array(category), missing: z.array(category),
  ranked: z.array(z.object({ id, value: z.number().nullable() })),
})

export class ApiClient {
  private readonly base: string
  constructor(base: string, private readonly fetcher: typeof fetch = (...args) => fetch(...args)) {
    this.base = base.trim().replace(/\/+$/, '')
    if (!/^\/(?!\/)/.test(this.base) && !/^https?:\/\/[^/]+/.test(this.base)) {
      throw new ServiceError('Set VITE_API_BASE_URL to an HTTP URL or a path such as /api.')
    }
  }

  async request<T>(path: string, schema: z.ZodType<T>, options: RequestInit = {}) {
    let response: Response
    try {
      response = await this.fetcher(this.base + path, {
        ...options, credentials: 'include',
        headers: { Accept: 'application/json', ...(options.body && { 'Content-Type': 'application/json' }) },
      })
    } catch (error) {
      if (options.signal?.aborted) throw error
      throw new ServiceError('The service is unreachable. Check your connection and try again.')
    }
    const payload: unknown = await response.json().catch(() => null)
    if (options.signal?.aborted) options.signal.throwIfAborted()
    if (!response.ok) {
      const parsed = z.object({ error: z.object({ message: z.string() }) }).safeParse(payload)
      throw new ServiceError(parsed.success ? parsed.data.error.message : 'The service could not complete this request.', response.status)
    }
    const parsed = schema.safeParse(payload)
    if (!parsed.success) throw new ServiceError('The service returned an unexpected response.')
    return parsed.data
  }
}

function safeSourceUrl(value?: string) {
  return value && /^https?:\/\//i.test(value) ? value : undefined
}

function mapBuilding(value: z.infer<typeof identity>, sample = value.demo ?? false): Building {
  const [address] = value.address.split(',')
  return {
    id: value.id, address, borough: value.borough, zip: value.address.match(/\b(1\d{4})\s*$/)?.[1],
    units: value.lotUnits, unitScope: 'tax lot', match: value.confidence, sample,
    position: sample ? undefined : { lat: value.lat, lng: value.lng },
  }
}

const matchLabels = {
  building: 'Building-level match', tax_lot: 'Tax-lot match', unverified: 'Address match unverified', ambiguous: 'Multiple buildings on lot',
}
const kindLabels = { violation: 'Housing violation', inspection: 'Inspection', filing: 'Owner filing', complaint: '311 complaint' }
const sourceNames: Record<GradeCategory, RegExp> = {
  maintenance: /violation|311/i, heat: /violation|311/i, pests: /rodent|violation|311/i,
  bedbugs: /bedbug/i, noise: /311/i,
}

function mapReport(value: z.infer<typeof reportSchema>): BuildingReport {
  const sources = new Map<string, Source>()
  const coverage: Coverage[] = value.coverage.map(row => {
    const source = { id: row.source, label: row.source, updatedAt: row.checkedAt,
      url: safeSourceUrl(value.records.find(record => record.source === row.source)?.url) }
    sources.set(row.source, source)
    return { source, status: row.status, count: row.count, message: row.message }
  })
  const issues: Issue[] = value.records.map<Issue>(row => ({
    id: row.id, category: row.category, title: kindLabels[row.kind], date: row.date,
    scope: row.scope, description: row.description,
    status: /^(close|closed|resolved)$/i.test(row.status) ? 'resolved' : /^open$/i.test(row.status) ? 'open' : 'unknown',
    source: sources.get(row.source) ?? { id: row.source, label: row.source, url: safeSourceUrl(row.url) },
    position: row.lat === undefined || row.lng === undefined || value.demo ? undefined : { lat: row.lat, lng: row.lng },
  })).sort((first, second) => Date.parse(second.date) - Date.parse(first.date))
  const grades: Grade[] = categories.map(category => {
    const score = value.scores.find(score => score.category === category)
    const used = new Set(issues.filter(issue => issue.category === category).map(issue => issue.source.id))
    const relevant = coverage.filter(row => used.has(row.source.id) || sourceNames[category].test(row.source.label))
    const complete = relevant.length > 0 && relevant.every(row => row.status === 'ok')
    const usable = relevant.some(row => ['ok', 'truncated', 'stale'].includes(row.status))
    return {
      category, letter: score?.grade ?? null,
      description: score?.explanation ?? 'No evaluation was supplied for this category.',
      count: usable || (score?.count ?? 0) > 0 ? score?.count : undefined,
      coverage: complete ? 'available' : usable ? 'limited' : 'unavailable',
      sources: [...new Map([...relevant.map(row => row.source), ...issues.filter(issue => issue.category === category).map(issue => issue.source)]
        .map(source => [source.id, source])).values()],
      updatedAt: value.checkedAt,
      subcategories: [],
      limitations: relevant.filter(row => row.status !== 'ok').map(row =>
        row.source.label + ' · ' + row.status + (row.message ? '. ' + row.message : '')).join(' ') || undefined,
    }
  })
  return {
    building: mapBuilding(value.identity, value.demo), checkedAt: value.checkedAt,
    summary: null, grades, overall: null, issues, coverage, confidence: matchLabels[value.identity.confidence],
    nearby: issues.flatMap(issue => issue.scope === 'nearby' && issue.position ?
      [{ ...issue, point: { kind: 'geographic' as const, ...issue.position } }] : []),
    changes: null, questions: null,
  }
}

export class ApiHousingDataProvider implements HousingDataProvider {
  readonly mode = 'api' as const
  readonly scoring: ScoringOptions = {
    defaults: { maintenance: 3, heat: 3, pests: 3, bedbugs: 3, noise: 3 },
    subcategories: {},
    supportsAdvanced: false,
  }
  constructor(private readonly client: ApiClient) {}

  async searchBuildings(query: string, signal?: AbortSignal) {
    const { candidates } = await this.client.request('/address/autocomplete?' + new URLSearchParams({ q: query }), z.object({
      candidates: z.array(identity),
    }), { signal })
    return [...new Map(candidates.map(candidate => [candidate.id, candidate])).values()].map(candidate => ({
      ...mapBuilding(candidate), address: candidate.address,
    }))
  }

  async resolveBuilding(candidate: Building, signal?: AbortSignal) {
    const result = await this.client.request('/address/resolve?' + new URLSearchParams({ q: candidate.address }), identity, { signal })
    return mapBuilding(result)
  }

  async getBuildingReport(buildingId: string, signal?: AbortSignal) {
    return mapReport(await this.client.request('/buildings/' + encodeURIComponent(buildingId), reportSchema, { signal }))
  }

  async compareBuildings(ids: string[], preferences?: RatingPreferences, signal?: AbortSignal) {
    if (ids.length < 2 || ids.length > 3 || new Set(ids).size !== ids.length) {
      throw new ServiceError('Choose two or three distinct buildings.', 400)
    }
    if (preferences?.mode === 'advanced') throw new ServiceError('The current API supports category weights only.', 400)
    const validation = preferences && validatePreferences(preferences, this.scoring)
    if (validation) throw new ServiceError(validation, 400)
    const result = await this.client.request('/compare', comparisonSchema, {
      method: 'POST', signal, body: JSON.stringify({
        ids, weights: preferences?.mode === 'semi' ? preferences.weights : undefined,
      }),
    })
    const reports = new Map(result.reports.map(report => [report.identity.id, mapReport(report)]))
    if (ids.some(id => !reports.has(id))) throw new ServiceError('The comparison omitted a selected building.')
    return {
      reports: ids.map(id => reports.get(id)!), weighted: result.ranked,
      sharedCategories: result.common, missingCategories: result.missing,
      scoreLabel: 'Weighted burden percentile (lower = less recorded burden)',
    }
  }
}

export class ApiAuthAdapter implements AuthAdapter {
  readonly available = true
  constructor(private readonly client: ApiClient) {}
  async getSession(signal?: AbortSignal) {
    try {
      return await this.client.request('/account', z.object({ email: z.email() }), { signal })
    } catch (error) {
      if (error instanceof ServiceError && error.status === 401) return null
      throw error
    }
  }
  async signIn(email: string) {
    const result = await this.client.request('/auth', z.object({ message: z.string() }), {
      method: 'POST', body: JSON.stringify({ email }),
    })
    return result.message
  }
  async signOut() {
    await this.client.request('/auth', z.object({ signedOut: z.literal(true) }), { method: 'DELETE' })
  }
}

export class ApiSavedAdapter implements SavedAdapter {
  constructor(private readonly client: ApiClient) {}
  async list(signal?: AbortSignal) {
    const result = await this.client.request('/saved', z.object({
      buildings: z.array(z.object({ building_id: id })),
    }), { signal })
    return [...new Set(result.buildings.map(row => row.building_id))]
  }
  async set(id: string, saved: boolean) {
    await this.client.request<{ saved: true } | { deleted: true }>('/saved', saved ? z.object({ saved: z.literal(true) }) : z.object({ deleted: z.literal(true) }), {
      method: saved ? 'POST' : 'DELETE',
      body: JSON.stringify(saved ? { kind: 'building', ids: [id] } : { kind: 'building', id }),
    })
  }
}
