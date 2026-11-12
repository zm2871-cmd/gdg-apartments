import { useEffect, useState } from 'react'

type RequestState<T> = { status: 'loading' } | { status: 'success'; data: T } | { status: 'error'; error: Error }
const loading = { status: 'loading' } as const

export function useRequest<T>(request: (signal: AbortSignal) => Promise<T>, key: string, enabled = true) {
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState<{ key: string; attempt: number; state: RequestState<T> }>()
  useEffect(() => {
    if (!enabled) return
    const controller = new AbortController()
    request(controller.signal).then(data => {
      if (!controller.signal.aborted) setResult({ key, attempt, state: { status: 'success', data } })
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) {
        setResult({ key, attempt, state: { status: 'error', error: error instanceof Error ? error : new Error('Try again shortly.') } })
      }
    })
    return () => controller.abort()
    // The key identifies all request inputs. A new callback alone must not start another request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled, attempt])
  return {
    state: enabled && result?.key === key && result.attempt === attempt ? result.state : loading,
    retry: () => setAttempt(value => value + 1),
  }
}
