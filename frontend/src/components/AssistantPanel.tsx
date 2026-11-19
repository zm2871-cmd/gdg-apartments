import { useEffect, useRef, useState, type FormEvent } from 'react'
import ReactMarkdown from 'react-markdown'
import { MessageSquare } from 'lucide-react'
import { formatDate, type AssistantMessage, type Building } from '../domain'
import type { AssistantService } from '../services/contracts'

export function AssistantPanel({ building, service }: { building: Building; service: AssistantService }) {
  const [messages, setMessages] = useState<AssistantMessage[]>([])
  const [question, setQuestion] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const buildingIds = [building.id]
  const available = service.available && !building.sample
  const pending = useRef<AbortController | null>(null)
  useEffect(() => () => { pending.current?.abort() }, [building.id, service])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!question.trim() || !available || loading || question.trim().length > 2000) return
    const input: AssistantMessage = {
      id: crypto.randomUUID(), role: 'user', text: question.trim(), createdAt: new Date().toISOString(), buildingIds,
    }
    const conversation = [...messages, input]
    const controller = new AbortController()
    pending.current = controller
    setLoading(true)
    setError('')
    try {
      const reply = await service.send({ messages: conversation, buildingIds }, controller.signal)
      if (controller.signal.aborted) return
      setMessages([...conversation, reply])
      setQuestion('')
    } catch (error) {
      if (controller.signal.aborted) return
      setError(error instanceof Error ? error.message : 'The assistant could not respond.')
    } finally {
      if (!controller.signal.aborted) {
        pending.current = null
        setLoading(false)
      }
    }
  }

  return <details className="panel assistant-panel">
    <summary><MessageSquare size={17} /> Report assistant <span>{available ? 'Ask a question' : 'Unavailable'}</span></summary>
    {!available ? <p className="muted">The report assistant is currently unavailable for {building.address}.</p> : <>
      <p>Each question is answered independently. The assistant does not remember previous questions or answers.</p>
      <p>Your question and public building report are sent to Gemini when available. Avoid including personal information. AI can make mistakes; verify answers against the records and source coverage.</p>
      <ul className="assistant-messages" aria-live="polite">{messages.map(message => <li key={message.id}>
        <strong className="assistant-message-label">{message.role === 'user' ? 'You' : message.fallback ? 'Records summary' : 'Assistant'}</strong>
        {message.fallback && <p className="banner">AI is unavailable. Showing a summary of retrieved records instead.</p>}
        <div className="assistant-message-content">{message.role === 'assistant' ? <ReactMarkdown skipHtml>{message.text}</ReactMarkdown> : <p>{message.text}</p>}</div>
        {message.checkedAt && <small>Records checked {formatDate(message.checkedAt)}</small>}
      </li>)}</ul>
      <form onSubmit={submit}><label htmlFor="assistant-question">Ask about {building.address}</label>
        <textarea required maxLength={2000} id="assistant-question" value={question} onChange={event => setQuestion(event.target.value)} />
        <button type="submit" className="button primary" disabled={loading || !question.trim() || question.trim().length > 2000}>Send question</button>
      </form>
      {loading && <p role="status">Waiting for a response…</p>}
      {error && <p role="alert" className="inline-error">{error}</p>}
    </>}
  </details>
}
