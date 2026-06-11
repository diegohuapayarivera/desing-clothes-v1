'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { CATEGORIAS, COLORES, ESTILOS, TEMPORADAS, TODOS_LOS_TIPOS_VALORES } from '@/lib/taxonomia'

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

  // Delete DB record (cascade handles nothing here; RLS checks ownership)
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
