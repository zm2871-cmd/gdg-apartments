import { useState, type FormEvent } from 'react'
import { MessageSquare } from 'lucide-react'
import type { AssistantMessage, Building } from '../domain'
import type { AssistantService } from '../services/contracts'

export function AssistantPanel({ building, service }: { building: Building; service: AssistantService }) {
  const [messages, setMessages] = useState<AssistantMessage[]>([])
  const [question, setQuestion] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const buildingIds = [building.id]

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!question.trim() || !service.available || loading) return
    const input: AssistantMessage = {
      id: crypto.randomUUID(), role: 'user', text: question.trim(), createdAt: new Date().toISOString(), buildingIds,
    }
    const conversation = [...messages, input]
    setLoading(true)
    setError('')
    try {
      const reply = await service.send({ messages: conversation, buildingIds })
      setMessages([...conversation, reply])
      setQuestion('')
    } catch (error) {
      setError(error instanceof Error ? error.message : 'The assistant could not respond.')
    } finally {
      setLoading(false)
    }
  }

  return <details className="panel assistant-panel">
    <summary><MessageSquare size={17} /> Report assistant <span>{service.available ? 'Ask a question' : 'Coming soon'}</span></summary>
    {!service.available ? <p className="muted">The report assistant is currently unavailable for {building.address}.</p> : <>
      <ul className="assistant-messages" aria-live="polite">{messages.map(message => <li key={message.id}>
        <strong>{message.role === 'user' ? 'You' : 'Assistant'}</strong> {message.text}
      </li>)}</ul>
      <form onSubmit={submit}><label htmlFor="assistant-question">Ask about {building.address}</label>
        <textarea id="assistant-question" value={question} onChange={event => setQuestion(event.target.value)} />
        <button type="submit" className="button primary" disabled={loading || !question.trim()}>Send question</button>
      </form>
      {loading && <p role="status">Waiting for a response…</p>}
      {error && <p role="alert" className="inline-error">{error}</p>}
    </>}
  </details>
}
