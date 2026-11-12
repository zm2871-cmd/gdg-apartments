import { z } from 'zod'
import { preferencesSchema } from './preferences'
import type { SavedAdapter } from './contracts'

const idsSchema = z.array(z.string().min(1).max(150)).transform(ids => [...new Set(ids)])
const savedKey = 'hearthstone:v1:mock:saved'

function read<T>(storage: Storage, key: string, schema: z.ZodType<T>, fallback: T): T {
  try {
    const parsed = schema.safeParse(JSON.parse(storage.getItem(key) ?? 'null'))
    return parsed.success ? parsed.data : fallback
  } catch {
    return fallback
  }
}

function write(storage: Storage, key: string, value: unknown) {
  try {
    storage.setItem(key, JSON.stringify(value))
  } catch {
    throw new Error('This browser could not save your changes.')
  }
}

export class LocalSavedAdapter implements SavedAdapter {
  constructor(private readonly storage: Storage) {}
  async list() {
    return read(this.storage, savedKey, idsSchema, [])
  }
  async set(id: string, saved: boolean) {
    const ids = read(this.storage, savedKey, idsSchema, [])
    write(this.storage, savedKey, saved ? [...new Set([...ids, id])] : ids.filter(value => value !== id))
  }
}

export function createWorkspaceStorage(storage: Storage, mode: 'mock' | 'api') {
  const prefix = 'hearthstone:v1:' + mode
  return {
    getComparison: () => read(storage, prefix + ':compare', idsSchema, []).slice(0, 3),
    setComparison: (ids: string[]) => write(storage, prefix + ':compare', ids),
    getPreferences: () => read<z.infer<typeof preferencesSchema> | null>(storage, prefix + ':preferences', preferencesSchema, null),
    setPreferences: (value: z.infer<typeof preferencesSchema>) => write(storage, prefix + ':preferences', value),
  }
}
