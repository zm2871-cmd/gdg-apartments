import type { AuthChangeEvent, Session, SupabaseClient } from '@supabase/supabase-js'
import { ServiceError, type AuthAdapter, type OAuthProvider } from './contracts'

export const oauthProviders: { id: OAuthProvider; label: string }[] = [
  { id: 'google', label: 'Google' },
  { id: 'github', label: 'GitHub' },
]

export function authErrorMessage(error: unknown) {
  const code = typeof error === 'object' && error ? Reflect.get(error, 'code') : undefined
  if (code === 'provider_disabled' || code === 'validation_failed' || code === 'oauth_provider_not_supported') {
    return 'This sign-in provider is unavailable. Try another option or contact the site administrator.'
  }
  if (code === 'over_request_rate_limit' || code === 'over_email_send_rate_limit') {
    return 'Too many sign-in attempts. Wait a moment and try again.'
  }
  if (code === 'signup_disabled') return 'New account registration is currently unavailable.'
  if (code === 'email_address_invalid' || code === 'validation_failed_email') return 'Enter a valid email address.'
  return 'Sign-in could not be completed. Check your connection and try again.'
}

export class SupabaseAuthAdapter implements AuthAdapter {
  readonly available: boolean
  private callback?: { code: string; result: Promise<Session> }

  constructor(private readonly client: SupabaseClient | null, readonly configurationError = '') {
    this.available = client !== null
  }

  private requireClient() {
    if (!this.client) throw new ServiceError(this.configurationError || 'Sign-in is not configured.')
    return this.client
  }

  async getSession() {
    const { data, error } = await this.requireClient().auth.getSession()
    if (error) throw new ServiceError('Your session could not be restored. Try signing in again.')
    return data.session
  }

  onAuthStateChange(listener: (event: AuthChangeEvent, session: Session | null) => void) {
    if (!this.client) return () => {}
    const { data } = this.client.auth.onAuthStateChange(listener)
    return () => data.subscription.unsubscribe()
  }

  async signInWithOAuth(provider: OAuthProvider, redirectTo: string) {
    if (!oauthProviders.some(option => option.id === provider)) throw new ServiceError('Choose a supported sign-in provider.')
    const { error } = await this.requireClient().auth.signInWithOAuth({ provider, options: { redirectTo } })
    if (error) throw new ServiceError(authErrorMessage(error))
  }

  async signInWithEmail(email: string, redirectTo: string, createUser: boolean) {
    const { error } = await this.requireClient().auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo, shouldCreateUser: createUser },
    })
    if (error) throw new ServiceError(authErrorMessage(error))
    return 'If this address is eligible, a sign-in link is on its way. Open it in this browser to continue.'
  }

  completeCallback(url: URL): Promise<Session> {
    if (url.searchParams.has('error') || url.searchParams.has('error_description') || url.hash) {
      return Promise.reject(new ServiceError('The sign-in request was cancelled or could not be verified. Please try again.'))
    }
    const codes = url.searchParams.getAll('code')
    if (codes.length !== 1 || !codes[0]) {
      return Promise.reject(new ServiceError('This sign-in link is incomplete or expired. Please request a new one.'))
    }
    const code = codes[0]
    if (this.callback?.code === code) return this.callback.result
    const result = this.exchangeCode(code)
    this.callback = { code, result }
    return result
  }

  private async exchangeCode(code: string) {
    const client = this.requireClient()
    const { data, error } = await client.auth.exchangeCodeForSession(code)
    if (error || !data.session) {
      throw new ServiceError('This sign-in link has expired or could not be verified. Start sign-in again in this browser.')
    }
    const { data: verified, error: userError } = await client.auth.getUser()
    if (userError || !verified.user || verified.user.id !== data.session.user.id) {
      await client.auth.signOut({ scope: 'local' })
      throw new ServiceError('Your account could not be verified. Please sign in again.')
    }
    return { ...data.session, user: verified.user }
  }

  async getAccessToken(expectedUserId?: string) {
    if (!this.available) return null
    const session = await this.getSession()
    if (expectedUserId && session?.user.id !== expectedUserId) {
      throw new ServiceError('Your account changed. Reload the saved properties page and try again.', 401)
    }
    return session?.access_token ?? null
  }

  async signOut() {
    const { error } = await this.requireClient().auth.signOut()
    if (error) throw new ServiceError('You could not be signed out. Check your connection and try again.')
  }
}
