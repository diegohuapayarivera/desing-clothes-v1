import { NextResponse, type NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import type { Ocasion, NivelClima } from '@/lib/recomendador'
import { OCASION_LABELS, filtrarCandidatas } from '@/lib/recomendador'
import type { Prenda } from '@/types'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// Internal type only — not part of the public request contract
interface PrendaIA {
  id: string
  tipo: string
  categoria: string
  color_principal: string
  color_secundario?: string | null
  estilo: string
  estampado: boolean
}

// Client only sends intent — prendas are fetched server-side
const RequestSchema = z.object({
  ocasion: z.enum(['trabajo', 'casual', 'noche', 'formal', 'deporte']),
  clima: z.enum(['frio', 'templado', 'calor']),
  avoid: z.array(z.array(z.string())).optional(),
  excludePrendaIds: z.array(z.string()).optional(),
})

const OutfitSchema = z.object({
  prenda_ids: z.array(z.string()),
  justificacion: z.string(),
})

const ResponseSchema = z.object({
  outfits: z.array(OutfitSchema),
})

interface PersonalizacionCtx {
  favoritos: string[]
  rechazados: string[]
  savedSets: string[][]
}

async function fetchPersonalizacion(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ocasion: Ocasion,
  prendasById: Map<string, PrendaIA>,
): Promise<PersonalizacionCtx> {
  const describir = (ids: unknown) => {
    const arr = Array.isArray(ids) ? (ids as string[]) : []
    return arr
      .map((id) => prendasById.get(id))
      .filter((p): p is PrendaIA => p != null)
      .map((p) => `${p.tipo.replaceAll('_', ' ')} ${p.color_principal}`)
      .join(' + ')
  }

  const [{ data: conjOcasion }, { data: conjGeneral }, { data: feedbackData }] = await Promise.all([
    supabase
      .from('conjuntos')
      .select('prenda_ids')
      .eq('ocasion', ocasion)
      .order('created_at', { ascending: false })
      .limit(5),
    supabase
      .from('conjuntos')
      .select('prenda_ids')
      .neq('ocasion', ocasion)
      .order('created_at', { ascending: false })
      .limit(5),
    supabase
      .from('feedback_outfits')
      .select('prenda_ids')
      .order('created_at', { ascending: false })
      .limit(10),
  ])

  const allFavs = [...(conjOcasion ?? []), ...(conjGeneral ?? [])].slice(0, 10)
  const favoritos = allFavs.map((c) => describir(c.prenda_ids)).filter(Boolean)
  const savedSets = allFavs.map((c) =>
    (Array.isArray(c.prenda_ids) ? (c.prenda_ids as string[]) : []).sort((a, b) =>
      a.localeCompare(b),
    ),
  )
  const rechazados = (feedbackData ?? []).map((f) => describir(f.prenda_ids)).filter(Boolean)

  return { favoritos, rechazados, savedSets }
}

const CLIMA_LABELS: Record<NivelClima, string> = {
  frio: 'frío (< 15°C)',
  templado: 'templado (15-22°C)',
  calor: 'calor (> 22°C)',
}

function buildPrompt(
  prendas: PrendaIA[],
  ocasion: Ocasion,
  clima: NivelClima,
  personalizacion: PersonalizacionCtx,
  avoid?: string[][],
): string {
  const prendasJson = JSON.stringify(
    prendas.map(({ id, tipo, categoria, color_principal, color_secundario, estilo, estampado }) => ({
      id,
      tipo,
      categoria,
      color_principal,
      ...(color_secundario ? { color_secundario } : {}),
      estilo,
      estampado,
    })),
  )

  const avoidNote =
    avoid && avoid.length > 0
      ? `\nEvita repetir exactamente estas combinaciones ya mostradas (por sus IDs): ${avoid.map((ids) => ids.join('+')).join('; ')}.`
      : ''

  const favNote =
    personalizacion.favoritos.length > 0
      ? `\nEstilo personal (favoritos guardados): ${personalizacion.favoritos.join(' | ')}.`
      : ''

  const rechazadosNote =
    personalizacion.rechazados.length > 0
      ? `\nCombinaciones rechazadas anteriormente (no repetir tal cual): ${personalizacion.rechazados.join(' | ')}.`
      : ''

  return `Eres un estilista experto en moda. El usuario tiene estas prendas disponibles:
${prendasJson}

Genera 2-3 conjuntos completos para ocasión: "${OCASION_LABELS[ocasion]}" y clima: ${CLIMA_LABELS[clima]}.${avoidNote}${favNote}${rechazadosNote}

REGLAS OBLIGATORIAS — un conjunto que viole cualquier regla es inválido:
1. ESTRUCTURA: (exactamente 1 "superior" + exactamente 1 "inferior") O (exactamente 1 "cuerpo_completo"). Nunca mezclar cuerpo_completo con superior o inferior.
2. CALZADO: Exactamente 1 prenda de categoría "calzado" por conjunto, siempre.
3. ABRIGO: Si clima=frío, OBLIGATORIO incluir exactamente 1 prenda de categoría "abrigo".
4. ACCESORIOS: 0 a 2 prendas de categoría "accesorio" por conjunto, opcionales.
5. ESTAMPADO: Máximo 1 prenda con estampado=true por conjunto.
6. COLORES: Combina bien. Neutros (negro, blanco, gris, beige, marrón) van con todo. Evita choques entre colores intensos. Máximo 2 colores vivos por conjunto.
7. Usa SOLO los IDs de la lista dada. No inventes ni repitas IDs.
${favNote ? '8. Considera el estilo personal reflejado en los favoritos sin repetir conjuntos idénticos.' : ''}

Justificación: 1 frase corta, natural y cercana en español (ej: "El azul marino eleva el blanco para una noche elegante").

Responde ÚNICAMENTE con JSON válido sin markdown:
{"outfits":[{"prenda_ids":["id1","id2"],"justificacion":"frase corta"}]}`
}

function validateOutfit(
  outfit: { prenda_ids: string[]; justificacion: string },
  prendasById: Map<string, PrendaIA>,
  clima: NivelClima,
): string | null {
  const items = outfit.prenda_ids
    .map((id) => prendasById.get(id))
    .filter((p): p is PrendaIA => p != null)

  if (items.length !== outfit.prenda_ids.length) return 'Contiene IDs no válidos'

  const superiores = items.filter((p) => p.categoria === 'superior')
  const inferiores = items.filter((p) => p.categoria === 'inferior')
  const cuerpos = items.filter((p) => p.categoria === 'cuerpo_completo')
  const calzados = items.filter((p) => p.categoria === 'calzado')
  const abrigos = items.filter((p) => p.categoria === 'abrigo')
  const accesorios = items.filter((p) => p.categoria === 'accesorio')
  const estampadas = items.filter((p) => p.estampado)

  if (cuerpos.length > 0 && (superiores.length > 0 || inferiores.length > 0)) {
    return 'Mezcla cuerpo_completo con superior/inferior'
  }
  if (cuerpos.length === 0 && superiores.length !== 1) return 'Debe tener exactamente 1 superior'
  if (cuerpos.length === 0 && inferiores.length !== 1) return 'Debe tener exactamente 1 inferior'
  if (cuerpos.length > 1) return 'Más de un cuerpo_completo'
  if (calzados.length !== 1) return 'Debe tener exactamente 1 calzado'
  if (clima === 'frio' && abrigos.length === 0) return 'Clima frío requiere abrigo'
  if (accesorios.length > 2) return 'Máximo 2 accesorios'
  if (estampadas.length > 1) return 'Máximo 1 prenda estampada'

  return null
}

async function callClaude(
  prendas: PrendaIA[],
  ocasion: Ocasion,
  clima: NivelClima,
  personalizacion: PersonalizacionCtx,
  avoid?: string[][],
): Promise<{ prenda_ids: string[]; justificacion: string }[]> {
  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    messages: [{ role: 'user', content: buildPrompt(prendas, ocasion, clima, personalizacion, avoid) }],
  })

  const text = message.content[0].type === 'text' ? message.content[0].text.trim() : ''
  const jsonMatch = /\{[\s\S]*\}/.exec(text)
  if (!jsonMatch) throw new Error('No JSON in response')

  const parsed = JSON.parse(jsonMatch[0])
  const result = ResponseSchema.safeParse(parsed)
  if (!result.success) throw new Error('Invalid JSON shape')

  return result.data.outfits
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  let body: z.infer<typeof RequestSchema>
  try {
    const json = await request.json()
    const parsed = RequestSchema.safeParse(json)
    if (!parsed.success) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })
    body = parsed.data
  } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
  }

  const { ocasion, clima, avoid, excludePrendaIds } = body

  // Fetch prendas from DB — client is never trusted for this
  const { data: prendaRows } = await supabase
    .from('prendas')
    .select('*')
    .eq('user_id', user.id)
  const allPrendas = (prendaRows ?? []) as Prenda[]

  // Apply per-prenda exclusion (used by ✕ refresh)
  const prendasParaFiltrar = excludePrendaIds?.length
    ? allPrendas.filter((p) => !excludePrendaIds.includes(p.id))
    : allPrendas

  // Run candidate filter server-side
  const { candidatas, error: filtroError } = filtrarCandidatas(
    prendasParaFiltrar.map((p) => ({ ...p, signedUrl: '' })),
    ocasion,
    clima,
  )
  if (filtroError) {
    return NextResponse.json({ error: filtroError }, { status: 422 })
  }

  // Map to PrendaIA for prompt building
  const prendas: PrendaIA[] = candidatas.map(
    ({ id, tipo, categoria, color_principal, color_secundario, estilo, estampado }) => ({
      id,
      tipo,
      categoria,
      color_principal,
      color_secundario: color_secundario ?? null,
      estilo,
      estampado,
    }),
  )
  const prendasById = new Map(prendas.map((p) => [p.id, p]))

  const personalizacion = await fetchPersonalizacion(supabase, ocasion, prendasById)

  const filter = (raw: { prenda_ids: string[]; justificacion: string }[]) =>
    raw.filter((o) => validateOutfit(o, prendasById, clima) === null)

  const deduplicar = (outfits: { prenda_ids: string[]; justificacion: string }[]) => {
    const seen = new Set<string>()
    return outfits.filter((o) => {
      const key = [...o.prenda_ids].sort((a, b) => a.localeCompare(b)).join(',')
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }

  const isSavedAlready = (outfit: { prenda_ids: string[] }) => {
    const key = [...outfit.prenda_ids].sort((a, b) => a.localeCompare(b)).join(',')
    return personalizacion.savedSets.some((s) => s.join(',') === key)
  }

  try {
    const primera = await callClaude(prendas, ocasion, clima, personalizacion, avoid)
    let validos = filter(primera).filter((o) => !isSavedAlready(o))

    if (validos.length < 2) {
      try {
        const retryAvoid = [...(avoid ?? []), ...validos.map((o) => o.prenda_ids)]
        const segunda = await callClaude(prendas, ocasion, clima, personalizacion, retryAvoid)
        validos = deduplicar([...validos, ...filter(segunda).filter((o) => !isSavedAlready(o))])
      } catch {}
    }

    if (validos.length === 0) {
      return NextResponse.json(
        { error: 'No se pudieron generar conjuntos válidos. Intenta de nuevo.' },
        { status: 422 },
      )
    }

    return NextResponse.json({ outfits: deduplicar(validos).slice(0, 3) })
  } catch {
    return NextResponse.json(
      { error: 'Error al generar recomendaciones. Intenta de nuevo.' },
      { status: 500 },
    )
  }
}
