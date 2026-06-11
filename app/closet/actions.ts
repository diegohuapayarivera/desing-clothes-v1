'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { CATEGORIAS, COLORES, ESTILOS, TEMPORADAS, TODOS_LOS_TIPOS_VALORES } from '@/lib/taxonomia'

// ── Conjuntos ──────────────────────────────────────────────────────────────

export async function saveConjunto(data: {
  prenda_ids: string[]
  ocasion: string
  clima: string | null
  justificacion: string | null
}): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autorizado' }
  const { error } = await supabase.from('conjuntos').insert({
    user_id: user.id,
    prenda_ids: data.prenda_ids,
    ocasion: data.ocasion,
    clima: data.clima,
    justificacion: data.justificacion,
    origen: 'ia',
  })
  if (error) return { error: 'Error al guardar el conjunto' }
  revalidatePath('/')
  return {}
}

export async function renameConjunto(id: string, nombre: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autorizado' }
  const { error } = await supabase
    .from('conjuntos')
    .update({ nombre: nombre.trim() || null })
    .eq('id', id)
    .eq('user_id', user.id)
  if (error) return { error: 'Error al renombrar' }
  return {}
}

export async function deleteConjunto(id: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'No autorizado' }
  const { error } = await supabase
    .from('conjuntos')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)
  if (error) return { error: 'Error al eliminar' }
  return {}
}

// ── Feedback ───────────────────────────────────────────────────────────────

export async function saveFeedback(data: {
  prenda_ids: string[]
  ocasion: string | null
  clima: string | null
  accion: 'descartado' | 'regenerado'
}): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  await supabase.from('feedback_outfits').insert({
    user_id: user.id,
    prenda_ids: data.prenda_ids,
    ocasion: data.ocasion,
    clima: data.clima,
    accion: data.accion,
  })
}

// ── Storage cleanup ────────────────────────────────────────────────────────

export async function deleteFotoHuerfana(foto_path: string): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  // Only allow deleting from the user's own folder
  if (!foto_path.startsWith(`${user.id}/`)) return
  await supabase.storage.from('prendas-fotos').remove([foto_path])
}

// ── Geo ────────────────────────────────────────────────────────────────────

export async function saveGeoLocation(lat: number, lon: number): Promise<void> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return
  await supabase.from('profiles').update({ lat, lon }).eq('id', user.id)
}

const TIPOS_VALIDOS = TODOS_LOS_TIPOS_VALORES as [string, ...string[]]

const PrendaSchema = z.object({
  foto_path: z.string().min(1),
  categoria: z.enum(CATEGORIAS),
  tipo: z.enum(TIPOS_VALIDOS),
  color_principal: z.enum(COLORES),
  color_secundario: z.enum(COLORES).nullable().optional(),
  estilo: z.enum(ESTILOS),
  estampado: z.boolean(),
  temporada: z.enum(TEMPORADAS),
})

const TagsSchema = PrendaSchema.omit({ foto_path: true })

export async function savePrenda(formData: FormData): Promise<{ error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'No autorizado' }

  const raw = {
    foto_path: formData.get('foto_path'),
    categoria: formData.get('categoria'),
    tipo: formData.get('tipo'),
    color_principal: formData.get('color_principal'),
    color_secundario: formData.get('color_secundario') || null,
    estilo: formData.get('estilo'),
    estampado: formData.get('estampado') === 'true',
    temporada: formData.get('temporada'),
  }

  const result = PrendaSchema.safeParse(raw)
  if (!result.success) {
    return { error: 'Datos inválidos' }
  }

  const { error } = await supabase
    .from('prendas')
    .insert({ ...result.data, user_id: user.id })

  if (error) return { error: 'Error al guardar la prenda' }

  revalidatePath('/')
  return {}
}

export async function countConjuntosForPrenda(id: string): Promise<number> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return 0
  const { count } = await supabase
    .from('conjuntos')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .contains('prenda_ids', [id])
  return count ?? 0
}

export async function deletePrenda(id: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'No autorizado' }

  // Fetch the foto_path first (RLS ensures it's the user's own)
  const { data: prenda, error: fetchError } = await supabase
    .from('prendas')
    .select('foto_path')
    .eq('id', id)
    .single()

  if (fetchError || !prenda) return { error: 'Prenda no encontrada' }

  // Delete conjuntos that contain this prenda
  await supabase
    .from('conjuntos')
    .delete()
    .eq('user_id', user.id)
    .contains('prenda_ids', [id])

  // Delete DB record (RLS checks ownership)
  const { error: dbError } = await supabase.from('prendas').delete().eq('id', id)
  if (dbError) return { error: 'Error al eliminar' }

  // Delete from Storage (non-blocking — ignore storage error)
  await supabase.storage.from('prendas-fotos').remove([prenda.foto_path])

  revalidatePath('/')
  return {}
}

export async function updatePrendaTags(
  id: string,
  formData: FormData,
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'No autorizado' }

  const raw = {
    categoria: formData.get('categoria'),
    tipo: formData.get('tipo'),
    color_principal: formData.get('color_principal'),
    color_secundario: formData.get('color_secundario') || null,
    estilo: formData.get('estilo'),
    estampado: formData.get('estampado') === 'true',
    temporada: formData.get('temporada'),
  }

  const result = TagsSchema.safeParse(raw)
  if (!result.success) return { error: 'Datos inválidos' }

  const { error } = await supabase
    .from('prendas')
    .update(result.data)
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return { error: 'Error al actualizar' }

  revalidatePath('/')
  return {}
}
