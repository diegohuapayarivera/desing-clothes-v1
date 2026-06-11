import type { PreferenciaPrendas } from '@/types'

// ─── Enums ────────────────────────────────────────────────────────────────────

export const CATEGORIAS = [
  'superior',
  'inferior',
  'cuerpo_completo',
  'abrigo',
  'calzado',
  'accesorio',
] as const

export const ESTILOS = ['casual', 'formal', 'deportivo', 'elegante'] as const

export const TEMPORADAS = ['verano', 'invierno', 'todo_el_año'] as const

export const COLORES = [
  'negro',
  'blanco',
  'gris',
  'beige',
  'marrón',
  'azul marino',
  'celeste',
  'rojo',
  'vino',
  'rosado',
  'naranja',
  'amarillo',
  'verde',
  'verde oliva',
  'morado',
  'multicolor',
] as const

export type Categoria = (typeof CATEGORIAS)[number]
export type Estilo = (typeof ESTILOS)[number]
export type Temporada = (typeof TEMPORADAS)[number]
export type Color = (typeof COLORES)[number]

// ─── Tipo de prenda ───────────────────────────────────────────────────────────

interface TipoEntry {
  valor: string
  label: string
  genero: 'hombre' | 'mujer' | 'ambas'
  categoria: Categoria
}

export const TODOS_LOS_TIPOS: TipoEntry[] = [
  // Superior
  { valor: 'polo', label: 'Polo', genero: 'hombre', categoria: 'superior' },
  { valor: 'camisa', label: 'Camisa', genero: 'hombre', categoria: 'superior' },
  { valor: 'blusa', label: 'Blusa', genero: 'mujer', categoria: 'superior' },
  { valor: 'top', label: 'Top', genero: 'mujer', categoria: 'superior' },
  { valor: 'camiseta', label: 'Camiseta', genero: 'ambas', categoria: 'superior' },
  { valor: 'camisa_oxford', label: 'Camisa oxford', genero: 'ambas', categoria: 'superior' },
  // Inferior
  { valor: 'pantalon', label: 'Pantalón', genero: 'hombre', categoria: 'inferior' },
  { valor: 'jean', label: 'Jean', genero: 'ambas', categoria: 'inferior' },
  { valor: 'short_hombre', label: 'Short', genero: 'hombre', categoria: 'inferior' },
  { valor: 'falda', label: 'Falda', genero: 'mujer', categoria: 'inferior' },
  { valor: 'short_mujer', label: 'Short', genero: 'mujer', categoria: 'inferior' },
  { valor: 'leggings', label: 'Leggings', genero: 'mujer', categoria: 'inferior' },
  // Cuerpo completo
  { valor: 'vestido', label: 'Vestido', genero: 'mujer', categoria: 'cuerpo_completo' },
  { valor: 'enterizo', label: 'Enterizo', genero: 'mujer', categoria: 'cuerpo_completo' },
  { valor: 'terno', label: 'Terno', genero: 'hombre', categoria: 'cuerpo_completo' },
  { valor: 'jumpsuit', label: 'Jumpsuit', genero: 'ambas', categoria: 'cuerpo_completo' },
  // Abrigo
  { valor: 'casaca', label: 'Casaca', genero: 'ambas', categoria: 'abrigo' },
  { valor: 'chompa', label: 'Chompa', genero: 'ambas', categoria: 'abrigo' },
  { valor: 'cardigan', label: 'Cardigan', genero: 'ambas', categoria: 'abrigo' },
  { valor: 'blazer', label: 'Blazer', genero: 'ambas', categoria: 'abrigo' },
  { valor: 'abrigo', label: 'Abrigo', genero: 'ambas', categoria: 'abrigo' },
  { valor: 'hoodie', label: 'Hoodie', genero: 'ambas', categoria: 'abrigo' },
  // Calzado
  { valor: 'zapatillas', label: 'Zapatillas', genero: 'ambas', categoria: 'calzado' },
  { valor: 'sandalias', label: 'Sandalias', genero: 'mujer', categoria: 'calzado' },
  { valor: 'botas', label: 'Botas', genero: 'ambas', categoria: 'calzado' },
  { valor: 'tacos', label: 'Tacos', genero: 'mujer', categoria: 'calzado' },
  { valor: 'flats', label: 'Flats', genero: 'mujer', categoria: 'calzado' },
  { valor: 'zapatos_vestir', label: 'Zapatos de vestir', genero: 'hombre', categoria: 'calzado' },
  { valor: 'mocasines', label: 'Mocasines', genero: 'ambas', categoria: 'calzado' },
  // Accesorio
  { valor: 'cartera', label: 'Cartera', genero: 'mujer', categoria: 'accesorio' },
  { valor: 'correa', label: 'Correa', genero: 'ambas', categoria: 'accesorio' },
  { valor: 'gorro', label: 'Gorro', genero: 'ambas', categoria: 'accesorio' },
  { valor: 'bufanda', label: 'Bufanda', genero: 'ambas', categoria: 'accesorio' },
  { valor: 'lentes', label: 'Lentes', genero: 'ambas', categoria: 'accesorio' },
  { valor: 'corbata', label: 'Corbata', genero: 'hombre', categoria: 'accesorio' },
  { valor: 'bolso', label: 'Bolso', genero: 'ambas', categoria: 'accesorio' },
]

