'use client'

import { useState } from 'react'
import { X, Pencil, Sparkles, ArrowLeft, Check } from 'lucide-react'
import { OutfitCollage } from './OutfitCollage'
import { saveConjunto, updateConjunto } from '@/app/closet/actions'
import { CATEGORIAS, COLORES, CATEGORIA_LABELS, colorBgStyle } from '@/lib/taxonomia'
import { CATEGORIA_ICONS } from '@/lib/icons'
import {
  OCASION_LABELS,
  OCASION_EMOJI,
  NIVEL_CLIMA_LABELS,
  NIVEL_CLIMA_EMOJI,
} from '@/lib/recomendador'
import type { Ocasion, NivelClima } from '@/lib/recomendador'
import type { PrendaConUrl, Conjunto } from '@/types'
import type { Categoria, Color } from '@/lib/taxonomia'

const OCASIONES: Ocasion[] = ['casual', 'trabajo', 'formal', 'noche', 'deporte']
const CLIMAS: NivelClima[] = ['calor', 'templado', 'frio']

function avisosConjunto(prendas: PrendaConUrl[], clima: NivelClima | ''): string[] {
  const avisos: string[] = []
  const cats = prendas.map((p) => p.categoria)
  const tieneCuerpo = cats.includes('cuerpo_completo')
  const tieneSuperior = cats.includes('superior')
  const tieneInferior = cats.includes('inferior')
  const tieneCalzado = cats.includes('calzado')
  const tieneAbrigo = cats.includes('abrigo')
  const numAccesorios = cats.filter((c) => c === 'accesorio').length
  const numEstampados = prendas.filter((p) => p.estampado).length

  if (tieneCuerpo && (tieneSuperior || tieneInferior)) {
    avisos.push('Estás combinando un cuerpo entero con una parte superior o inferior.')
  }
  if (!tieneCalzado) {
    avisos.push('No agregaste calzado — el look quedará incompleto.')
  }
  if (!tieneCuerpo && !tieneSuperior) {
    avisos.push('Falta una parte superior (top, blusa, polo...).')
  }
  if (!tieneCuerpo && !tieneInferior) {
    avisos.push('Falta una parte inferior (pantalón, falda...).')
  }
  if (clima === 'frio' && !tieneAbrigo) {
    avisos.push('Para frío, considera agregar un abrigo o casaca.')
  }
  if (numAccesorios > 2) {
    avisos.push(`Tienes ${numAccesorios} accesorios — 2 suele ser el máximo recomendado.`)
  }
  if (numEstampados > 1) {
    avisos.push(`Tienes ${numEstampados} prendas estampadas — pueden competir visualmente entre sí.`)
  }
  return avisos
}

interface Props {
  prendas: PrendaConUrl[]
  onClose: () => void
  onSaved: (conjunto: Conjunto) => void
  conjuntoInicial?: Conjunto
}

