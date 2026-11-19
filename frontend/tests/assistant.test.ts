import { describe, expect, it, vi } from 'vitest'
import { ApiAssistantAdapter, ApiClient } from '../src/services/api'
import { createServices } from '../src/services/runtime'

const buildingId = 'nyc-canonical-building'
const checkedAt = '2026-11-19T12:00:00Z'
const question = { id: 'q', role: 'user' as const, text: '  What about heat?  ', createdAt: checkedAt, buildingIds: [buildingId] }
const input = { messages: [{ ...question, text: 'Earlier question' }, { ...question, role: 'assistant' as const, text: 'Earlier answer' }, question], buildingIds: [buildingId] }

describe('assistant adapter', () => {
  it.each([false, true])('sends only the latest question and preserves fallback=%s', async fallback => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ answer: '**Heat:** records', fallback, buildingId, checkedAt }))
    const signal = new AbortController().signal
    const reply = await new ApiAssistantAdapter(new ApiClient('/api', fetcher)).send(input, signal)
    expect(fetcher).toHaveBeenCalledWith('/api/ai/advice', expect.objectContaining({
      method: 'POST', signal, credentials: 'include', body: JSON.stringify({ buildingId, question: 'What about heat?' }),
    }))
    expect(reply).toMatchObject({ role: 'assistant', text: '**Heat:** records', fallback, checkedAt, buildingIds: [buildingId] })
  })

  it('rejects invalid questions and multiple/demo building IDs before sending', async () => {
    const fetcher = vi.fn<typeof fetch>()
    const adapter = new ApiAssistantAdapter(new ApiClient('/api', fetcher))
    for (const value of [
      { ...input, buildingIds: [] }, { ...input, buildingIds: [buildingId, 'other'] },
      { ...input, buildingIds: ['demo-example'] },
      { ...input, messages: [{ ...question, text: ' ' }] },
      { ...input, messages: [{ ...question, text: 'x'.repeat(2001) }] },
    ]) await expect(adapter.send(value)).rejects.toMatchObject({ status: 400 })
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('preserves HTTP errors and rejects malformed or mismatched responses and network failures', async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ error: { message: 'rate limit' } }, { status: 429 }))
      .mockResolvedValueOnce(Response.json({ answer: 'bad' }))
      .mockResolvedValueOnce(Response.json({ answer: 'wrong', fallback: false, buildingId: 'other', checkedAt }))
      .mockRejectedValueOnce(new TypeError('offline'))
    const adapter = new ApiAssistantAdapter(new ApiClient('/api', fetcher))
    await expect(adapter.send(input)).rejects.toMatchObject({ status: 429, message: 'rate limit' })
    await expect(adapter.send(input)).rejects.toThrow(/unexpected response/)
    await expect(adapter.send(input)).rejects.toThrow(/different building/)
    await expect(adapter.send(input)).rejects.toThrow(/unreachable/)
  })

  it('propagates cancellation without converting it to a service error', async () => {
    const controller = new AbortController()
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (_url, options) => new Promise((_resolve, reject) => {
      options?.signal?.addEventListener('abort', () => reject(options.signal?.reason), { once: true })
    }))
    const pending = new ApiAssistantAdapter(new ApiClient('/api', fetcher)).send(input, controller.signal)
    controller.abort()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('enables only the API service', () => {
    const storage = {} as Storage
    expect(createServices({}, storage).assistant.available).toBe(false)
    expect(createServices({ VITE_DATA_PROVIDER: 'api', VITE_API_BASE_URL: '/api' }, storage).assistant).toBeInstanceOf(ApiAssistantAdapter)
  })
})
