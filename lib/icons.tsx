import { Shirt, Layers2, PersonStanding, Layers3, Footprints, Watch } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { Categoria } from './taxonomia'

export const CATEGORIA_ICONS: Record<Categoria, LucideIcon> = {
  superior: Shirt,
  inferior: Layers2,
  cuerpo_completo: PersonStanding,
  abrigo: Layers3,
  calzado: Footprints,
  accesorio: Watch,
}
