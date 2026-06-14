import type { Categoria, Color, Estilo, Temporada } from '@/lib/taxonomia'

export type PreferenciaPrendas = 'hombre' | 'mujer' | 'ambas'

export interface Profile {
  id: string
  nombre: string | null
  preferencia_prendas: PreferenciaPrendas | null
  ciudad: string | null
  lat: number | null
  lon: number | null
  onboarding_completado: boolean
  created_at: string
}

export interface Outfit {
  prenda_ids: string[]
  justificacion: string
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
  fondo_recortado: boolean
  created_at: string
}

export type PrendaConUrl = Prenda & { signedUrl: string }

export interface Conjunto {
  id: string
  user_id: string
  prenda_ids: string[]
  ocasion: string
  clima: string | null
  justificacion: string | null
  nombre: string | null
  origen: 'ia' | 'manual'
  created_at: string
}

export type MotivoFeedback = 'colores' | 'muy_formal' | 'muy_informal' | 'muy_simple' | 'prenda_puntual'

export interface FeedbackOutfit {
  id: string
  user_id: string
  prenda_ids: string[]
  ocasion: string | null
  clima: string | null
  accion: 'descartado' | 'regenerado'
  motivo: MotivoFeedback | null
  created_at: string
}

export interface OutfitUsado {
  id: string
  user_id: string
  prenda_ids: string[]
  conjunto_id: string | null
  fecha: string            // 'YYYY-MM-DD'
  ocasion: string | null
  estado: 'planeado' | 'usado'
  created_at: string
}

export interface TagsIA {
  categoria: Categoria | null
  tipo: string | null
  color_principal: Color | null
  color_secundario: Color | null
  estilo: Estilo | null
  estampado: boolean
  temporada: Temporada
}
