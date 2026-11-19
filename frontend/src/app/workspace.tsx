import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { categories, type RatingPreferences } from '../domain'
import { createServices } from '../services/runtime'
import { createWorkspaceStorage } from '../services/storage'
import { defaultPreferences, validatePreferences } from '../services/preferences'
import type { AuthSession } from '../services/contracts'

type Services = ReturnType<typeof createServices>

type Workspace = Services & {
  savedIds: string[]
  savedLoading: boolean
  savedError: string
  retrySaved: () => void
  saveBuilding: (id: string, saved: boolean) => Promise<void>
  compareIds: string[]
  setCompareIds: (ids: string[]) => void
  session: AuthSession | null
  sessionLoading: boolean
  sessionError: string
  signOut: () => Promise<void>
  preferences: RatingPreferences
  savePreferences: (value: RatingPreferences) => Promise<void>
}

const WorkspaceContext = createContext<Workspace | null>(null)

export function WorkspaceProvider({ services, children }: { services: Services; children: ReactNode }) {
  const [storage] = useState(() => createWorkspaceStorage(localStorage, services.housing.mode))
  const [compareIds, updateComparison] = useState(storage.getComparison)
  const [preferences, updatePreferences] = useState(() => {
    if (services.auth.available) return defaultPreferences(services.housing.scoring)
    const stored = storage.getPreferences()
    const options = services.housing.scoring
    return stored && (stored.mode !== 'advanced' || options.supportsAdvanced) && !validatePreferences(stored, options)
      ? stored : defaultPreferences(options)
  })
  const [session, setSession] = useState<Workspace['session']>(null)
  const [sessionLoading, setSessionLoading] = useState(services.auth.available)
  const [sessionError, setSessionError] = useState('')
  const [savedIds, setSavedIds] = useState<string[]>([])
  const [savedLoading, setSavedLoading] = useState(true)
  const [savedError, setSavedError] = useState('')
  const [savedAttempt, setSavedAttempt] = useState(0)
  const saveGeneration = useRef(0)
  const pendingSaves = useRef(new Set<string>())

  useEffect(() => {
    if (!services.auth.available) return
    const controller = new AbortController()
    services.auth.getSession(controller.signal).then(value => {
      if (!controller.signal.aborted) {
        setSession(value)
        const defaults = defaultPreferences(services.housing.scoring)
        updatePreferences(value?.preferences ? {
          ...defaults,
          mode: categories.every(category => value.preferences?.[category] === defaults.weights[category]) ? 'default' : 'semi',
          weights: value.preferences,
        } : defaults)
      }
    }).catch(error => {
      if (!controller.signal.aborted) setSessionError(error.message)
    }).finally(() => {
      if (!controller.signal.aborted) setSessionLoading(false)
    })
    return () => controller.abort()
  }, [services])

  useEffect(() => {
    if (sessionLoading) return
    if (services.auth.available && !session) {
      setSavedLoading(false)
      return
    }
    const controller = new AbortController()
    setSavedLoading(true)
    setSavedError('')
    services.saved.list(controller.signal).then(ids => {
      if (!controller.signal.aborted) setSavedIds(ids)
    }).catch(error => {
      if (!controller.signal.aborted) setSavedError(error.message)
    }).finally(() => {
      if (!controller.signal.aborted) setSavedLoading(false)
    })
    return () => controller.abort()
  }, [services, session, sessionLoading, savedAttempt])

  async function saveBuilding(id: string, saved: boolean) {
    if (pendingSaves.current.has(id)) return
    pendingSaves.current.add(id)
    const generation = saveGeneration.current
    try {
      await services.saved.set(id, saved)
      if (generation !== saveGeneration.current) return
      setSavedIds(current => saved ? [...new Set([...current, id])] : current.filter(value => value !== id))
    } finally {
      pendingSaves.current.delete(id)
    }
  }

  async function signOut() {
    await services.auth.signOut()
    saveGeneration.current++
    setSession(null)
    setSavedIds([])
    setSavedError('')
    updatePreferences(defaultPreferences(services.housing.scoring))
  }

  return <WorkspaceContext.Provider value={{
    ...services, session, sessionLoading, sessionError, signOut, savedIds, savedLoading, savedError, saveBuilding,
    retrySaved: () => setSavedAttempt(attempt => attempt + 1),
    compareIds,
    setCompareIds: ids => {
      const selected = [...new Set(ids)]
      if (selected.length > 3) throw new Error('Remove a building before adding another. You can compare up to three.')
      storage.setComparison(selected)
      updateComparison(selected)
    },
    preferences,
    savePreferences: async value => {
      const validation = validatePreferences(value, services.housing.scoring)
      if (validation) throw new Error(validation)
      if (services.auth.available) {
        if (!session) throw new Error('Sign in to save your priorities.')
        const generation = saveGeneration.current
        await services.auth.savePreferences(value.weights)
        if (generation !== saveGeneration.current) return
        setSession(current => current?.email === session.email ? { ...current, preferences: value.weights } : current)
      } else {
        storage.setPreferences(value)
      }
      updatePreferences(value)
    },
  }}>{children}</WorkspaceContext.Provider>
}

export function useWorkspace() {
  const value = useContext(WorkspaceContext)
  if (!value) throw new Error('WorkspaceProvider is required.')
  return value
}
