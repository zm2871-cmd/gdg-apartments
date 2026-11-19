import type {
  AssistantMessage, Building, BuildingComparison, BuildingReport, CategoryWeights, RatingPreferences, ScoringOptions,
} from '../domain'

export type AuthSession = { email: string; preferences: CategoryWeights | null }

export interface ScoringService {
  readonly scoring: ScoringOptions
  compareBuildings(ids: string[], preferences?: RatingPreferences, signal?: AbortSignal): Promise<BuildingComparison>
}
export interface HousingDataProvider extends ScoringService {
  readonly mode: 'mock' | 'api'
  searchBuildings(query: string, signal?: AbortSignal): Promise<Building[]>
  resolveBuilding(building: Building, signal?: AbortSignal): Promise<Building>
  getBuildingReport(id: string, signal?: AbortSignal): Promise<BuildingReport>
}
export interface AuthAdapter {
  readonly available: boolean
  getSession(signal?: AbortSignal): Promise<AuthSession | null>
  savePreferences(weights: CategoryWeights): Promise<void>
  signIn(email: string): Promise<string>
  signOut(): Promise<void>
}
export interface SavedAdapter {
  list(signal?: AbortSignal): Promise<string[]>
  set(id: string, saved: boolean): Promise<void>
}
export interface AssistantService {
  readonly available: boolean
  send(input: { messages: AssistantMessage[]; buildingIds: string[] }, signal?: AbortSignal): Promise<AssistantMessage>
}

export class ServiceError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message)
    this.name = 'ServiceError'
  }
}
