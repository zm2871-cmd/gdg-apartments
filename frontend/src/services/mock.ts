import {
  categories, type Building, type BuildingReport, type Grade, type GradeCategory, type Issue,
  type Letter, type RatingPreferences, type ScoringOptions, type Source,
} from '../domain'
import { ServiceError, type HousingDataProvider } from './contracts'
import { validatePreferences } from './preferences'

const checkedAt = '2026-10-29T12:00:00Z'
const source = (id: string, label: string): Source => ({ id, label, updatedAt: checkedAt })
const hpd = source('hpd-sample', 'HPD · sample records')
const health = source('health-sample', 'NYC Health · sample records')
const complaints = source('311-sample', 'NYC 311 · sample records')

export const sampleBuildings: readonly Building[] = [
  { id: 'example-street', address: '123 Example Street', borough: 'Brooklyn', zip: '11211', units: 42, built: 1931, sample: true },
  { id: 'sample-avenue', address: '48 Sample Avenue', borough: 'Queens', zip: '11106', units: 26, built: 1962, sample: true },
  { id: 'demo-place', address: '76 Demo Place', borough: 'Manhattan', zip: '10003', units: 18, built: 1925, sample: true },
]

const grade = (
  category: GradeCategory, letter: Letter | null, description: string, countLabel: string,
  period: string, dataSource: Source, subcategories: Grade['subcategories'] = [],
): Grade => ({
  category, letter, description, countLabel, period, sources: [dataSource], updatedAt: checkedAt,
  coverage: letter === null ? 'unavailable' : category === 'noise' ? 'limited' : 'available',
  subcategories,
  limitations: category === 'noise'
    ? 'Nearby 311 reports describe the surrounding block. Complaint volume depends on reporting activity.'
    : 'This category uses a synthetic observation period. Public records can lag or miss unreported issues.',
})

const firstGrades = [
  { ...grade('maintenance', 'B', 'A few housing code violations', '3 in past 3 years', 'Past 3 years', hpd, [
    { id: 'maintenance-violations', label: 'Maintenance violations', letter: 'B', count: 3 },
    { id: 'maintenance-open', label: 'Open violations', letter: 'A', count: 1 },
  ]), count: 3 },
  { ...grade('heat', 'A', 'Few reported outages', '1 in past year', 'Past year', hpd), count: 1 },
  { ...grade('pests', 'C', 'Recent inspection concerns', '4 records', 'Past year', health, [
    { id: 'pests-inspections', label: 'Rodent inspections', letter: 'C', count: 2 },
    { id: 'pests-complaints', label: 'Pest complaints', letter: 'B', count: 2 },
  ]), count: 4 },
  { ...grade('bedbugs', 'A', 'No recent reported infestations', '0 recent filings', 'Most recent filing period', hpd), count: 0 },
  { ...grade('noise', 'D', 'Frequent complaints within one block', '12 in past year', 'Past year', complaints, [
    { id: 'noise-frequency', label: 'Complaint frequency', letter: 'D', count: 12 },
    { id: 'noise-distance', label: 'Distance from building', letter: 'C' },
  ]), count: 12 },
]

function issue(id: string, category: GradeCategory, title: string, date: string, status: Issue['status'], source: Source, description: string): Issue {
  return { id, category, title, date, status, source, description, scope: category === 'noise' ? 'nearby' : 'building' }
}

const firstIssues = [
  issue('noise-oct', 'noise', 'Noise complaint nearby', '2026-10-24', 'unknown', complaints, 'Residential noise · about 90 m away'),
  issue('rodent-sep', 'pests', 'Rodent inspection flagged active signs', '2026-09-18', 'open', health, 'Building-level record · active signs observed during inspection'),
  issue('repair-jul', 'maintenance', 'Repair violation marked closed', '2026-07-02', 'resolved', hpd, 'Housing maintenance code · Class B'),
  issue('heat-feb', 'heat', 'Heat complaint recorded', '2026-02-12', 'resolved', hpd, 'Building-level report · heat restored'),
  issue('repair-jan', 'maintenance', 'Hallway lighting repair pending', '2026-01-22', 'open', hpd, 'Common-area maintenance · Class A'),
]

