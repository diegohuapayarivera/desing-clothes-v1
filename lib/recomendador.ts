import type { PrendaConUrl } from '@/types'
import type { Estilo } from '@/lib/taxonomia'

export type Ocasion = 'trabajo' | 'casual' | 'noche' | 'formal' | 'deporte'
export type NivelClima = 'frio' | 'templado' | 'calor'

export const OCASION_LABELS: Record<Ocasion, string> = {
  trabajo: 'Trabajo / Estudio',
  casual: 'Casual / Diario',
  noche: 'Salida de noche',
  formal: 'Evento formal',
  deporte: 'Deporte',
}

export const OCASION_EMOJI: Record<Ocasion, string> = {
  trabajo: '💼',
  casual: '☀️',
  noche: '🌙',
  formal: '✨',
  deporte: '🏃',
}

export const NIVEL_CLIMA_LABELS: Record<NivelClima, string> = {
  frio: 'Frío',
  templado: 'Templado',
  calor: 'Calor',
}

export const NIVEL_CLIMA_EMOJI: Record<NivelClima, string> = {
  frio: '🧥',
  templado: '🌤',
  calor: '☀️',
}

const ESTILOS_POR_OCASION: Record<Ocasion, Estilo[]> = {
  trabajo: ['casual', 'formal'],
  casual: ['casual'],
  noche: ['elegante', 'casual'],
  formal: ['formal', 'elegante'],
  deporte: ['deportivo'],
}

const TIPOS_EXCLUIDOS_FRIO = new Set(['short', 'sandalias', 'top', 'flats'])

// Abrigo types (excluding blazer which can be worn formally even in heat)
const TIPOS_ABRIGO = new Set(['casaca', 'chompa', 'cardigan', 'blazer', 'abrigo', 'hoodie'])
const TIPOS_ABRIGO_SIN_BLAZER = new Set(['casaca', 'chompa', 'cardigan', 'abrigo', 'hoodie'])

function tiposExcluidosPorClima(clima: NivelClima, ocasion: Ocasion): Set<string> {
  if (clima === 'frio') return TIPOS_EXCLUIDOS_FRIO
  if (clima === 'calor') {
    // blazer allowed in formal/noche
    if (ocasion === 'formal' || ocasion === 'noche') return TIPOS_ABRIGO_SIN_BLAZER
    return TIPOS_ABRIGO
  }
  return new Set()
}

export interface FiltroCandidatasResult {
  candidatas: PrendaConUrl[]
  error?: string
}

export function filtrarCandidatas(
  prendas: PrendaConUrl[],
  ocasion: Ocasion,
  clima: NivelClima,
): FiltroCandidatasResult {
  const estilosValidos = new Set<string>(ESTILOS_POR_OCASION[ocasion])
  const tiposExcluidos = tiposExcluidosPorClima(clima, ocasion)

  const candidatas = prendas.filter((p) => {
    if (!estilosValidos.has(p.estilo)) return false
    if (tiposExcluidos.has(p.tipo)) return false
    if (clima === 'frio' && p.temporada === 'verano') return false
    if (clima === 'calor' && p.temporada === 'invierno') return false
    return true
  })

  const tieneCalzado = candidatas.some((p) => p.categoria === 'calzado')
  const tieneSuperior = candidatas.some((p) => p.categoria === 'superior')
  const tieneCuerpo = candidatas.some((p) => p.categoria === 'cuerpo_completo')
  const tieneInferior = candidatas.some((p) => p.categoria === 'inferior')
  const tieneAbrigo = candidatas.some((p) => p.categoria === 'abrigo')

  if (!tieneCalzado) {
    return {
      candidatas: [],
      error:
        'No tienes calzado disponible para esta combinación — agrega zapatillas, sandalias u otro calzado, o cambia los filtros.',
    }
  }

  if (!tieneSuperior && !tieneCuerpo) {
    return {
      candidatas: [],
      error:
        'No tienes tops, polos, blusas ni cuerpos enteros para esta ocasión — agrega alguno o cambia los filtros.',
    }
  }

  if (!tieneCuerpo && !tieneInferior) {
    return {
      candidatas: [],
      error:
        'No tienes pantalones, faldas ni jeans para armar un conjunto — agrega alguno o cambia los filtros.',
    }
  }

  if (clima === 'frio' && !tieneAbrigo) {
    return {
      candidatas: [],
      error:
        'Hace frío pero no tienes abrigos, casacas ni chompas — agrega uno o cambia el clima a templado.',
    }
  }

  return { candidatas }
}

export interface ValidarFijasResult {
  ok: boolean
  error?: string
}

export function validarCompatibilidadFijas(
  fijas: { categoria: string }[],
): ValidarFijasResult {
  const cats = fijas.map((f) => f.categoria)
  const tieneCuerpo = cats.includes('cuerpo_completo')
  if (tieneCuerpo && (cats.includes('superior') || cats.includes('inferior'))) {
    return { ok: false, error: 'No puedes fijar un cuerpo entero junto con un top o pantalón.' }
  }
  const nonAcc = cats.filter((c) => c !== 'accesorio')
  if (new Set(nonAcc).size < nonAcc.length) {
    return { ok: false, error: 'No puedes fijar dos prendas del mismo tipo.' }
  }
  return { ok: true }
}
