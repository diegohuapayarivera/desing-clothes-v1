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

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

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
  let tags: z.infer<typeof TagsSchema> | null = null

  try {
    const base64 = Buffer.from(imageBytes).toString('base64')
    const prompt = `Analiza esta imagen de una prenda de ropa y clasifícala usando EXACTAMENTE los valores de esta taxonomía:

${promptTaxonomia()}

Responde ÚNICAMENTE con un objeto JSON válido, sin explicaciones, sin markdown, sin comillas extra:
{
  "categoria": "<valor exacto de CATEGORÍAS>",
  "tipo": "<valor exacto de TIPOS>",
  "color_principal": "<valor exacto de COLORES>",
  "color_secundario": "<valor exacto de COLORES o null si no hay color secundario relevante>",
  "estilo": "<valor exacto de ESTILOS>",
  "estampado": <true si tiene estampado/patrón, false si es liso>,
  "temporada": "<valor exacto de TEMPORADAS>"
}

Tipos válidos: ${TODOS_LOS_TIPOS_VALORES.join(', ')}`

    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
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
      const parsed = JSON.parse(jsonMatch[0])
      // Normalize color_secundario: empty string → null
      if (parsed.color_secundario === '' || parsed.color_secundario === 'null') {
        parsed.color_secundario = null
      }
      const result = TagsSchema.safeParse(parsed)
      if (result.success) {
        tags = result.data
      } else {
        // Partial recovery: keep valid fields, null-out invalid ones
        tags = {
          categoria: result.error.issues.some((i) => i.path[0] === 'categoria')
            ? 'superior'
            : (parsed.categoria as z.infer<typeof TagsSchema>['categoria']),
          tipo: parsed.tipo ?? '',
          color_principal: result.error.issues.some((i) => i.path[0] === 'color_principal')
            ? 'negro'
            : (parsed.color_principal as z.infer<typeof TagsSchema>['color_principal']),
          color_secundario: null,
          estilo: result.error.issues.some((i) => i.path[0] === 'estilo')
            ? 'casual'
            : (parsed.estilo as z.infer<typeof TagsSchema>['estilo']),
          estampado: typeof parsed.estampado === 'boolean' ? parsed.estampado : false,
          temporada: result.error.issues.some((i) => i.path[0] === 'temporada')
            ? 'todo_el_año'
            : (parsed.temporada as z.infer<typeof TagsSchema>['temporada']),
        }
      }
    }
  } catch {
    // AI failure is non-blocking — form will be empty for manual tagging
  }

  return NextResponse.json({ foto_path: fotoPath, tags })
}
