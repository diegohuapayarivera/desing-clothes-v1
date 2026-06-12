import { NextResponse, type NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import type { Ocasion, NivelClima } from '@/lib/recomendador'
import { OCASION_LABELS, filtrarCandidatas, validarCompatibilidadFijas } from '@/lib/recomendador'
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
  mode: z.enum(['full', 'replace', 'build_around']).optional(),
  outfit_actual: z.array(z.string()).optional(),
  prenda_descartada: z.string().optional(),
  // Build-around mode
  prendas_fijas: z.array(z.string()).min(1).max(2).optional(),
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

function deduplicar(
  outfits: { prenda_ids: string[]; justificacion: string }[],
): { prenda_ids: string[]; justificacion: string }[] {
  const seen = new Set<string>()
  return outfits.filter((o) => {
    const key = [...o.prenda_ids].sort((a, b) => a.localeCompare(b)).join(',')
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function buildBuildAroundPrompt(
  fijas: PrendaIA[],
  candidatas: PrendaIA[],
  ocasion: Ocasion,
  clima: NivelClima,
  personalizacion: PersonalizacionCtx,
  avoid?: string[][],
): string {
  const colorSec = (p: PrendaIA) => (p.color_secundario ? `/${p.color_secundario}` : '')
  const descFija = (p: PrendaIA) =>
    `${p.tipo.replaceAll('_', ' ')} ${p.color_principal}${colorSec(p)} [id:"${p.id}"]`

  const fijasDesc = fijas.map(descFija).join(' y ')
  const fijaIds = fijas.map((p) => `"${p.id}"`).join(', ')

  const candidatasJson = JSON.stringify(
    candidatas.map(({ id, tipo, categoria, color_principal, color_secundario }) => ({
      id,
      tipo,
      categoria,
      color_principal,
      ...(color_secundario ? { color_secundario } : {}),
    })),
  )

  const avoidNote =
    avoid && avoid.length > 0
      ? `\nEvita repetir exactamente estas combinaciones ya mostradas: ${avoid.map((ids) => ids.join('+')).join('; ')}.`
      : ''

  const favNote =
    personalizacion.favoritos.length > 0
      ? `\nEstilo personal del usuario: ${personalizacion.favoritos.join(' | ')}.`
      : ''

  const abrigo = clima === 'frio' ? 'OBLIGATORIO incluir 1 "abrigo"' : 'Opcional'

  return `Eres un estilista experto. El usuario quiere ponerse SÍ O SÍ: ${fijasDesc}.

Arma 2-3 conjuntos completos ALREDEDOR de esta(s) prenda(s) usando solo las candidatas:
${candidatasJson}

REGLAS OBLIGATORIAS — un conjunto que viole cualquier regla es inválido:
1. Cada conjunto DEBE incluir TODOS estos IDs fijados: [${fijaIds}]
2. Los demás IDs deben ser exactamente de la lista de candidatas
3. ESTRUCTURA: (1 "superior" + 1 "inferior") O (1 "cuerpo_completo"). No mezclar.
4. CALZADO: exactamente 1 prenda de categoría "calzado" por conjunto.
5. ABRIGO: ${abrigo}.
6. ACCESORIOS: 0 a 2 por conjunto, opcionales.
7. ESTAMPADO: máximo 1 prenda estampada por conjunto.
8. COLORES: combina bien. Neutros van con todo. Máximo 2 colores vivos por conjunto.${avoidNote}${favNote}

La justificación debe centrarse en la prenda fija: "El beige de tu pantalón hace brillar la blusa vino."

Responde ÚNICAMENTE con JSON válido sin markdown:
{"outfits":[{"prenda_ids":["id1","id2"],"justificacion":"frase corta"}]}`
}

function verifyBuildAround(
  outfit: { prenda_ids: string[]; justificacion: string },
  prendasFijasIds: string[],
  candidataIds: Set<string>,
  prendasById: Map<string, PrendaIA>,
  clima: NivelClima,
): boolean {
  if (!prendasFijasIds.every((id) => outfit.prenda_ids.includes(id))) return false
  const newIds = outfit.prenda_ids.filter((id) => !prendasFijasIds.includes(id))
  if (newIds.some((id) => !candidataIds.has(id))) return false
  return validateOutfit(outfit, prendasById, clima) === null
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

  // ── Build-around mode ─────────────────────────────────────────────────────
  if (mode === 'build_around') {
    const { prendas_fijas } = body

    if (!prendas_fijas?.length) {
      return NextResponse.json({ error: 'Datos inválidos para modo build_around' }, { status: 400 })
    }

    const { data: prendaRows } = await supabase.from('prendas').select('*').eq('user_id', user.id)
    const allPrendas = (prendaRows ?? []) as Prenda[]

    const fijasPrendas = prendas_fijas.map((id) => allPrendas.find((p) => p.id === id))
    if (fijasPrendas.some((p) => !p)) {
      return NextResponse.json({ error: 'Una o más prendas fijas no fueron encontradas' }, { status: 404 })
    }
    const prendasFijasObj = fijasPrendas.filter((p): p is Prenda => p != null)

    const compatResult = validarCompatibilidadFijas(prendasFijasObj)
    if (!compatResult.ok) {
      return NextResponse.json({ error: compatResult.error }, { status: 422 })
    }

    // Categories covered by fijas (so we don't send duplicates to Claude)
    const excludedCandidataCats = new Set<string>()
    for (const fija of prendasFijasObj) {
      if (fija.categoria === 'cuerpo_completo') {
        excludedCandidataCats.add('cuerpo_completo')
        excludedCandidataCats.add('superior')
        excludedCandidataCats.add('inferior')
      } else if (fija.categoria === 'superior') {
        excludedCandidataCats.add('superior')
        excludedCandidataCats.add('cuerpo_completo')
      } else if (fija.categoria === 'inferior') {
        excludedCandidataCats.add('inferior')
        excludedCandidataCats.add('cuerpo_completo')
      } else if (fija.categoria !== 'accesorio') {
        excludedCandidataCats.add(fija.categoria)
      }
    }

    const fijaIds = new Set(prendas_fijas)
    const nonFijas = allPrendas.filter((p) => !fijaIds.has(p.id))

    const { candidatas: candidatasBase } = filtrarCandidatas(
      nonFijas.map((p) => ({ ...p, signedUrl: '' })),
      ocasion,
      clima,
    )

    // Verify we can build a complete outfit from fijas + candidatasBase
    const allAvailableCats = new Set([
      ...prendasFijasObj.map((p) => p.categoria),
      ...candidatasBase.map((p) => p.categoria),
    ])
    // cuerpo_completo covers superior+inferior and vice-versa for completeness check
    if (allAvailableCats.has('cuerpo_completo')) {
      allAvailableCats.add('superior')
      allAvailableCats.add('inferior')
    }
    if (allAvailableCats.has('superior') && allAvailableCats.has('inferior')) {
      allAvailableCats.add('cuerpo_completo')
    }

    const tieneBody =
      allAvailableCats.has('cuerpo_completo') ||
      (allAvailableCats.has('superior') && allAvailableCats.has('inferior'))
    if (!tieneBody) {
      return NextResponse.json(
        { error: 'No hay tops o pantalones para completar el conjunto alrededor de tu elección — agrega más prendas.' },
        { status: 422 },
      )
    }
    if (!allAvailableCats.has('calzado')) {
      return NextResponse.json(
        { error: 'No hay calzado para completar el conjunto alrededor de tu elección — agrega zapatillas u otro calzado.' },
        { status: 422 },
      )
    }
    if (clima === 'frio' && !allAvailableCats.has('abrigo')) {
      return NextResponse.json(
        { error: 'Hace frío pero no hay abrigos para completar el conjunto — agrega una casaca, chompa o abrigo.' },
        { status: 422 },
      )
    }

    // Candidatas for Claude: exclude categories already covered by fijas
    const candidatasParaPrompt = candidatasBase.filter((p) => !excludedCandidataCats.has(p.categoria))

    // Build full prendasById (fijas + all candidatas) for validateOutfit
    const allPrendasIA: PrendaIA[] = allPrendas.map(
      ({ id, tipo, categoria, color_principal, color_secundario, estilo, estampado }) => ({
        id, tipo, categoria, color_principal,
        color_secundario: color_secundario ?? null,
        estilo, estampado,
      }),
    )
    const prendasById = new Map(allPrendasIA.map((p) => [p.id, p]))

    const fijasIA = prendasFijasObj
      .map((p) => prendasById.get(p.id))
      .filter((p): p is PrendaIA => p != null)

    const candidatasIA = candidatasParaPrompt
      .map((p) => prendasById.get(p.id))
      .filter((p): p is PrendaIA => p != null)

    const candidataIds = new Set(candidatasIA.map((c) => c.id))

    const personalizacion = await fetchPersonalizacion(supabase, ocasion, prendasById)

    const { avoid } = body
    const bPrompt = buildBuildAroundPrompt(fijasIA, candidatasIA, ocasion, clima, personalizacion, avoid)

    const verify = (r: { prenda_ids: string[]; justificacion: string }) =>
      verifyBuildAround(r, prendas_fijas, candidataIds, prendasById, clima)

    const filterBA = (raw: { prenda_ids: string[]; justificacion: string }[]) =>
      raw.filter(verify)

    let validosBA: { prenda_ids: string[]; justificacion: string }[] = []
    try {
      const message = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        messages: [{ role: 'user', content: bPrompt }],
      })
      const text = message.content[0].type === 'text' ? message.content[0].text.trim() : ''
      const jsonMatch = /\{[\s\S]*\}/.exec(text)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        const result = ResponseSchema.safeParse(parsed)
        if (result.success) validosBA = filterBA(result.data.outfits)
      }
    } catch {}

    if (validosBA.length < 2) {
      try {
        const retryAvoid = [...(avoid ?? []), ...validosBA.map((o) => o.prenda_ids)]
        const bPrompt2 = buildBuildAroundPrompt(fijasIA, candidatasIA, ocasion, clima, personalizacion, retryAvoid)
        const message2 = await anthropic.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 1024,
          messages: [{ role: 'user', content: bPrompt2 }],
        })
        const text2 = message2.content[0].type === 'text' ? message2.content[0].text.trim() : ''
        const jsonMatch2 = /\{[\s\S]*\}/.exec(text2)
        if (jsonMatch2) {
          const parsed2 = JSON.parse(jsonMatch2[0])
          const result2 = ResponseSchema.safeParse(parsed2)
          if (result2.success) {
            validosBA = deduplicar([...validosBA, ...filterBA(result2.data.outfits)])
          }
        }
      } catch {}
    }

    // Programmatic fallback
    if (validosBA.length === 0) {
      const baseIds = [...prendas_fijas]

      const needsBody = !prendasFijasObj.some(
        (p) => p.categoria === 'cuerpo_completo' || p.categoria === 'superior',
      )
      const needsInferior = !prendasFijasObj.some(
        (p) => p.categoria === 'cuerpo_completo' || p.categoria === 'inferior',
      )
      const needsCalzado = !prendasFijasObj.some((p) => p.categoria === 'calzado')
      const needsAbrigo = clima === 'frio' && !prendasFijasObj.some((p) => p.categoria === 'abrigo')

      if (needsBody) {
        const sup =
          candidatasIA.find((c) => c.categoria === 'superior' && NEUTRAL_COLORS.has(c.color_principal)) ??
          candidatasIA.find((c) => c.categoria === 'superior')
        if (sup) baseIds.push(sup.id)
      }
      if (needsInferior) {
        const inf =
          candidatasIA.find((c) => c.categoria === 'inferior' && NEUTRAL_COLORS.has(c.color_principal)) ??
          candidatasIA.find((c) => c.categoria === 'inferior')
        if (inf) baseIds.push(inf.id)
      }
      if (needsCalzado) {
        const cal =
          candidatasIA.find((c) => c.categoria === 'calzado' && NEUTRAL_COLORS.has(c.color_principal)) ??
          candidatasIA.find((c) => c.categoria === 'calzado')
        if (cal) baseIds.push(cal.id)
      }
      if (needsAbrigo) {
        const abr =
          candidatasIA.find((c) => c.categoria === 'abrigo' && NEUTRAL_COLORS.has(c.color_principal)) ??
          candidatasIA.find((c) => c.categoria === 'abrigo')
        if (abr) baseIds.push(abr.id)
      }

      const fallback = { prenda_ids: baseIds, justificacion: 'Una combinación que funciona bien con tu elección.' }
      if (validateOutfit(fallback, prendasById, clima) === null) {
        validosBA = [fallback]
      }
    }

    if (validosBA.length === 0) {
      return NextResponse.json(
        { error: 'No se pudieron generar conjuntos válidos alrededor de tu elección. Intenta de nuevo.' },
        { status: 422 },
      )
    }

    return NextResponse.json({ outfits: deduplicar(validosBA).slice(0, 3) })
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
