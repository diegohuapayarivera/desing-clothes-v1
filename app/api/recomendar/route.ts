import { NextResponse, type NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import type { Ocasion, NivelClima } from '@/lib/recomendador'
import { OCASION_LABELS, filtrarCandidatas } from '@/lib/recomendador'
import type { Prenda } from '@/types'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

interface PrendaIA {
  id: string
  tipo: string
  categoria: string
  color_principal: string
  color_secundario?: string | null
  estilo: string
  estampado: boolean
}

const RequestSchema = z.object({
  ocasion: z.enum(['trabajo', 'casual', 'noche', 'formal', 'deporte']),
  clima: z.enum(['frio', 'templado', 'calor']),
  // Full mode
  avoid: z.array(z.array(z.string())).optional(),
  excludePrendaIds: z.array(z.string()).optional(),
  motivo: z.enum(['colores', 'muy_formal', 'muy_informal', 'muy_simple', 'prenda_puntual']).optional(),
  // Replace mode
  mode: z.enum(['full', 'replace']).optional(),
  outfit_actual: z.array(z.string()).optional(),
  prenda_descartada: z.string().optional(),
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

const MOTIVO_DESC_LABELS: Record<string, string> = {
  colores: 'los colores no combinaban',
  muy_formal: 'muy formal',
  muy_informal: 'muy informal',
  muy_simple: 'muy simple',
  prenda_puntual: 'prenda específica descartada',
}

const MOTIVO_PROMPT_LABELS: Record<string, string> = {
  colores: 'los colores no combinaban bien — elige combinaciones más armoniosas',
  muy_formal: 'era demasiado formal — propón opciones más relajadas',
  muy_informal: 'era demasiado informal — propón opciones más elegantes',
  muy_simple: 'era demasiado simple — propón opciones con más personalidad y detalle',
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
      .select('prenda_ids, motivo')
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
  const rechazados = (feedbackData ?? [])
    .map((f: { prenda_ids: unknown; motivo: unknown }) => {
      const desc = describir(f.prenda_ids)
      if (!desc) return ''
      const motivoStr =
        typeof f.motivo === 'string' && f.motivo
          ? ` (rechazado: ${MOTIVO_DESC_LABELS[f.motivo] ?? f.motivo})`
          : ''
      return desc + motivoStr
    })
    .filter(Boolean)

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
  motivo?: string | null,
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

  const motivoNote =
    motivo && MOTIVO_PROMPT_LABELS[motivo]
      ? `\nIMPORTANTE: El usuario rechazó el conjunto anterior porque ${MOTIVO_PROMPT_LABELS[motivo]}.`
      : ''

  return `Eres un estilista experto en moda. El usuario tiene estas prendas disponibles:
${prendasJson}

Genera 2-3 conjuntos completos para ocasión: "${OCASION_LABELS[ocasion]}" y clima: ${CLIMA_LABELS[clima]}.${avoidNote}${favNote}${rechazadosNote}${motivoNote}

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

function buildReplacePrompt(
  keptItems: PrendaIA[],
  descartada: PrendaIA,
  candidatas: PrendaIA[],
  categoriaDescartada: string,
  ocasion: Ocasion,
): string {
  const colorSec = (p: PrendaIA) => (p.color_secundario ? `/${p.color_secundario}` : '')
  const desc = (p: PrendaIA) =>
    `${p.tipo.replaceAll('_', ' ')} ${p.color_principal}${colorSec(p)} (id:"${p.id}")`

  const conjuntoActual = keptItems.map(desc).join(', ')
  const descartadaDesc = desc(descartada)
  const candidatasJson = JSON.stringify(
    candidatas.map(({ id, tipo, categoria, color_principal, color_secundario }) => ({
      id,
      tipo,
      categoria,
      color_principal,
      ...(color_secundario ? { color_secundario } : {}),
    })),
  )
  const keepIds = keptItems.map((p) => `"${p.id}"`).join(', ')

  const reemplazoNote =
    categoriaDescartada === 'cuerpo_completo'
      ? 'Puedes reemplazar con otro cuerpo_completo O con un superior + un inferior de las candidatas.'
      : `Elige UNA candidata de categoría "${categoriaDescartada}" que mejor combine con el resto del conjunto.`

  return `Eres un estilista. El usuario quiere cambiar UNA prenda de su conjunto.

Prendas que SE MANTIENEN: ${conjuntoActual || '(ninguna)'}
Prenda a REEMPLAZAR: ${descartadaDesc}
Candidatas para el reemplazo (usa SOLO estos IDs): ${candidatasJson}

${reemplazoNote}

REGLAS ESTRICTAS:
- Incluye TODOS estos IDs sin cambios: [${keepIds}]
- El/los ID(s) nuevo(s) deben ser exactamente de la lista de candidatas
- Ocasión: ${OCASION_LABELS[ocasion]}
- Justificación: 1 frase corta y natural en español

Responde SOLO con JSON: {"prenda_ids":["id1","id2"],"justificacion":"frase"}`
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
  motivo?: string | null,
): Promise<{ prenda_ids: string[]; justificacion: string }[]> {
  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    messages: [{ role: 'user', content: buildPrompt(prendas, ocasion, clima, personalizacion, avoid, motivo) }],
  })

  const text = message.content[0].type === 'text' ? message.content[0].text.trim() : ''
  const jsonMatch = /\{[\s\S]*\}/.exec(text)
  if (!jsonMatch) throw new Error('No JSON in response')

  const parsed = JSON.parse(jsonMatch[0])
  const result = ResponseSchema.safeParse(parsed)
  if (!result.success) throw new Error('Invalid JSON shape')

  return result.data.outfits
}

async function callClaudeReplace(
  prompt: string,
): Promise<z.infer<typeof OutfitSchema> | null> {
  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 512,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = message.content[0].type === 'text' ? message.content[0].text.trim() : ''
  const jsonMatch = /\{[\s\S]*\}/.exec(text)
  if (!jsonMatch) return null

  const parsed = JSON.parse(jsonMatch[0])
  const result = OutfitSchema.safeParse(parsed)
  return result.success ? result.data : null
}

function verifyReplacement(
  result: { prenda_ids: string[]; justificacion: string },
  outfitActual: string[],
  prendaDescartada: string,
  candidataIds: Set<string>,
  prendasById: Map<string, PrendaIA>,
  clima: NivelClima,
): boolean {
  const keepIds = outfitActual.filter((id) => id !== prendaDescartada)
  if (!keepIds.every((id) => result.prenda_ids.includes(id))) return false
  const newIds = result.prenda_ids.filter((id) => !keepIds.includes(id))
  if (newIds.length === 0) return false
  if (newIds.some((id) => !candidataIds.has(id))) return false
  return validateOutfit(result, prendasById, clima) === null
}

const NEUTRAL_COLORS = new Set(['negro', 'blanco', 'gris', 'beige', 'marron'])

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

  const { ocasion, clima, mode } = body

  // ── Replace mode ─────────────────────────────────────────────────────────
  if (mode === 'replace') {
    const { outfit_actual, prenda_descartada, excludePrendaIds } = body

    if (!outfit_actual?.length || !prenda_descartada) {
      return NextResponse.json({ error: 'Datos inválidos para modo reemplazo' }, { status: 400 })
    }

    const { data: prendaRows } = await supabase
      .from('prendas')
      .select('*')
      .eq('user_id', user.id)
    const allPrendas = (prendaRows ?? []) as Prenda[]

    const prendaDesc = allPrendas.find((p) => p.id === prenda_descartada)
    if (!prendaDesc) {
      return NextResponse.json({ error: 'Prenda no encontrada' }, { status: 404 })
    }

    const categoriaDescartada = prendaDesc.categoria

    const { candidatas: allCandidatas } = filtrarCandidatas(
      allPrendas.map((p) => ({ ...p, signedUrl: '' })),
      ocasion,
      clima,
    )

    const outfitSet = new Set(outfit_actual)
    const excludedSet = new Set([prenda_descartada, ...(excludePrendaIds ?? [])])

    const candidatasReplace =
      categoriaDescartada === 'cuerpo_completo'
        ? allCandidatas.filter(
            (p) =>
              !excludedSet.has(p.id) &&
              !outfitSet.has(p.id) &&
              (p.categoria === 'cuerpo_completo' ||
                p.categoria === 'superior' ||
                p.categoria === 'inferior'),
          )
        : allCandidatas.filter(
            (p) =>
              !excludedSet.has(p.id) &&
              !outfitSet.has(p.id) &&
              p.categoria === categoriaDescartada,
          )

    if (candidatasReplace.length === 0) {
      const catLabel: Record<string, string> = {
        calzado: 'calzado',
        superior: 'tops o blusas',
        inferior: 'pantalones o faldas',
        abrigo: 'abrigos',
        accesorio: 'accesorios',
        cuerpo_completo: 'cuerpos enteros',
      }
      const label = catLabel[categoriaDescartada] ?? categoriaDescartada
      return NextResponse.json(
        {
          error: `No tienes otro ${label} disponible para esta combinación — agrega más prendas de ese tipo.`,
        },
        { status: 422 },
      )
    }

    // Build full prendasById for prompt building + validation
    const allPrendasIA: PrendaIA[] = allPrendas.map(
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
    const prendasById = new Map(allPrendasIA.map((p) => [p.id, p]))
    const candidataIds = new Set(candidatasReplace.map((c) => c.id))
    const candidatasIA = candidatasReplace
      .map((p) => prendasById.get(p.id))
      .filter((p): p is PrendaIA => p != null)

    const keptItems = outfit_actual
      .filter((id) => id !== prenda_descartada)
      .map((id) => prendasById.get(id))
      .filter((p): p is PrendaIA => p != null)

    const descartadaIA = prendasById.get(prenda_descartada)
    if (!descartadaIA) {
      return NextResponse.json({ error: 'Prenda no encontrada en el mapa' }, { status: 404 })
    }

    const replacePrompt = buildReplacePrompt(
      keptItems,
      descartadaIA,
      candidatasIA,
      categoriaDescartada,
      ocasion,
    )

    const verify = (r: { prenda_ids: string[]; justificacion: string }) =>
      verifyReplacement(r, outfit_actual, prenda_descartada, candidataIds, prendasById, clima)

    let replacement: { prenda_ids: string[]; justificacion: string } | null = null

    try {
      const r1 = await callClaudeReplace(replacePrompt)
      if (r1 && verify(r1)) {
        replacement = r1
      } else {
        const r2 = await callClaudeReplace(replacePrompt)
        if (r2 && verify(r2)) replacement = r2
      }
    } catch {}

    // Programmatic fallback
    if (!replacement) {
      const keepIds = outfit_actual.filter((id) => id !== prenda_descartada)

      if (categoriaDescartada === 'cuerpo_completo') {
        const otroCuerpo = candidatasIA.find((c) => c.categoria === 'cuerpo_completo')
        if (otroCuerpo) {
          replacement = {
            prenda_ids: [...keepIds, otroCuerpo.id],
            justificacion: 'Una alternativa que combina bien con tu conjunto.',
          }
        } else {
          const sup =
            candidatasIA.find((c) => c.categoria === 'superior' && NEUTRAL_COLORS.has(c.color_principal)) ??
            candidatasIA.find((c) => c.categoria === 'superior')
          const inf =
            candidatasIA.find((c) => c.categoria === 'inferior' && NEUTRAL_COLORS.has(c.color_principal)) ??
            candidatasIA.find((c) => c.categoria === 'inferior')
          if (sup && inf) {
            replacement = {
              prenda_ids: [...keepIds, sup.id, inf.id],
              justificacion: 'Una combinación que funciona con lo que tienes.',
            }
          }
        }
      } else {
        const best =
          candidatasIA.find((c) => NEUTRAL_COLORS.has(c.color_principal)) ?? candidatasIA[0]
        if (best) {
          replacement = {
            prenda_ids: [...keepIds, best.id],
            justificacion: 'Una opción que combina bien con tu conjunto.',
          }
        }
      }
    }

    if (!replacement) {
      return NextResponse.json(
        { error: 'No se pudo encontrar un reemplazo válido. Intenta de nuevo.' },
        { status: 422 },
      )
    }

    return NextResponse.json({ outfits: [replacement] })
  }

  // ── Full mode ─────────────────────────────────────────────────────────────
  const { avoid, excludePrendaIds, motivo } = body

  const { data: prendaRows } = await supabase
    .from('prendas')
    .select('*')
    .eq('user_id', user.id)
  const allPrendas = (prendaRows ?? []) as Prenda[]

  const prendasParaFiltrar = excludePrendaIds?.length
    ? allPrendas.filter((p) => !excludePrendaIds.includes(p.id))
    : allPrendas

  const { candidatas, error: filtroError } = filtrarCandidatas(
    prendasParaFiltrar.map((p) => ({ ...p, signedUrl: '' })),
    ocasion,
    clima,
  )
  if (filtroError) {
    return NextResponse.json({ error: filtroError }, { status: 422 })
  }

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
    const primera = await callClaude(prendas, ocasion, clima, personalizacion, avoid, motivo)
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
