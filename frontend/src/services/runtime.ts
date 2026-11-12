import { ApiAuthAdapter, ApiClient, ApiHousingDataProvider, ApiSavedAdapter } from './api'
import { ServiceError, type AssistantService, type AuthAdapter } from './contracts'
import { MockHousingDataProvider } from './mock'
import { LocalSavedAdapter } from './storage'

const unavailableAuth: AuthAdapter = {
  available: false,
  async getSession() { return null },
  async signIn() { throw new ServiceError('Account access is unavailable in demonstration mode.') },
  async signOut() { throw new ServiceError('Account access is unavailable in demonstration mode.') },
}

export function createServices(config: { VITE_DATA_PROVIDER?: string; VITE_API_BASE_URL?: string }, storage: Storage) {
  const mode = config.VITE_DATA_PROVIDER || 'mock'
  if (mode === 'mock') {
    return { housing: new MockHousingDataProvider(), auth: unavailableAuth, saved: new LocalSavedAdapter(storage) }
  }
  if (mode !== 'api') throw new ServiceError('VITE_DATA_PROVIDER must be mock or api.')
  const client = new ApiClient(config.VITE_API_BASE_URL ?? '')
  return { housing: new ApiHousingDataProvider(client), auth: new ApiAuthAdapter(client), saved: new ApiSavedAdapter(client) }
}

export const assistantService: AssistantService = {
  available: false,
  async send() { throw new ServiceError('The report assistant is not connected yet.') },
}
