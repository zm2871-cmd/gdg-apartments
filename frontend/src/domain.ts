export const categories = ['maintenance', 'heat', 'pests', 'bedbugs', 'noise'] as const
export type GradeCategory = typeof categories[number]
export const categoryLabels: Record<GradeCategory, string> = {
  maintenance: 'Repairs',
  heat: 'Heat & hot water',
  pests: 'Rats & pests',
  bedbugs: 'Bedbugs',
  noise: 'Nearby noise',
}

export type Letter = 'A' | 'B' | 'C' | 'D' | 'E' | 'F'
export type IssueStatus = 'open' | 'resolved' | 'unknown'
export type Coordinates = { lng: number; lat: number }
export type Source = { id: string; label: string; url?: string; updatedAt?: string }
export type Coverage = {
  source: Source
  status: 'ok' | 'error' | 'unmatched' | 'truncated' | 'stale'
  count: number
  message?: string
}
export type Building = {
  id: string
  address: string
  borough: string
  zip?: string
  units?: number
  unitScope?: 'building' | 'tax lot'
  built?: number
  position?: Coordinates
  match?: 'building' | 'tax_lot' | 'unverified' | 'ambiguous'
  sample: boolean
}
export type GradeSubcategory = { id: string; label: string; letter: Letter | null; count?: number }
export type Grade = {
  category: GradeCategory
  letter: Letter | null
  description: string
  count?: number
  countLabel?: string
  period?: string
  updatedAt?: string
  coverage: 'available' | 'limited' | 'unavailable'
  sources: Source[]
  limitations?: string
  subcategories: GradeSubcategory[]
}
export type Issue = {
  id: string
  category: GradeCategory
  title: string
  date: string
  status: IssueStatus
  source: Source
  description: string
  scope: 'building' | 'tax_lot' | 'nearby'
  position?: Coordinates
}
export type NearbyMarker = {
  id: string
  category: GradeCategory
  title: string
  description: string
  date: string
  source: Source
  point: ({ kind: 'illustration'; x: number; y: number } | ({ kind: 'geographic' } & Coordinates))
}
export type HistoricalChange = { id: string; title: string; description: string; period: string }
export type BuildingReport = {
  building: Building
  checkedAt: string
  summary: string | null
  grades: Grade[]
  overall: Letter | null
  issues: Issue[]
  coverage: Coverage[]
  confidence: string
  nearby: NearbyMarker[]
  changes: HistoricalChange[] | null
  questions: string[] | null
  proximity?: string
}
export type CategoryWeights = Record<GradeCategory, number>
export type RatingPreferences = {
  mode: 'default' | 'semi' | 'advanced'
  weights: CategoryWeights
  subcategories: Record<string, number>
}
export type ScoringOptions = {
  defaults?: CategoryWeights
  subcategories: Partial<Record<GradeCategory, { id: string; label: string; weight: number }[]>>
  supportsAdvanced: boolean
}
export type BuildingComparison = {
  reports: BuildingReport[]
  weighted: { id: string; value: number | null }[]
  sharedCategories: GradeCategory[]
  missingCategories: GradeCategory[]
  scoreLabel: string
}
export type AssistantMessage = {
  id: string
  role: 'user' | 'assistant'
  text: string
  createdAt: string
  buildingIds: string[]
}

export function locality(building: Building) {
  return [building.borough, 'NY' + (building.zip ? ' ' + building.zip : '')].join(', ')
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(value))
}
