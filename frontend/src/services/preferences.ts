import { z } from 'zod'
import { categories, type RatingPreferences, type ScoringOptions } from '../domain'

const weight = z.number().int().min(0).max(5)
export const weightsSchema = z.object({
  maintenance: weight, heat: weight, pests: weight, bedbugs: weight, noise: weight,
})
export const preferencesSchema = z.object({
  mode: z.enum(['default', 'semi', 'advanced']),
  weights: weightsSchema,
  subcategories: z.record(z.string(), weight),
})

export function defaultPreferences(options: ScoringOptions): RatingPreferences {
  const neutralEditorValues = { maintenance: 3, heat: 3, pests: 3, bedbugs: 3, noise: 3 }
  return {
    mode: 'default',
    weights: { ...(options.defaults ?? neutralEditorValues) },
    subcategories: Object.fromEntries(Object.values(options.subcategories).flat().map(({ id, weight }) => [id, weight])),
  }
}

export function validatePreferences(value: RatingPreferences, options: ScoringOptions): string | null {
  if (!preferencesSchema.safeParse(value).success) return 'Every weight must be a whole number from 0 to 5.'
  if (value.mode === 'default') return null
  if (!Object.values(value.weights).some(Boolean)) return 'Set at least one category weight above zero.'
  if (value.mode === 'advanced') {
    for (const category of categories) {
      const subcategories = options.subcategories[category]
      if (value.weights[category] && subcategories?.length &&
          subcategories.every(({ id, weight }) => (value.subcategories[id] ?? weight) === 0)) {
        return 'Set at least one subcategory weight above zero in each included category.'
      }
    }
  }
  return null
}
