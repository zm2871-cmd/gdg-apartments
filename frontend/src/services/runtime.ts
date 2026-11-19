import { ApiClient, ApiHousingDataProvider, ApiSavedAdapter } from './api'
import { ServiceError, type AssistantService } from './contracts'
import { SupabaseAuthAdapter } from './auth'
import { getSupabase, type SupabaseEnvironment } from '../lib/supabase'
import { MockHousingDataProvider } from './mock'
import { LocalSavedAdapter } from './storage'

type Environment = SupabaseEnvironment & { VITE_DATA_PROVIDER?: string; VITE_API_BASE_URL?: string }

export function createServices(config: Environment, storage: Storage) {
  const setup = getSupabase(config)
  const auth = new SupabaseAuthAdapter(setup.client, setup.error)
  const mode = config.VITE_DATA_PROVIDER || 'mock'
  if (mode === 'mock') {
    return { housing: new MockHousingDataProvider(), auth, saved: new LocalSavedAdapter(storage) }
  }
  if (mode !== 'api') throw new ServiceError('VITE_DATA_PROVIDER must be mock or api.')
  const client = new ApiClient(config.VITE_API_BASE_URL ?? '', undefined, userId => auth.getAccessToken(userId))
  return { housing: new ApiHousingDataProvider(client), auth, saved: new ApiSavedAdapter(client) }
}

export const assistantService: AssistantService = {
  available: false,
  async send() { throw new ServiceError('The report assistant is not connected yet.') },
}
