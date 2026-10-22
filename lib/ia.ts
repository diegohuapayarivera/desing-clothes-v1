import Anthropic from '@anthropic-ai/sdk'
import type { createClient } from '@/lib/supabase/server'
import { extractText } from '@/lib/anthropic'
import { hoyLima, inicioSemanaLima } from '@/lib/fecha'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// Etiquetar fotos y opinar conjuntos: tareas cortas de alto volumen.
export const MODELO_RAPIDO = 'claude-haiku-5-5'
// Recomendaciones de outfits: necesita más criterio de combinación.
export const MODELO_ESTILISTA = 'claude-sonnet-5-5'

// Llamadas al estilista por usuario (hora de Lima; la semana va de lunes a
// domingo). Una generación hace 1-2 llamadas según si hace falta reintento.
export const LIMITE_DIARIO_ESTILISTA = 15
export const LIMITE_SEMANAL_ESTILISTA = 45

export type RutaIA = 'etiquetar' | 'opinar' | 'recomendar'

// Tope diario de las rutas con el modelo rápido: alto para no estorbar al
// digitalizar el clóset de una sentada, pero acota el gasto si alguien las
// llama en bucle (cualquier cuenta de Google puede entrar).
export const LIMITE_DIARIO_RAPIDO: Record<Exclude<RutaIA, 'recomendar'>, number> = {
  etiquetar: 150,
  opinar: 60,
}

type Supabase = Awaited<ReturnType<typeof createClient>>

interface PedirTextoOpts {
  supabase: Supabase
  userId: string
  ruta: RutaIA
  model: typeof MODELO_RAPIDO | typeof MODELO_ESTILISTA
  content: Anthropic.MessageParam['content']
  // Los modelos 5.5 piensan antes de responder y ese pensamiento cuenta
  // dentro de max_tokens: dejar margen por encima de la respuesta esperada.
  maxTokens: number
}

/**
 * Llama a Claude con effort bajo (tareas acotadas, el pensamiento extra no
 * mejora el resultado y se cobra como salida), registra el consumo en
 * `ai_uso` y devuelve el texto. Devuelve '' si el modelo declina responder.
 */
export async function pedirTexto({
  supabase,
  userId,
  ruta,
  model,
  content,
  maxTokens,
}: PedirTextoOpts): Promise<string> {
  const message = await anthropic.messages.create({
    model,
    max_tokens: maxTokens,
    output_config: { effort: 'low' },
    messages: [{ role: 'user', content }],
  })

  const { error } = await supabase.from('ai_uso').insert({
    user_id: userId,
    ruta,
    modelo: model,
    input_tokens: message.usage.input_tokens,
    output_tokens: message.usage.output_tokens,
  })
  if (error) console.error(`[${ruta}] no se pudo registrar el uso:`, error.message)

  if (message.stop_reason === 'refusal') {
    console.warn(`[${ruta}] Claude declinó responder:`, message.stop_details?.category ?? 'sin categoría')
    return ''
  }
  if (message.stop_reason === 'max_tokens') {
    console.warn(`[${ruta}] respuesta cortada por max_tokens (${maxTokens})`)
  }
  return extractText(message.content)
}

async function llamadasDesde(supabase: Supabase, userId: string, ruta: RutaIA, fecha: string): Promise<number> {
  const { count } = await supabase
    .from('ai_uso')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('ruta', ruta)
    .gte('created_at', `${fecha}T00:00:00-05:00`)
  return count ?? 0
}

/** Mensaje para el usuario si superó el límite diario de etiquetar/opinar; null si puede seguir. */
export async function limiteRapidoAlcanzado(
  supabase: Supabase,
  userId: string,
  ruta: Exclude<RutaIA, 'recomendar'>,
): Promise<string | null> {
  const hoy = await llamadasDesde(supabase, userId, ruta, hoyLima())
  if (hoy >= LIMITE_DIARIO_RAPIDO[ruta]) {
    return 'Llegaste al límite de uso por hoy. Vuelve a intentarlo mañana.'
  }
  return null
}

/** Mensaje para el usuario si superó el límite diario o semanal; null si puede seguir. */
export async function limiteEstilistaAlcanzado(supabase: Supabase, userId: string): Promise<string | null> {
  const [hoy, semana] = await Promise.all([
    llamadasDesde(supabase, userId, 'recomendar', hoyLima()),
    llamadasDesde(supabase, userId, 'recomendar', inicioSemanaLima()),
  ])
  if (semana >= LIMITE_SEMANAL_ESTILISTA) {
    return 'Llegaste al límite de recomendaciones de esta semana. Se reinicia el lunes.'
  }
  if (hoy >= LIMITE_DIARIO_ESTILISTA) {
    return 'Llegaste al límite de recomendaciones por hoy. Vuelve a intentarlo mañana.'
  }
  return null
}
