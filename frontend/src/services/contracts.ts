import type { AuthChangeEvent, Session } from '@supabase/supabase-js'
import type {
  AssistantMessage, Building, BuildingComparison, BuildingReport, RatingPreferences, ScoringOptions,
} from '../domain'

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
export type OAuthProvider = 'google' | 'github'
export interface AuthAdapter {
  readonly available: boolean
  readonly configurationError: string
  getSession(): Promise<Session | null>
  onAuthStateChange(listener: (event: AuthChangeEvent, session: Session | null) => void): () => void
  signInWithOAuth(provider: OAuthProvider, redirectTo: string): Promise<void>
  signInWithEmail(email: string, redirectTo: string, createUser: boolean): Promise<string>
  completeCallback(url: URL): Promise<Session>
  getAccessToken(expectedUserId?: string): Promise<string | null>
  signOut(): Promise<void>
}
export interface SavedAdapter {
  list(signal?: AbortSignal, userId?: string): Promise<string[]>
  set(id: string, saved: boolean, userId?: string): Promise<void>
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
