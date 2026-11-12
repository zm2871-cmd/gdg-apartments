import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { ArrowRight, MapPin, Search } from 'lucide-react'
import { useWorkspace } from '../app/workspace'
import type { Building } from '../domain'

export function AddressSearch({ initial = '', label = 'NYC address', button = 'Search', onSearch, onChoose, compact = false }: {
  initial?: string
  label?: string
  button?: string
  onSearch?: (query: string) => void
  onChoose: (building: Building, signal: AbortSignal) => void | Promise<void>
  compact?: boolean
}) {
  const { housing } = useWorkspace()
  const [query, setQuery] = useState(initial)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [results, setResults] = useState<{ query: string; buildings: Building[]; error?: string }>()
  const [choosing, setChoosing] = useState(false)
  const [error, setError] = useState('')
  const id = useId()
  const input = useRef<HTMLInputElement>(null)
  const selection = useRef<AbortController | null>(null)
  useEffect(() => () => selection.current?.abort(), [])
  const term = query.trim()
  const eligible = term.length >= 3
  const current = results?.query === term ? results : undefined
  const suggestions = current?.buildings ?? []
  const expanded = open && suggestions.length > 0
  const loading = open && eligible && !current

  useEffect(() => {
    if (!open || !eligible) return
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      housing.searchBuildings(term, controller.signal).then(buildings => {
        if (!controller.signal.aborted) setResults({ query: term, buildings })
      }).catch(error => {
        if (!controller.signal.aborted) setResults({ query: term, buildings: [], error: error.message })
      })
    }, 180)
    return () => { clearTimeout(timer); controller.abort() }
  }, [housing, term, eligible, open])

  async function choose(building: Building) {
    if (selection.current) return
    const controller = new AbortController()
    selection.current = controller
    setOpen(false)
    setChoosing(true)
    setError('')
    try {
      await onChoose(building, controller.signal)
      if (!controller.signal.aborted) setQuery('')
    } catch (error) {
      if (!controller.signal.aborted) setError(error instanceof Error ? error.message : 'Could not open this address.')
    } finally {
      selection.current = null
      if (!controller.signal.aborted) setChoosing(false)
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    if (choosing) return
    if (!eligible) {
      setError('Enter at least three characters to search.')
      input.current?.focus()
      return
    }
    setError('')
    if (expanded && suggestions[active]) {
      void choose(suggestions[active])
    } else if (onSearch) {
      setOpen(false)
      onSearch(term)
    } else if (suggestions.length === 1) {
      void choose(suggestions[0])
    } else {
      setOpen(true)
      input.current?.focus()
    }
  }

  function handleKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      setOpen(false)
      setActive(-1)
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    event.preventDefault()
    setOpen(true)
    if (suggestions.length) {
      setActive(index => event.key === 'ArrowDown'
        ? (index + 1) % suggestions.length
        : (index <= 0 ? suggestions.length - 1 : index - 1))
    }
  }

  return <form className={'address-search' + (compact ? ' compact' : '')} onSubmit={submit}
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) { setOpen(false); setActive(-1) } }} role="search" aria-label={label}>
    <div className="search-control">
      <Search size={19} aria-hidden="true" />
      <input ref={input} aria-label={label} role="combobox" aria-autocomplete="list"
        aria-expanded={expanded} aria-controls={expanded ? id + '-suggestions' : undefined}
        aria-activedescendant={expanded && suggestions[active] ? id + '-option-' + active : undefined}
        autoComplete="off" maxLength={120} placeholder={compact ? 'Search another NYC address' : 'Search an NYC address...'}
        value={query} onFocus={() => setOpen(true)} onKeyDown={handleKey}
        onChange={event => { setQuery(event.target.value); setActive(-1); setOpen(true); setError('') }} />
      <button className="button primary" disabled={choosing} type="submit" aria-label={button}>
        {compact ? <ArrowRight size={16} /> : choosing ? 'Opening…' : button}
      </button>
    </div>
    {expanded && <ul className="suggestions" id={id + '-suggestions'} role="listbox" aria-label="Address suggestions">
      {suggestions.map((building, index) => <li key={building.id} role="option" id={id + '-option-' + index}
        aria-selected={index === active} onMouseDown={event => event.preventDefault()} onClick={() => void choose(building)}>
        <MapPin size={16} /><span><strong>{building.address}</strong><small>{building.borough}{building.sample ? ' · Sample data' : ''}</small></span>
      </li>)}
    </ul>}
    {open && eligible && !expanded && <p className="suggestion-status" role="status">
      {loading ? 'Looking up addresses…' : current?.error ?? 'No matching addresses.'}
    </p>}
    {error && <p className="inline-error" role="alert">{error}</p>}
  </form>
}