const coverage: BuildingReport['coverage'] = [
  { source: hpd, status: 'ok', count: 4 },
  { source: health, status: 'ok', count: 4 },
  { source: complaints, status: 'truncated', count: 12, message: 'Illustrative neighborhood sample.' },
]

const reports: BuildingReport[] = [
  {
    building: sampleBuildings[0], checkedAt, overall: 'B', confidence: 'Mixed sample coverage', coverage,
    summary: 'Few recorded heat or bedbug issues, but recent pest reports and frequent nearby noise are worth a closer look.',
    grades: firstGrades, issues: firstIssues, proximity: '8 min walk to sample subway stop',
    nearby: [
      { ...firstIssues[0], point: { kind: 'illustration', x: 53, y: 23 } },
      { ...firstIssues[1], id: 'pest-nearby', title: 'Nearby pest record', description: 'Sample pest complaint on the adjacent block.', point: { kind: 'illustration', x: 33, y: 41 } },
      { ...firstIssues[0], id: 'noise-east', title: 'Late-night music complaint', description: 'Sample noise report east of the building.', point: { kind: 'illustration', x: 73, y: 39 } },
      { ...firstIssues[0], id: 'noise-south', title: 'Street noise complaint', description: 'Sample noise report south of the building.', point: { kind: 'illustration', x: 31, y: 67 } },
    ],
    changes: [{ id: 'october', title: '2 new issues since last month', description: '1 noise complaint · 1 pest record', period: 'October 2026 sample snapshot' }],
    questions: [
      'What was done after the most recent rodent inspection, and has there been a follow-up?',
      'How is late-night noise from the surrounding block addressed?',
      'What repair work resolved the Class B violation, and when was it completed?',
    ],
  },
  {
    building: sampleBuildings[1], checkedAt, overall: 'B', confidence: 'Limited sample coverage',
    summary: 'The sample records show fewer nearby noise complaints and an open maintenance issue. Bedbug filing coverage is unavailable.',
    grades: [
      { ...grade('maintenance', 'C', 'Open common-area repair', '4 in past 3 years', 'Past 3 years', hpd, [
        { id: 'maintenance-violations', label: 'Maintenance violations', letter: 'B', count: 4 },
        { id: 'maintenance-open', label: 'Open violations', letter: 'D', count: 2 },
      ]), count: 4 },
      { ...grade('heat', 'B', 'Two reported outages', '2 in past year', 'Past year', hpd), count: 2 },
      { ...grade('pests', 'A', 'Few inspection concerns', '1 record', 'Past year', health), count: 1 },
      grade('bedbugs', null, 'Filing coverage unavailable', 'Unavailable', 'Most recent filing period', hpd),
      { ...grade('noise', 'B', 'Occasional nearby complaints', '3 in past year', 'Past year', complaints, [
        { id: 'noise-frequency', label: 'Complaint frequency', letter: 'B', count: 3 },
        { id: 'noise-distance', label: 'Distance from building', letter: 'A' },
      ]), count: 3 },
    ],
    coverage: [{ source: hpd, status: 'unmatched', count: 4, message: 'Sample bedbug filings could not be matched.' }],
    issues: [issue('stairs', 'maintenance', 'Stairwell repair pending', '2026-09-11', 'open', hpd, 'Common-area maintenance · Class B')],
    nearby: [], changes: null,
    questions: ['When is the stairwell repair scheduled, and has the violation been reinspected?'],
  },
  {
    building: sampleBuildings[2], checkedAt, overall: null, confidence: 'Partial sample coverage',
    summary: null,
    grades: [
      { ...grade('maintenance', 'A', 'Few recorded violations', '1 in past 3 years', 'Past 3 years', hpd), count: 1 },
      { ...grade('heat', 'C', 'Several reported outages', '4 in past year', 'Past year', hpd), count: 4 },
      grade('pests', null, 'Inspection coverage unavailable', 'Unavailable', 'Past year', health),
      { ...grade('bedbugs', 'B', 'One recent filing', '1 recent filing', 'Most recent filing period', hpd), count: 1 },
      { ...grade('noise', 'C', 'Recurring nearby complaints', '7 in past year', 'Past year', complaints), count: 7 },
    ],
    coverage: [{ source: health, status: 'error', count: 0, message: 'Sample inspection source unavailable.' }],
    issues: [], nearby: [], changes: [], questions: null, proximity: '4 min walk to sample subway stop',
  },
]

