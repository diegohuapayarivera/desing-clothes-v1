import { NextResponse, type NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import {
  CATEGORIAS,
  COLORES,
  ESTILOS,
  TEMPORADAS,
  TODOS_LOS_TIPOS_VALORES,
  promptTaxonomia,
  normalizarTipo,
  normalizarColor,
  normalizarTemporada,
} from '@/lib/taxonomia'
import { extractText } from '@/lib/anthropic'

const TagsSchema = z.object({
  categoria: z.enum(CATEGORIAS),
  tipo: z.string().min(1),
  color_principal: z.enum(COLORES),
  color_secundario: z.enum(COLORES).nullable().optional(),
  estilo: z.enum(ESTILOS),
  estampado: z.boolean(),
  temporada: z.enum(TEMPORADAS),
})

type Tags = z.infer<typeof TagsSchema>

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

/** Normalize raw AI output before Zod validation. */
function normalizarRespuesta(raw: Record<string, unknown>): Record<string, unknown> {
  const out = { ...raw }

  // Lowercase string fields before enum validation
  if (typeof out.categoria === 'string') out.categoria = out.categoria.trim().toLowerCase()
  if (typeof out.estilo === 'string') out.estilo = out.estilo.trim().toLowerCase()
  if (typeof out.temporada === 'string') {
    out.temporada = normalizarTemporada(out.temporada) ?? out.temporada.trim().toLowerCase()
  }

  // Normalize tipo with synonym map
  out.tipo = normalizarTipo(out.tipo as string | null | undefined) ?? ''

  // Normalize colors with synonym map
  if (typeof out.color_principal === 'string') {
    out.color_principal = normalizarColor(out.color_principal) ?? out.color_principal.trim().toLowerCase()
  }
  if (
    out.color_secundario == null ||
    out.color_secundario === '' ||
    out.color_secundario === 'null' ||
    out.color_secundario === 'none' ||
    out.color_secundario === 'ninguno'
  ) {
    out.color_secundario = null
  } else if (typeof out.color_secundario === 'string') {
    out.color_secundario = normalizarColor(out.color_secundario) ?? out.color_secundario.trim().toLowerCase()
  }

  // Normalize estampado
  if (typeof out.estampado === 'string') {
    out.estampado = out.estampado === 'true' || out.estampado === 'sí' || out.estampado === 'si'
  }

  return out
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  let imageBytes: Uint8Array
  let mimeType: 'image/webp' | 'image/jpeg' | 'image/png'
  // Bytes used for AI tagging — original photo when available (faithful colors).
  let imageBytesForAI: Uint8Array
  let mimeTypeForAI: 'image/webp' | 'image/jpeg' | 'image/png'

  try {
    const formData = await request.formData()
    const file = formData.get('image')
    if (!(file instanceof Blob)) {
      return NextResponse.json({ error: 'Imagen requerida' }, { status: 400 })
    }
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'La imagen no puede superar los 10 MB' }, { status: 413 })
    }
    const buffer = await file.arrayBuffer()
    imageBytes = new Uint8Array(buffer)
    mimeType =
      file.type === 'image/png'
        ? 'image/png'
        : file.type === 'image/webp'
          ? 'image/webp'
          : 'image/jpeg'

    // image_original is the unprocessed photo sent alongside the white-bg version.
    // Use it for AI so Claude sees the real colors, not the composited result.
    const fileOriginal = formData.get('image_original')
    if (fileOriginal instanceof Blob) {
      const bufferOrig = await fileOriginal.arrayBuffer()
      imageBytesForAI = new Uint8Array(bufferOrig)
      mimeTypeForAI =
        fileOriginal.type === 'image/png'
          ? 'image/png'
          : fileOriginal.type === 'image/webp'
            ? 'image/webp'
            : 'image/jpeg'
    } else {
      imageBytesForAI = imageBytes
      mimeTypeForAI = mimeType
    }
  } catch {
    return NextResponse.json({ error: 'Error al leer la imagen' }, { status: 400 })
  }

  // Upload to Supabase Storage (always the processed/composited image)
  const uuid = crypto.randomUUID()
  const extension = mimeType === 'image/webp' ? 'webp' : mimeType === 'image/png' ? 'png' : 'jpg'
  const fotoPath = `${user.id}/${uuid}.${extension}`

  const { error: uploadError } = await supabase.storage
    .from('prendas-fotos')
    .upload(fotoPath, imageBytes, { contentType: mimeType, upsert: false })

  if (uploadError) {
    return NextResponse.json({ error: 'Error al subir la foto' }, { status: 500 })
  }

  // Response type allows null for fields the AI may fail to classify
  type ApiTags = {
    categoria: Tags['categoria'] | null
    tipo: string | null
    color_principal: Tags['color_principal'] | null
    color_secundario: Tags['color_secundario'] | null
    estilo: Tags['estilo'] | null
    estampado: boolean
    temporada: Tags['temporada']
  }

  // Call Claude Haiku for auto-tagging (uses original photo bytes for faithful colors)
  let tags: ApiTags | null = null

  try {
    const base64 = Buffer.from(imageBytesForAI).toString('base64')

    const prompt = `Analiza esta imagen de una prenda de ropa. Clasifícala usando ÚNICAMENTE los valores exactos de las listas que se muestran abajo.

REGLAS OBLIGATORIAS:
- Usa solo los valores de las listas, en minúsculas, exactamente como aparecen
- No inventes valores nuevos ni uses inglés
- Si no hay match perfecto, elige el valor más cercano de la lista
- Responde SOLO con JSON válido, sin markdown, sin texto extra, sin comillas extra

${promptTaxonomia()}

Lista completa de tipos válidos: ${TODOS_LOS_TIPOS_VALORES.join(', ')}

Responde con este JSON exacto:
{"categoria":"<valor>","tipo":"<valor>","color_principal":"<valor>","color_secundario":"<valor o null>","estilo":"<valor>","estampado":<true|false>,"temporada":"<valor>"}`

    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mimeTypeForAI, data: base64 },
            },
            { type: 'text', text: prompt },
          ],
        },
      ],
    })

    const text = extractText(message.content)
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>
      const normalized = normalizarRespuesta(parsed)
      const result = TagsSchema.safeParse(normalized)

      if (result.success) {
        const tipo = TODOS_LOS_TIPOS_VALORES.includes(result.data.tipo) ? result.data.tipo : null
        tags = {
          ...result.data,
          tipo,
          color_secundario: result.data.color_secundario ?? null,
        }
      } else {
        // Partial recovery: null for fields the AI got wrong — no fake pre-selections
        const issues = new Set(result.error.issues.map((i) => String(i.path[0])))
        const cat = normalized.categoria as Tags['categoria']
        const cp = normalized.color_principal as Tags['color_principal']
        const est = normalized.estilo as Tags['estilo']
        const tmp = normalized.temporada as Tags['temporada']
        tags = {
          categoria: issues.has('categoria') ? null : cat,
          tipo: TODOS_LOS_TIPOS_VALORES.includes(normalized.tipo as string)
            ? (normalized.tipo as string)
            : null,
          color_principal: issues.has('color_principal') ? null : cp,
          color_secundario: null,
          estilo: issues.has('estilo') ? null : est,
          estampado: typeof normalized.estampado === 'boolean' ? normalized.estampado : false,
          temporada: issues.has('temporada') ? 'todo_el_año' : tmp,
        }
      }
    }
  } catch {
    // AI failure is non-blocking — form shows empty for manual tagging
  }

  return NextResponse.json({ foto_path: fotoPath, tags })
}