export function tiposPorCategoria(
  categoria: Categoria,
  preferencia: PreferenciaPrendas,
): TipoEntry[] {
  return TODOS_LOS_TIPOS.filter(
    (t) =>
      t.categoria === categoria &&
      (preferencia === 'ambas' || t.genero === 'ambas' || t.genero === preferencia),
  )
}

// ─── Labels para UI ───────────────────────────────────────────────────────────

export const CATEGORIA_LABELS: Record<Categoria, string> = {
  superior: 'Superior',
  inferior: 'Inferior',
  cuerpo_completo: 'Cuerpo completo',
  abrigo: 'Abrigo',
  calzado: 'Calzado',
  accesorio: 'Accesorio',
}

export const CATEGORIA_EMOJIS: Record<Categoria, string> = {
  superior: '👕',
  inferior: '👖',
  cuerpo_completo: '👗',
  abrigo: '🧥',
  calzado: '👟',
  accesorio: '👜',
}

export const ESTILO_LABELS: Record<Estilo, string> = {
  casual: 'Casual',
  formal: 'Formal',
  deportivo: 'Deportivo',
  elegante: 'Elegante',
}

export const TEMPORADA_LABELS: Record<Temporada, string> = {
  verano: 'Verano',
  invierno: 'Invierno',
  todo_el_año: 'Todo el año',
}

export const COLOR_HEX: Record<Color, string> = {
  negro: '#1a1a1a',
  blanco: '#f5f5f0',
  gris: '#9e9e9e',
  beige: '#d4b896',
  marrón: '#795548',
  'azul marino': '#1a237e',
  celeste: '#4fc3f7',
  rojo: '#e53935',
  vino: '#6a1b4d',
  rosado: '#f48fb1',
  naranja: '#ff7043',
  amarillo: '#fdd835',
  verde: '#43a047',
  'verde oliva': '#827717',
  morado: '#7b1fa2',
  multicolor: 'linear-gradient(135deg, #f06,#a0f,#0af)',
}

// ─── Valores para prompt de IA ─────────────────────────────────────────────────

export const TODOS_LOS_TIPOS_VALORES = TODOS_LOS_TIPOS.map((t) => t.valor)

export function promptTaxonomia(): string {
  return `CATEGORÍAS: ${CATEGORIAS.join(', ')}

TIPOS (por categoría):
${CATEGORIAS.map((c) => `  ${c}: ${TODOS_LOS_TIPOS.filter((t) => t.categoria === c).map((t) => t.valor).join(', ')}`).join('\n')}

COLORES: ${COLORES.join(', ')}

ESTILOS: ${ESTILOS.join(', ')}

TEMPORADAS: ${TEMPORADAS.join(', ')}`
}

// ─── Normalización de tipo (para respuestas de IA) ────────────────────────────

function quitarTildes(s: string): string {
  return s.normalize('NFD').replace(/\p{Diacritic}/gu, '')
}

const TIPO_SINONIMOS: Record<string, string> = {
  // Inglés → valor en taxonomía
  dress: 'vestido',
  gown: 'vestido',
  skirt: 'falda',
  pants: 'pantalon',
  trousers: 'pantalon',
  shorts: 'short_mujer',
  jacket: 'casaca',
  coat: 'abrigo',
  overcoat: 'abrigo',
  sweater: 'chompa',
  pullover: 'chompa',
  jumper: 'chompa',
  shirt: 'camisa',
  'oxford shirt': 'camisa_oxford',
  'oxford-shirt': 'camisa_oxford',
  'button-down': 'camisa',
  'button down': 'camisa',
  't-shirt': 'camiseta',
  tshirt: 'camiseta',
  tee: 'camiseta',
  blouse: 'blusa',
  top: 'top',
  suit: 'terno',
  overalls: 'enterizo',
  overall: 'enterizo',
  sneakers: 'zapatillas',
  sneaker: 'zapatillas',
  trainers: 'zapatillas',
  shoes: 'zapatos_vestir',
  heels: 'tacos',
  'high heels': 'tacos',
  boots: 'botas',
  boot: 'botas',
  sandals: 'sandalias',
  sandal: 'sandalias',
  loafers: 'mocasines',
  loafer: 'mocasines',
  bag: 'bolso',
  handbag: 'cartera',
  purse: 'cartera',
  belt: 'correa',
  hat: 'gorro',
  cap: 'gorro',
  scarf: 'bufanda',
  glasses: 'lentes',
  sunglasses: 'lentes',
  tie: 'corbata',
  necktie: 'corbata',
  // Variantes en español con tilde o espacios
  pantalon: 'pantalon',
  'zapatos de vestir': 'zapatos_vestir',
  'camisa oxford': 'camisa_oxford',
}

/** Recibe cualquier string que devuelva la IA y retorna el valor canónico de
 *  la taxonomía, o `null` si no hay match (el usuario deberá elegir manualmente). */
export function normalizarTipo(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== 'string') return null
  const limpio = raw.trim().toLowerCase()
  // 1) Match directo en minúsculas
  if (TODOS_LOS_TIPOS_VALORES.includes(limpio)) return limpio
  // 2) Match sin tildes
  const sinTildes = quitarTildes(limpio)
  const porTildes = TODOS_LOS_TIPOS_VALORES.find((v) => quitarTildes(v) === sinTildes)
  if (porTildes) return porTildes
  // 3) Sinónimos (con y sin tildes)
  return TIPO_SINONIMOS[limpio] ?? TIPO_SINONIMOS[sinTildes] ?? null
}