export const samplePreviews = reports.slice(0, 2).map(({ building, grades }) => ({
  building,
  grades: grades.map(({ category, letter }) => ({ category, letter })),
}))

function abortableDelay(signal?: AbortSignal) {
  signal?.throwIfAborted()
  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      signal?.removeEventListener('abort', cancel)
      resolve()
    }, 160)
    function cancel() {
      clearTimeout(timeout)
      reject(signal?.reason)
    }
    signal?.addEventListener('abort', cancel, { once: true })
  })
}

function reportFor(id: string) {
  const report = reports.find(value => value.building.id === id)
  if (!report) throw new ServiceError('This demonstration building could not be found.', 404)
  return report
}

export class MockHousingDataProvider implements HousingDataProvider {
  readonly mode = 'mock' as const
  readonly scoring: ScoringOptions = {
    defaults: { maintenance: 3, heat: 3, pests: 3, bedbugs: 3, noise: 3 },
    subcategories: Object.fromEntries(firstGrades.filter(value => value.subcategories.length).map(value => [
      value.category, value.subcategories.map(({ id, label }) => ({ id, label, weight: 3 })),
    ])),
    supportsAdvanced: true,
  }

  async searchBuildings(query: string, signal?: AbortSignal) {
    await abortableDelay(signal)
    const words = query.toLowerCase().match(/[a-z0-9]+/g) ?? []
    return words.length ? sampleBuildings.filter(building => {
      const address = [building.address, building.borough, 'NY', building.zip].join(' ').toLowerCase()
      return words.every(word => address.includes(word))
    }) : []
  }

  async resolveBuilding(building: Building, signal?: AbortSignal) {
    signal?.throwIfAborted()
    return reportFor(building.id).building
  }

  async getBuildingReport(id: string, signal?: AbortSignal) {
    await abortableDelay(signal)
    return reportFor(id)
  }

  async compareBuildings(ids: string[], preferences?: RatingPreferences, signal?: AbortSignal) {
    await abortableDelay(signal)
    if (ids.length < 2 || ids.length > 3 || new Set(ids).size !== ids.length) {
      throw new ServiceError('Choose two or three distinct buildings.', 400)
    }
    const validation = preferences && validatePreferences(preferences, this.scoring)
    if (validation) throw new ServiceError(validation, 400)
    const selected = ids.map(reportFor)
    const sharedCategories = categories.filter(category => selected.every(report =>
      report.grades.some(grade => grade.category === category && grade.letter)))
    const weights = preferences && preferences.mode !== 'default' ? preferences.weights : this.scoring.defaults!
    const total = sharedCategories.reduce((sum, category) => sum + weights[category], 0)
    const points = (letter: Letter) => ({ A: 90, B: 75, C: 55, D: 35, E: 20, F: 10 })[letter]
    const sharedSubcategories = (category: GradeCategory) => (this.scoring.subcategories[category] ?? []).filter(option =>
      selected.every(report => report.grades.find(grade => grade.category === category)?.subcategories.some(sub => sub.id === option.id && sub.letter)))
    const weighted = selected.map(report => {
      const value = sharedCategories.reduce((sum, category) => {
        const grade = report.grades.find(value => value.category === category)!
        const subs = preferences?.mode === 'advanced' ? sharedSubcategories(category) : []
        const subTotal = subs.reduce((total, sub) => total + (preferences?.subcategories[sub.id] ?? sub.weight), 0)
        const score = subTotal ? subs.reduce((value, sub) => value +
          points(grade.subcategories.find(item => item.id === sub.id)!.letter!) *
          (preferences?.subcategories[sub.id] ?? sub.weight), 0) / subTotal : points(grade.letter!)
        return sum + score * weights[category]
      }, 0)
      return { id: report.building.id, value: total ? Math.round(value / total * 10) / 10 : null }
    })
    return {
      reports: selected, weighted, sharedCategories,
      missingCategories: categories.filter(category => !sharedCategories.includes(category)),
      scoreLabel: 'Sample weighted score / 100',
    }
  }
}
