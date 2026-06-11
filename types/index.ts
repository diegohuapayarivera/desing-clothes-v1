import type { Categoria, Color, Estilo, Temporada } from '@/lib/taxonomia'

export type PreferenciaPrendas = 'hombre' | 'mujer' | 'ambas'

export interface Profile {
  id: string
  nombre: string | null
  preferencia_prendas: PreferenciaPrendas | null
  ciudad: string | null
  onboarding_completado: boolean
  created_at: string
}

export interface Prenda {
  id: string
  user_id: string
  foto_path: string
  categoria: Categoria
  tipo: string
  color_principal: Color
  color_secundario: Color | null
  estilo: Estilo
  estampado: boolean
  temporada: Temporada
  created_at: string
}

export type PrendaConUrl = Prenda & { signedUrl: string }

export interface TagsIA {
  categoria: Categoria
  tipo: string
  color_principal: Color
  color_secundario: Color | null
  estilo: Estilo
  estampado: boolean
  temporada: Temporada
}
