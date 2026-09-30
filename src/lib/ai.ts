import type Anthropic from '@anthropic-ai/sdk'
import type { BetaContentBlockParam, BetaMessage, BetaMessageParam, BetaTextBlock } from '@anthropic-ai/sdk/resources/beta/messages/messages'
import type { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import type { z } from 'zod'
import { create } from 'zustand'

/**
 * Claude, straight from the browser with the user's own API key.
 * - The key lives in this browser's localStorage only; it is never synced or sent anywhere but Anthropic.
 * - The model is chosen from the account's model list (newest Opus by default), so nothing is pinned here.
 * - Requests opt into server-side fallback so a classifier decline is retried on a suitable model.
 */

const KEY = 'wb.ai'
const FALLBACK_BETA = 'server-side-fallback-2026-07-01'

export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'

interface AiPrefs {
  key: string
  model: string
}

function read(): AiPrefs {
  try {
    return { key: '', model: '', ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }
  } catch {
    return { key: '', model: '' }
  }
}

interface AiState extends AiPrefs {
  models: { id: string; name: string }[]
  setKey: (key: string) => void
  setModel: (model: string) => void
  loadModels: () => Promise<void>
}

export const useAi = create<AiState>((set, get) => ({
  ...read(),
  models: [],
  setKey: (key) => {
    set({ key: key.trim(), models: [] })
    persist()
  },
  setModel: (model) => {
    set({ model })
    persist()
  },
  loadModels: async () => {
    const c = await client()
    const list: { id: string; name: string }[] = []
    for await (const m of c.models.list({ limit: 100 })) list.push({ id: m.id, name: m.display_name })
    set({ models: list })
    if (!get().model || !list.some((m) => m.id === get().model)) {
      // Newest first from the API; prefer the flagship family for quality.
      const pick = list.find((m) => /opus/i.test(m.id)) ?? list[0]
      if (pick) get().setModel(pick.id)
    }
  },
}))

function persist() {
  const { key, model } = useAi.getState()
  try {
    localStorage.setItem(KEY, JSON.stringify({ key, model }))
  } catch {
    /* storage blocked */
  }
}

export const aiReady = () => !!useAi.getState().key

export class AiError extends Error {
  kind: 'no-key' | 'auth' | 'rate' | 'refusal' | 'overloaded' | 'network' | 'other'
  constructor(kind: AiError['kind'], message: string) {
    super(message)
    this.kind = kind
  }
}

/** The SDK is loaded on first use so pages without AI don't pay for it. */
let sdk: typeof import('@anthropic-ai/sdk').default | null = null
const loadSdk = async () => (sdk ??= (await import('@anthropic-ai/sdk')).default)

let cached: { key: string; client: Anthropic } | null = null
async function client() {
  const { key } = useAi.getState()
  if (!key) throw new AiError('no-key', 'Add your Claude API key in Settings → AI to use this.')
  const SDK = await loadSdk()
  if (cached?.key !== key) cached = { key, client: new SDK({ apiKey: key, dangerouslyAllowBrowser: true, maxRetries: 2 }) }
  return cached.client
}

async function model() {
  const s = useAi.getState()
  if (!s.model) await s.loadModels()
  const m = useAi.getState().model
  if (!m) throw new AiError('other', 'No Claude models are available to this API key.')
  return m
}

/** Options a given model rejected — dropped for the rest of the session. */
const unsupported = new Map<string, Set<'fallbacks' | 'effort'>>()

function friendly(e: unknown): AiError {
  if (e instanceof AiError) return e
  const Anthropic = sdk
  if (!Anthropic) return new AiError('other', e instanceof Error ? e.message : String(e))
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) return new AiError('auth', 'Claude rejected the API key. Check it in Settings → AI.')
  if (e instanceof Anthropic.RateLimitError) return new AiError('rate', 'Rate limited by the Claude API — try again in a moment.')
  if (e instanceof Anthropic.InternalServerError) return new AiError('overloaded', 'Claude is busy right now — try again shortly.')
  if (e instanceof Anthropic.APIConnectionError) return new AiError('network', 'Couldn’t reach the Claude API. Check your connection.')
  if (e instanceof Anthropic.APIError) return new AiError('other', e.message)
  return new AiError('other', e instanceof Error ? e.message : String(e))
}

