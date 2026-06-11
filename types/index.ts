export type PreferenciaPrendas = 'hombre' | 'mujer' | 'ambas'

export interface Profile {
  id: string
  nombre: string | null
  preferencia_prendas: PreferenciaPrendas | null
  ciudad: string | null
  onboarding_completado: boolean
  created_at: string
}
