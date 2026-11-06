'use client';

import {useState, type FormEvent} from 'react';
import ReactMarkdown from 'react-markdown';

export default function BuildingAdvice({buildingId}: {buildingId: string}) {
  const [question,setQuestion] = useState('');
  const [answer,setAnswer] = useState('');
  const [fallback,setFallback] = useState(false);
  const [loading,setLoading] = useState(false);
  const [error,setError] = useState('');

  async function ask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!question.trim() || loading) return;
    setLoading(true); setError(''); setAnswer(''); setFallback(false);
    try {
      const response = await fetch('/api/ai/advice', {
        method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({buildingId, question}),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || 'Unable to retrieve advice. Please retry.');
      setAnswer(data.answer); setFallback(data.fallback === true);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unable to retrieve advice. Please retry.');
    } finally { setLoading(false); }
  }

  return <section className="panel no-print" aria-labelledby="building-advice-title">
    <h2 id="building-advice-title">Ask AI about this building</h2>
    <p>Ask about the retrieved public records. AI can make mistakes; verify claims against the evidence and source coverage.</p>
    <form onSubmit={ask} className="building-advice-form">
      <label htmlFor="building-advice-question">Your question</label>
      <textarea id="building-advice-question" className="field" rows={3} maxLength={2000} required
        placeholder="What should I ask the landlord about these records?" value={question}
        onChange={event => setQuestion(event.target.value)} />
      <p className="details">Your question and public building report are sent to Gemini when available. Avoid including personal information.</p>
      <button className="button" type="submit" disabled={loading || !question.trim()}>{loading ? 'Thinking…' : 'Ask AI'}</button>
    </form>
    {error && <p role="alert">{error}</p>}
    <div aria-live="polite" aria-busy={loading}>
      {fallback && <p className="banner">AI is unavailable. Showing a summary of retrieved records instead.</p>}
      {answer && <div className="building-advice-content"><ReactMarkdown skipHtml>{answer}</ReactMarkdown></div>}
    </div>
  </section>;
}