export function ArmarConjuntoModal({
  prendas,
  onClose,
  onSaved,
  conjuntoInicial,
}: Readonly<Props>) {
  const esEdicion = !!conjuntoInicial

  const [step, setStep] = useState<'armar' | 'guardar'>(esEdicion ? 'guardar' : 'armar')
  const [seleccionadas, setSeleccionadas] = useState<Set<string>>(
    new Set(conjuntoInicial?.prenda_ids ?? []),
  )
  const [filtroCats, setFiltroCats] = useState<Set<Categoria>>(new Set())
  const [filtroColores, setFiltroColores] = useState<Set<Color>>(new Set())
  const [nombre, setNombre] = useState(conjuntoInicial?.nombre ?? '')
  const [ocasion, setOcasion] = useState<Ocasion | ''>((conjuntoInicial?.ocasion as Ocasion) ?? '')
  const [clima, setClima] = useState<NivelClima | ''>((conjuntoInicial?.clima as NivelClima) ?? '')
  const [opinion, setOpinion] = useState<string | null>(null)
  const [loadingOpinion, setLoadingOpinion] = useState(false)
  const [errorOpinion, setErrorOpinion] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [errorSave, setErrorSave] = useState<string | null>(null)

  const prendasById = new Map(prendas.map((p) => [p.id, p]))
  const seleccionadasArr = Array.from(seleccionadas)
    .map((id) => prendasById.get(id))
    .filter((p): p is PrendaConUrl => p != null)

  const filtradas = prendas.filter((p) => {
    if (filtroCats.size > 0 && !filtroCats.has(p.categoria)) return false
    if (filtroColores.size > 0 && !filtroColores.has(p.color_principal)) return false
    return true
  })

  const avisos = step === 'guardar' ? avisosConjunto(seleccionadasArr, clima) : []

  function toggleSeleccion(id: string) {
    setSeleccionadas((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  function removePrendaFromCollage(id: string) {
    setSeleccionadas((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }

  async function pedirOpinion() {
    setLoadingOpinion(true)
    setErrorOpinion(null)
    setOpinion(null)
    try {
      const res = await fetch('/api/opinar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prenda_ids: seleccionadasArr.map((p) => p.id),
          ocasion: ocasion || undefined,
          clima: clima || undefined,
        }),
      })
      const data = (await res.json()) as { opinion?: string; error?: string }
      if (!res.ok || !data.opinion) {
        setErrorOpinion('No se pudo obtener la opinión. Intenta de nuevo.')
      } else {
        setOpinion(data.opinion)
      }
    } catch {
      setErrorOpinion('Error de conexión.')
    } finally {
      setLoadingOpinion(false)
    }
  }

  async function handleGuardar() {
    if (seleccionadasArr.length === 0) return
    setSaving(true)
    setErrorSave(null)

    const prenda_ids = seleccionadasArr.map((p) => p.id)
    const ocasionFinal = ocasion || 'casual'
    const climaFinal = clima || null
    const nombreFinal = nombre.trim() || null

    if (esEdicion && conjuntoInicial) {
      const result = await updateConjunto(conjuntoInicial.id, {
        prenda_ids,
        ocasion: ocasionFinal,
        clima: climaFinal,
        nombre: nombreFinal,
      })
      setSaving(false)
      if (result.error ?? !result.conjunto) {
        setErrorSave(result.error ?? 'Error al guardar')
        return
      }
      onSaved(result.conjunto!)
    } else {
      const result = await saveConjunto({
        prenda_ids,
        ocasion: ocasionFinal,
        clima: climaFinal,
        justificacion: null,
        origen: 'manual',
      })
      setSaving(false)
      if (result.error ?? !result.conjunto) {
        setErrorSave(result.error ?? 'Error al guardar')
        return
      }
      onSaved(result.conjunto!)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end p-3 md:justify-center md:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={esEdicion ? 'Editar conjunto' : 'Armar conjunto'}
    >
      <div
        className="absolute inset-0 bg-foreground/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative bg-background rounded-3xl overflow-hidden w-full max-w-lg mx-auto max-h-[92dvh] flex flex-col shadow-2xl">
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full bg-border" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pb-3 shrink-0">
          <div className="flex items-center gap-2">
            {step === 'guardar' && (
              <button
                type="button"
                onClick={() => {
                  setStep('armar')
                  setOpinion(null)
                  setErrorSave(null)
                }}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-muted text-muted-foreground transition-colors"
                aria-label="Volver a selección de prendas"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <h2
              className="text-xl font-light text-foreground"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              {esEdicion
                ? 'Editar conjunto'
                : step === 'armar'
                  ? 'Armar conjunto'
                  : 'Guardar conjunto'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 shrink-0 flex items-center justify-center rounded-full hover:bg-muted text-muted-foreground transition-colors"
            aria-label="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── STEP: ARMAR ── */}
        {step === 'armar' && (
          <>
            {seleccionadasArr.length > 0 ? (
              <div className="px-5 pb-3 shrink-0">
                <div className="rounded-2xl overflow-hidden border border-border">
                  <OutfitCollage
                    prendas={seleccionadasArr}
                    onRemovePrenda={removePrendaFromCollage}
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-1.5 text-right">
                  {seleccionadasArr.length}{' '}
                  {seleccionadasArr.length === 1 ? 'prenda' : 'prendas'} · Toca × para quitar
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground px-5 pb-3 shrink-0">
                Elige las prendas que quieres incluir en tu conjunto.
              </p>
            )}

            {/* Filters */}
            <div className="px-5 pb-2 space-y-2 shrink-0">
              <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
                {CATEGORIAS.map((cat) => {
                  const active = filtroCats.has(cat)
                  const Icon = CATEGORIA_ICONS[cat]
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() =>
                        setFiltroCats((prev) => {
                          const next = new Set(prev)
                          if (next.has(cat)) {
                            next.delete(cat)
                          } else {
                            next.add(cat)
                          }
                          return next
                        })
                      }
                      className={[
                        'shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all',
                        active
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-card border-border text-foreground/70 hover:border-primary/40',
                      ].join(' ')}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      {CATEGORIA_LABELS[cat]}
                    </button>
                  )
                })}
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
                {COLORES.map((color) => {
                  const active = filtroColores.has(color)
                  return (
                    <button
                      key={color}
                      type="button"
                      onClick={() =>
                        setFiltroColores((prev) => {
                          const next = new Set(prev)
                          if (next.has(color)) {
                            next.delete(color)
                          } else {
                            next.add(color)
                          }
                          return next
                        })
                      }
                      title={color}
                      className={[
                        'shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all',
                        active
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-card border-border text-foreground/70 hover:border-primary/40',
                      ].join(' ')}
                    >
                      <span
                        className="w-3 h-3 rounded-full border border-black/10 shrink-0"
                        style={colorBgStyle(color)}
                      />
                      <span className="capitalize">{color}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Prendas grid */}
            <div className="flex-1 overflow-y-auto px-5 pb-4">
              {filtradas.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Sin prendas que coincidan con los filtros.
                </p>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5">
                  {filtradas.map((p) => {
                    const selected = seleccionadas.has(p.id)
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => toggleSeleccion(p.id)}
                        aria-pressed={selected}
                        aria-label={`${selected ? 'Quitar' : 'Agregar'} ${p.tipo}`}
                        className={[
                          'relative flex flex-col rounded-2xl overflow-hidden border bg-card transition-all duration-150 active:scale-[0.97] text-left',
                          selected
                            ? 'border-primary ring-2 ring-primary/40 shadow-md'
                            : 'border-border hover:border-primary/30',
                        ].join(' ')}
                      >
                        <div className="aspect-square w-full overflow-hidden bg-muted relative">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={p.signedUrl}
                            alt={p.tipo}
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                          {selected && (
                            <div className="absolute inset-0 bg-primary/15 flex items-center justify-center">
                              <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center shadow-lg">
                                <Check className="w-4 h-4 text-primary-foreground" />
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="px-2.5 py-2">
                          <p className="text-xs font-semibold text-foreground capitalize leading-tight truncate">
                            {p.tipo.replaceAll('_', ' ')}
                          </p>
                          <div className="flex items-center gap-1 mt-0.5">
                            <span
                              className="w-2.5 h-2.5 rounded-full border border-black/10 shrink-0"
                              style={colorBgStyle(p.color_principal)}
                            />
                            <span className="text-xs text-muted-foreground capitalize truncate">
                              {p.color_principal}
                            </span>
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Continuar */}
            {seleccionadasArr.length >= 1 && (
              <div className="shrink-0 px-5 py-4 border-t border-border bg-background/95 backdrop-blur-sm">
                <button
                  type="button"
                  onClick={() => setStep('guardar')}
                  className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-all active:scale-[0.98] shadow-sm"
                >
                  Continuar con {seleccionadasArr.length}{' '}
                  {seleccionadasArr.length === 1 ? 'prenda' : 'prendas'} →
                </button>
              </div>
            )}
          </>
        )}

        {/* ── STEP: GUARDAR ── */}
        {step === 'guardar' && (
          <div className="flex-1 overflow-y-auto px-5 pb-6 space-y-4">
            {seleccionadasArr.length > 0 ? (
              <div className="rounded-2xl overflow-hidden border border-border">
                <OutfitCollage
                  prendas={seleccionadasArr}
                  onRemovePrenda={removePrendaFromCollage}
                />
              </div>
            ) : (
              <div className="py-6 text-center space-y-3">
                <p className="text-sm text-muted-foreground">No hay prendas seleccionadas.</p>
                <button
                  type="button"
                  onClick={() => setStep('armar')}
                  className="text-sm text-primary hover:underline"
                >
                  Volver a elegir prendas
                </button>
              </div>
            )}

            {/* Avisos suaves */}
            {avisos.length > 0 && (
              <div className="space-y-1.5">
                {avisos.map((aviso, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-2 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-xl px-3 py-2"
                  >
                    <span className="text-amber-500 mt-0.5 shrink-0 text-xs leading-none">⚠</span>
                    <p className="text-xs text-amber-700 dark:text-amber-400 leading-snug">
                      {aviso}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {/* Nombre */}
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1.5">
                Nombre (opcional)
              </label>
              <div className="relative">
                <Pencil className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                <input
                  type="text"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder={`Mi conjunto ${new Date().toLocaleDateString('es-PE', { day: 'numeric', month: 'short' })}`}
                  maxLength={60}
                  className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-border bg-muted/30 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>
            </div>

            {/* Ocasión */}
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1.5">
                Ocasión (opcional)
              </label>
              <div className="flex flex-wrap gap-2">
                {OCASIONES.map((oc) => (
                  <button
                    key={oc}
                    type="button"
                    onClick={() => setOcasion((prev) => (prev === oc ? '' : oc))}
                    className={[
                      'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all',
                      ocasion === oc
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-card border-border text-foreground/70 hover:border-primary/40',
                    ].join(' ')}
                  >
                    {OCASION_EMOJI[oc]} {OCASION_LABELS[oc]}
                  </button>
                ))}
              </div>
            </div>

            {/* Clima */}
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1.5">
                Clima (opcional)
              </label>
              <div className="flex flex-wrap gap-2">
                {CLIMAS.map((cl) => (
                  <button
                    key={cl}
                    type="button"
                    onClick={() => {
                      setClima((prev) => (prev === cl ? '' : cl))
                      setOpinion(null)
                    }}
                    className={[
                      'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all',
                      clima === cl
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-card border-border text-foreground/70 hover:border-primary/40',
                    ].join(' ')}
                  >
                    {NIVEL_CLIMA_EMOJI[cl]} {NIVEL_CLIMA_LABELS[cl]}
                  </button>
                ))}
              </div>
            </div>

            {/* ¿Qué opinas? */}
            {seleccionadasArr.length >= 1 && (
              <div className="border border-dashed border-primary/30 rounded-2xl p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">¿Qué opinas?</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      La IA analiza tu conjunto y da su punto de vista.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={pedirOpinion}
                    disabled={loadingOpinion}
                    className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary/10 text-primary text-xs font-medium hover:bg-primary/15 transition-all disabled:opacity-50"
                  >
                    {loadingOpinion ? (
                      <span className="w-3.5 h-3.5 border-2 border-primary/30 border-t-primary rounded-full animate-spin inline-block" />
                    ) : (
                      <Sparkles className="w-3.5 h-3.5" />
                    )}
                    {loadingOpinion ? 'Analizando...' : 'Pedir opinión'}
                  </button>
                </div>

                {opinion && (
                  <div className="bg-primary/5 rounded-xl p-3">
                    <p className="text-sm text-foreground italic leading-relaxed">{opinion}</p>
                  </div>
                )}

                {errorOpinion && (
                  <p className="text-xs text-destructive">{errorOpinion}</p>
                )}
              </div>
            )}

            {errorSave && (
              <p className="text-xs text-destructive bg-destructive/5 rounded-lg px-3 py-2">
                {errorSave}
              </p>
            )}

            {seleccionadasArr.length >= 1 && (
              <button
                type="button"
                onClick={handleGuardar}
                disabled={saving}
                className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-all active:scale-[0.98] shadow-sm disabled:opacity-60"
              >
                {saving ? (
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <Check className="w-4 h-4" />
                )}
                {saving ? 'Guardando...' : esEdicion ? 'Guardar cambios' : 'Guardar conjunto'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
