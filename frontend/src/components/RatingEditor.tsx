import { useId, useState } from 'react'
import { RotateCcw, SlidersHorizontal } from 'lucide-react'
import { useWorkspace } from '../app/workspace'
import { categories, categoryLabels } from '../domain'
import { defaultPreferences, validatePreferences } from '../services/preferences'

export function RatingEditor() {
  const { housing, preferences, savePreferences } = useWorkspace()
  const options = housing.scoring
  const [draft, setDraft] = useState(preferences)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const id = useId()
  const modes = [
    ['default', 'Default'], ['semi', 'Semi-advanced'], ['advanced', 'Advanced'],
  ] as const

  return <details className="panel rating-panel">
    <summary><SlidersHorizontal size={19} /><strong>Rating preferences</strong>
      <span>{modes.find(([mode]) => mode === preferences.mode)?.[1]}</span></summary>
    <form className="rating-body" onSubmit={event => {
      event.preventDefault()
      setNotice('')
      const validation = validatePreferences(draft, options)
      if (validation) { setError(validation); return }
      try { savePreferences(draft); setError(''); setNotice('Preferences saved and applied.') }
      catch (error) { setError(error instanceof Error ? error.message : 'Could not save preferences.') }
    }}>
      <p className="muted">{housing.mode === 'mock' ? 'Sample weights adjust the demonstration comparison score.' : 'Weights apply to categories with comparable data.'} Preferences are saved on this device.</p>
      <fieldset className="rating-mode"><legend>Weighting mode</legend>
        {modes.map(([mode, label]) => <label key={mode}>
          <input type="radio" name={id + '-mode'} value={mode} checked={draft.mode === mode}
            disabled={mode === 'advanced' && !options.supportsAdvanced}
            onChange={() => { setDraft(current => ({ ...current, mode })); setError(''); setNotice('') }} />
          {label}
        </label>)}
      </fieldset>
      {!options.supportsAdvanced && <p className="muted">Advanced weighting requires subcategory scores from the API.</p>}
      {draft.mode === 'default' ? <dl className="default-weights">
        {options.defaults ? categories.map(category => <div key={category}><dt>{categoryLabels[category]}</dt><dd>{options.defaults?.[category]} / 5</dd></div>)
          : <div><dt>Provider defaults</dt><dd>Managed by the scoring provider</dd></div>}
      </dl> : <div className="weight-controls">{categories.map(category => <div key={category} className="weight-group">
        <WeightSlider label={categoryLabels[category]} value={draft.weights[category]} onChange={value => {
          setDraft(current => ({ ...current, weights: { ...current.weights, [category]: value } }))
          setError(''); setNotice('')
        }} />
        {draft.mode === 'advanced' && <div className="sub-weights">
          {options.subcategories[category]?.length ? options.subcategories[category]?.map(sub =>
            <WeightSlider key={sub.id} label={sub.label} value={draft.subcategories[sub.id] ?? sub.weight}
              onChange={value => {
                setDraft(current => ({ ...current, subcategories: { ...current.subcategories, [sub.id]: value } }))
                setError(''); setNotice('')
              }} />) : <p className="muted">Subcategory scores unavailable.</p>}
        </div>}
      </div>)}</div>}
      {draft.mode === 'advanced' && <p className="muted">Subcategory weights apply when each selected building has a grade for that subcategory.</p>}
      <div className="action-row preferences-actions">
        <button className="button primary" type="submit">Save preferences</button>
        <button className="button secondary" type="button" onClick={() => {
          setDraft(defaultPreferences(options)); setError(''); setNotice('Defaults restored in the editor. Save to apply.')
        }}><RotateCcw size={15} /> Reset to defaults</button>
        <button className="button secondary" type="button" onClick={() => {
          setDraft(preferences); setError(''); setNotice('Saved preferences restored in the editor.')
        }}>Restore saved</button>
      </div>
      {error && <p className="inline-error" role="alert">{error}</p>}
      {notice && <p className="muted preference-notice" role="status">{notice}</p>}
    </form>
  </details>
}

function WeightSlider({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  const id = useId()
  return <div className="weight-slider">
    <label htmlFor={id}>{label}</label><input id={id} type="range" min={0} max={5} step={1} value={value}
      aria-valuetext={value + ' out of 5'} onChange={event => onChange(event.target.valueAsNumber)} /><output htmlFor={id}>{value} / 5</output>
  </div>
}
