import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { RatingPreferences } from '../domain'
import { createServices } from '../services/runtime'
import { createWorkspaceStorage } from '../services/storage'
import { defaultPreferences, validatePreferences } from '../services/preferences'
import { useAuth } from './AuthContext'

type Services = ReturnType<typeof createServices>
type SavedState = { owner: string; ids: string[]; loading: boolean; error: string }
type Workspace = Services & {
  savedIds: string[]
  savedLoading: boolean
  savedError: string
  retrySaved: () => void
  saveBuilding: (id: string, saved: boolean) => Promise<void>
  compareIds: string[]
  setCompareIds: (ids: string[]) => void
  preferences: RatingPreferences
  savePreferences: (value: RatingPreferences) => void
}

const WorkspaceContext = createContext<Workspace | null>(null)

export function WorkspaceProvider({ services, children }: { services: Services; children: ReactNode }) {
  const { user, loading } = useAuth()
  const userId = user?.id
  const owner = userId ?? 'anonymous'
  const ownerRef = useRef(owner)
  ownerRef.current = owner
  const [storage] = useState(() => createWorkspaceStorage(localStorage, services.housing.mode))
  const [compareIds, updateComparison] = useState(storage.getComparison)
  const [preferences, updatePreferences] = useState(() => {
    const stored = storage.getPreferences()
    const options = services.housing.scoring
    return stored && (stored.mode !== 'advanced' || options.supportsAdvanced) && !validatePreferences(stored, options)
      ? stored : defaultPreferences(options)
  })
  const [saved, setSaved] = useState<SavedState>({ owner, ids: [], loading: true, error: '' })
  const [savedAttempt, setSavedAttempt] = useState(0)
  const pendingSaves = useRef(new Set<string>())
  const requiresAccount = services.housing.mode === 'api'

  useEffect(() => {
    if (loading) return
    if (requiresAccount && !userId) {
      setSaved({ owner, ids: [], loading: false, error: '' })
      return
    }
    const controller = new AbortController()
    setSaved({ owner, ids: [], loading: true, error: '' })
    services.saved.list(controller.signal, userId).then(ids => {
      if (!controller.signal.aborted) setSaved({ owner, ids, loading: false, error: '' })
    }).catch(error => {
      if (!controller.signal.aborted) setSaved({ owner, ids: [], loading: false, error: error.message })
    })
    return () => controller.abort()
  }, [services, owner, userId, loading, requiresAccount, savedAttempt])

  async function saveBuilding(id: string, value: boolean) {
    if (loading || (requiresAccount && !userId)) throw new Error('Sign in before saving this building.')
    const pendingKey = owner + ':' + id
    if (pendingSaves.current.has(pendingKey)) return
    pendingSaves.current.add(pendingKey)
    try {
      await services.saved.set(id, value, userId)
      if (ownerRef.current !== owner) return
      setSaved(current => current.owner !== owner ? current : {
        ...current, ids: value ? [...new Set([...current.ids, id])] : current.ids.filter(item => item !== id),
      })
    } finally {
      pendingSaves.current.delete(pendingKey)
    }
  }

  const currentSaved = saved.owner === owner && !loading ? saved : { ids: [], loading: true, error: '' }
  return <WorkspaceContext.Provider value={{
    ...services, savedIds: currentSaved.ids, savedLoading: currentSaved.loading, savedError: currentSaved.error, saveBuilding,
    retrySaved: () => setSavedAttempt(attempt => attempt + 1),
    compareIds,
    setCompareIds: ids => {
      const selected = [...new Set(ids)]
      if (selected.length > 3) throw new Error('Remove a building before adding another. You can compare up to three.')
      storage.setComparison(selected)
      updateComparison(selected)
    },
    preferences,
    savePreferences: value => {
      const validation = validatePreferences(value, services.housing.scoring)
      if (validation) throw new Error(validation)
      storage.setPreferences(value)
      updatePreferences(value)
    },
  }}>{children}</WorkspaceContext.Provider>
}

export function useWorkspace() {
  const value = useContext(WorkspaceContext)
  if (!value) throw new Error('WorkspaceProvider is required.')
  return value
}