function refusalCheck(msg: BetaMessage) {
  if (msg.stop_reason === 'refusal') {
    throw new AiError('refusal', msg.stop_details?.explanation || 'Claude declined this request.')
  }
}

type Params = Parameters<Anthropic['beta']['messages']['create']>[0]

/** Builds request params, leaving out options this model has rejected before. */
function params(m: string, base: Omit<Params, 'model' | 'betas' | 'fallbacks' | 'output_config'> & { effort?: Effort; format?: ReturnType<typeof betaZodOutputFormat> }): Params {
  const skip = unsupported.get(m) ?? new Set()
  const { effort, format, ...rest } = base
  const output_config = {
    ...(effort && !skip.has('effort') ? { effort } : {}),
    ...(format ? { format } : {}),
  }
  return {
    ...rest,
    model: m,
    ...(skip.has('fallbacks') ? {} : { betas: [FALLBACK_BETA], fallbacks: 'default' as const }),
    ...(Object.keys(output_config).length ? { output_config } : {}),
  } as Params
}

/** Runs `fn`, retrying once without an option the model says it doesn't support. */
async function withCompat<T>(m: string, fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await fn()
    } catch (e) {
      if (sdk && e instanceof sdk.BadRequestError) {
        const msg = e.message.toLowerCase()
        const skip = unsupported.get(m) ?? new Set()
        const opt = msg.includes('fallback') ? 'fallbacks' : msg.includes('effort') ? 'effort' : null
        if (opt && !skip.has(opt)) {
          skip.add(opt)
          unsupported.set(m, skip)
          continue
        }
      }
      throw friendly(e)
    }
  }
  throw new AiError('other', 'Request failed')
}

export interface ChatOptions {
  system?: string
  messages: BetaMessageParam[]
  effort?: Effort
  maxTokens?: number
  onText?: (full: string) => void
  signal?: AbortSignal
}

/** Streams a reply; resolves with the final message (refusals throw AiError('refusal')). */
export async function chat(opts: ChatOptions): Promise<BetaMessage> {
  const m = await model()
  const c = await client()
  const msg = await withCompat(m, async () => {
    const stream = c.beta.messages.stream(
      params(m, { system: opts.system, messages: opts.messages, max_tokens: opts.maxTokens ?? 16000, effort: opts.effort ?? 'medium' }) as Parameters<Anthropic['beta']['messages']['stream']>[0],
      { signal: opts.signal },
    )
    let text = ''
    stream.on('text', (delta) => {
      text += delta
      opts.onText?.(text)
    })
    return stream.finalMessage()
  })
  refusalCheck(msg)
  return msg
}

/** One-shot structured output validated against a zod schema. */
export async function extract<S extends z.ZodType>(schema: S, opts: { system?: string; content: string | BetaContentBlockParam[]; effort?: Effort; maxTokens?: number; signal?: AbortSignal }): Promise<z.infer<S>> {
  const m = await model()
  const c = await client()
  const { betaZodOutputFormat } = await import('@anthropic-ai/sdk/helpers/beta/zod')
  const res = await withCompat(m, () =>
    c.beta.messages.parse(
      params(m, {
        system: opts.system,
        messages: [{ role: 'user', content: opts.content }],
        max_tokens: opts.maxTokens ?? 8000,
        effort: opts.effort ?? 'low',
        format: betaZodOutputFormat(schema),
      }) as Parameters<Anthropic['beta']['messages']['parse']>[0],
      { signal: opts.signal },
    ),
  )
  refusalCheck(res as BetaMessage)
  const out = (res as { parsed_output?: z.infer<S> | null }).parsed_output
  if (out == null) throw new AiError('other', 'Claude’s answer didn’t match the expected format. Try again.')
  return out
}

/** Quick connectivity check used by Settings. */
export async function testAi() {
  await useAi.getState().loadModels()
  const r = await chat({ messages: [{ role: 'user', content: 'Reply with the single word: ready' }], effort: 'low', maxTokens: 400 })
  return textOf(r)
}

export const textOf = (m: BetaMessage) =>
  m.content
    .filter((b): b is BetaTextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')

export async function blobToBase64(blob: Blob) {
  const buf = new Uint8Array(await blob.arrayBuffer())
  let s = ''
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000))
  return btoa(s)
}

export type { BetaMessage, BetaMessageParam, BetaContentBlockParam, BetaTextBlock }
