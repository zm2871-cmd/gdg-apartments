const publicPaths = new Set(['/', '/search', '/compare', '/saved', '/account', '/how-it-works'])

export function safeDestination(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') ||
      /[\\\u0000-\u0020\u007f]/.test(value) || /%0[ad]/i.test(value)) return '/'
  try {
    const url = new URL(value, 'https://hearthstone.invalid')
    if (url.origin !== 'https://hearthstone.invalid' || url.hash) return '/'
    if (!publicPaths.has(url.pathname) && !/^\/building\/[A-Za-z0-9_-]+$/.test(url.pathname)) return '/'
    return url.pathname + url.search
  } catch {
    return '/'
  }
}

const destinationKey = 'hearthstone:v1:auth:destination'

export function rememberDestination(storage: Storage, next: string) {
  try { storage.setItem(destinationKey, safeDestination(next)) }
  catch { throw new Error('This browser could not remember your sign-in destination. Allow site storage and try again.') }
}

export function consumeDestination(storage: Storage, next?: string | null) {
  let stored: string | null = null
  try {
    stored = storage.getItem(destinationKey)
    storage.removeItem(destinationKey)
  } catch { /* A callback can still return home when browser storage is unavailable. */ }
  return safeDestination(next ?? stored)
}

export function loginDestination(next: string) {
  return '/login?' + new URLSearchParams({ next: safeDestination(next) })
}
