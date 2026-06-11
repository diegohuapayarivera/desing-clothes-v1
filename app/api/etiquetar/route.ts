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
} from '@/lib/taxonomia'

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
  if (typeof out.temporada === 'string') out.temporada = out.temporada.trim().toLowerCase()

  // Normalize tipo with synonym map
  out.tipo = normalizarTipo(out.tipo as string | null | undefined) ?? ''

  // Normalize colors
  if (typeof out.color_principal === 'string')
    out.color_principal = out.color_principal.trim().toLowerCase()
  if (
    out.color_secundario == null ||
    out.color_secundario === '' ||
    out.color_secundario === 'null' ||
    out.color_secundario === 'none' ||
    out.color_secundario === 'ninguno'
  ) {
    out.color_secundario = null
  } else if (typeof out.color_secundario === 'string') {
    out.color_secundario = out.color_secundario.trim().toLowerCase()
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

  try {
    const formData = await request.formData()
    const file = formData.get('image')
    if (!(file instanceof Blob)) {
      return NextResponse.json({ error: 'Imagen requerida' }, { status: 400 })
    }
    const buffer = await file.arrayBuffer()
    imageBytes = new Uint8Array(buffer)
    mimeType =
      file.type === 'image/png'
        ? 'image/png'
        : file.type === 'image/webp'
          ? 'image/webp'
          : 'image/jpeg'
  } catch {
    return NextResponse.json({ error: 'Error al leer la imagen' }, { status: 400 })
  }

  // Upload to Supabase Storage
  const uuid = crypto.randomUUID()
  const extension = mimeType === 'image/webp' ? 'webp' : mimeType === 'image/png' ? 'png' : 'jpg'
  const fotoPath = `${user.id}/${uuid}.${extension}`

  const { error: uploadError } = await supabase.storage
    .from('prendas-fotos')
    .upload(fotoPath, imageBytes, { contentType: mimeType, upsert: false })

  if (uploadError) {
    return NextResponse.json({ error: 'Error al subir la foto' }, { status: 500 })
  }

  // Call Claude Haiku for auto-tagging
  let tags: Tags | null = null

  try {
    const base64 = Buffer.from(imageBytes).toString('base64')

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
              source: { type: 'base64', media_type: mimeType, data: base64 },
            },
            { type: 'text', text: prompt },
          ],
        },
      ],
    })

    const text = message.content[0].type === 'text' ? message.content[0].text.trim() : ''
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>
      const normalized = normalizarRespuesta(parsed)
      const result = TagsSchema.safeParse(normalized)

      if (result.success) {
        // Ensure tipo is in taxonomy even after Zod passes
        if (!TODOS_LOS_TIPOS_VALORES.includes(result.data.tipo)) {
          tags = { ...result.data, tipo: '' } // blank → user picks manually
        } else {
          tags = result.data
        }
      } else {
        // Partial recovery: use normalized value where valid, null elsewhere
        const issues = new Set(result.error.issues.map((i) => String(i.path[0])))
        tags = {
          categoria: issues.has('categoria') ? 'superior' : (normalized.categoria as Tags['categoria']),
          tipo: TODOS_LOS_TIPOS_VALORES.includes(normalized.tipo as string)
            ? (normalized.tipo as string)
            : '',
          color_principal: issues.has('color_principal')
            ? 'negro'
            : (normalized.color_principal as Tags['color_principal']),
          color_secundario: null,
          estilo: issues.has('estilo') ? 'casual' : (normalized.estilo as Tags['estilo']),
          estampado: typeof normalized.estampado === 'boolean' ? normalized.estampado : false,
          temporada: issues.has('temporada')
            ? 'todo_el_año'
            : (normalized.temporada as Tags['temporada']),
        }
      }
    }
  } catch {
    // AI failure is non-blocking — form shows empty for manual tagging
  }

  // Return empty string tipo as null so the form shows no pre-selection
  if (tags && tags.tipo === '') {
    tags = { ...tags, tipo: null as unknown as string }
  }

  return NextResponse.json({ foto_path: fotoPath, tags })
}
