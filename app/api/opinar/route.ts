import { NextResponse, type NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { extractText } from '@/lib/anthropic'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const RequestSchema = z.object({
  prenda_ids: z.array(z.string()).min(1).max(20),
  ocasion: z.string().optional(),
  clima: z.string().optional(),
})

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const parsed = RequestSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })

  const { prenda_ids, ocasion, clima } = parsed.data

  const { data: prendas, error: fetchError } = await supabase
    .from('prendas')
    .select('id, tipo, categoria, color_principal, color_secundario, estilo, estampado')
    .eq('user_id', user.id)
    .in('id', prenda_ids)

  if (fetchError || !prendas || prendas.length !== prenda_ids.length) {
    return NextResponse.json({ error: 'Prendas inválidas' }, { status: 400 })
  }

  type PrendaRow = {
    id: string
    tipo: string
    categoria: string
    color_principal: string
    color_secundario: string | null
    estilo: string
    estampado: boolean
  }

  const desc = (prendas as PrendaRow[])
    .map((p) => {
      const parts = [p.tipo, `color ${p.color_principal}`]
      if (p.color_secundario) parts.push(`y ${p.color_secundario}`)
      parts.push(`estilo ${p.estilo}`)
      if (p.estampado) parts.push('con estampado')
      return `- ${parts.join(', ')}`
    })
    .join('\n')

  const contexto = [ocasion && `Ocasión: ${ocasion}`, clima && `Clima: ${clima}`]
    .filter(Boolean)
    .join('\n')

  const prompt = `Eres una asesora de moda amigable y directa. Analiza este conjunto y da una opinión en 2-3 frases en español:

Prendas:
${desc}${contexto ? `\n\n${contexto}` : ''}

Comenta si las prendas combinan bien, si los colores armonizan y una sugerencia constructiva si aplica. Sé cálida y concisa. Solo la opinión, sin introducción.`

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 200,
      messages: [{ role: 'user', content: prompt }],
    })
    const opinion = extractText(message.content)
    if (!opinion) return NextResponse.json({ error: 'Sin respuesta' }, { status: 502 })
    return NextResponse.json({ opinion })
  } catch (err) {
    console.error('[opinar] Claude falló:', err)
    return NextResponse.json({ error: 'Error al generar opinión' }, { status: 502 })
  }
}
