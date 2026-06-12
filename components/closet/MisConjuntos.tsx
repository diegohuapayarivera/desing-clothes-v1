'use client'

import { useState, useTransition } from 'react'
import { X, Shirt, Pencil, Trash2, Layers } from 'lucide-react'
import { OutfitCollage } from './OutfitCollage'
import { deleteConjunto, renameConjunto, registrarOutfitUsado } from '@/app/closet/actions'
import { OCASION_LABELS, OCASION_EMOJI, NIVEL_CLIMA_LABELS, NIVEL_CLIMA_EMOJI } from '@/lib/recomendador'
import type { Ocasion, NivelClima } from '@/lib/recomendador'
import type { Conjunto, PrendaConUrl } from '@/types'

interface Props {
  conjuntos: Conjunto[]
  prendasConUrl: PrendaConUrl[]
}

function ConjuntoDetalle({
  conjunto,
  prendas,
  onClose,
  onDeleted,
  onRenamed,
}: Readonly<{
  conjunto: Conjunto
  prendas: PrendaConUrl[]
  onClose: () => void
  onDeleted: () => void
  onRenamed: (nombre: string) => void
}>) {
  const [mode, setMode] = useState<'view' | 'rename' | 'confirmDelete' | 'deleting' | 'meLoPuse'>('view')
  const [nombreInput, setNombreInput] = useState(conjunto.nombre ?? '')
  const [, startTransition] = useTransition()

  const today = new Date().toISOString().split('T')[0]
  const thirtyDaysAgo = (() => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().split('T')[0] })()
  const [fechaMeLoPuse, setFechaMeLoPuse] = useState(today)
  const [registrado, setRegistrado] = useState(false)
  const [savingRegistro, setSavingRegistro] = useState(false)
  const [errorRegistro, setErrorRegistro] = useState<string | null>(null)

  async function handleMeLoPuse() {
    setSavingRegistro(true)
    setErrorRegistro(null)
    const result = await registrarOutfitUsado({
      prenda_ids: conjunto.prenda_ids,
      conjunto_id: conjunto.id,
      fecha: fechaMeLoPuse,
      ocasion: conjunto.ocasion,
      force: true,
    })
    setSavingRegistro(false)
    if (result.error) { setErrorRegistro('No se pudo registrar. Intenta de nuevo.'); return }
    setRegistrado(true)
    setMode('view')
  }

  const label = conjunto.nombre ?? `Conjunto para ${OCASION_LABELS[conjunto.ocasion as Ocasion] ?? conjunto.ocasion}`

  function handleDelete() {
    setMode('deleting')
    startTransition(async () => {
      await deleteConjunto(conjunto.id)
      onDeleted()
    })
  }

  function handleRename() {
    if (!nombreInput.trim()) return
    startTransition(async () => {
      await renameConjunto(conjunto.id, nombreInput)
      onRenamed(nombreInput.trim())
      setMode('view')
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end p-3" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div className="relative bg-background rounded-3xl overflow-hidden w-full max-w-lg mx-auto max-h-[90dvh] flex flex-col shadow-2xl animate-fade-up">
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full bg-border" />
        </div>

        <div className="flex items-center justify-between px-5 pb-3 shrink-0">
          <h2 className="text-xl font-light truncate pr-2" style={{ fontFamily: 'var(--font-display)' }}>
            {label}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 shrink-0 flex items-center justify-center rounded-full hover:bg-muted text-muted-foreground transition-colors"
            aria-label="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-8 space-y-5">
          <OutfitCollage prendas={prendas} />

          {conjunto.justificacion && (
            <p className="text-sm text-muted-foreground italic leading-relaxed">
              {conjunto.justificacion}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            {conjunto.ocasion && (
              <span className="text-xs bg-muted px-2.5 py-1 rounded-full text-muted-foreground">
                {OCASION_EMOJI[conjunto.ocasion as Ocasion] ?? ''} {OCASION_LABELS[conjunto.ocasion as Ocasion] ?? conjunto.ocasion}
              </span>
            )}
            {conjunto.clima && (
              <span className="text-xs bg-muted px-2.5 py-1 rounded-full text-muted-foreground">
                {NIVEL_CLIMA_EMOJI[conjunto.clima as NivelClima] ?? ''} {NIVEL_CLIMA_LABELS[conjunto.clima as NivelClima] ?? conjunto.clima}
              </span>
            )}
          </div>

          <div className="flex flex-wrap gap-1">
            {prendas.map((p) => (
              <span key={p.id} className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full capitalize">
                {p.tipo.replaceAll('_', ' ')}
              </span>
            ))}
          </div>

          {mode === 'rename' && (
            <div className="space-y-2">
              <input
                type="text"
                value={nombreInput}
                onChange={(e) => setNombreInput(e.target.value)}
                placeholder="Nombre del conjunto"
                className="w-full px-4 py-3 rounded-xl border border-border bg-muted/30 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                onKeyDown={(e) => { if (e.key === 'Enter') handleRename() }}
                autoFocus
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setMode('view')}
                  className="flex-1 px-4 py-2.5 rounded-xl border border-border text-sm text-foreground/70 hover:bg-muted transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleRename}
                  disabled={!nombreInput.trim()}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-colors disabled:opacity-50"
                >
                  Guardar nombre
                </button>
              </div>
            </div>
          )}

          {mode === 'confirmDelete' && (
            <div className="bg-destructive/5 border border-destructive/20 rounded-2xl p-4 space-y-3">
              <p className="text-sm font-medium text-foreground">¿Eliminar este conjunto?</p>
              <p className="text-xs text-muted-foreground">Esta acción no se puede deshacer.</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setMode('view')}
                  className="flex-1 px-4 py-2.5 rounded-xl border border-border text-sm font-medium text-foreground/70 hover:bg-muted transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-destructive text-white text-sm font-semibold hover:opacity-90 transition-all active:scale-95"
                >
                  Eliminar
                </button>
              </div>
            </div>
          )}

          {mode === 'deleting' && (
            <div className="flex items-center justify-center py-4 gap-2 text-sm text-muted-foreground">
              <span className="inline-block w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
              Eliminando...
            </div>
          )}

          {mode === 'view' && (
            <div className="space-y-3 pt-2">
              {registrado && (
                <p className="text-xs text-center text-emerald-600">✓ Registrado el {fechaMeLoPuse}</p>
              )}
              <button
                type="button"
                onClick={() => setMode('meLoPuse')}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-primary/10 border border-primary/20 text-primary text-sm font-medium hover:bg-primary/15 transition-all active:scale-95"
              >
                <Shirt className="w-4 h-4" />
                Me lo puse
              </button>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setMode('rename')}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 border-primary/30 text-primary text-sm font-semibold hover:bg-primary/5 transition-all active:scale-95"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  Renombrar
                </button>
                <button
                  type="button"
                  onClick={() => setMode('confirmDelete')}
                  className="px-4 py-3 rounded-xl border border-destructive/30 text-destructive text-sm font-medium hover:bg-destructive/5 transition-all active:scale-95"
                  aria-label="Eliminar conjunto"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {mode === 'meLoPuse' && (
            <div className="space-y-3 pt-2">
              <p className="text-xs text-muted-foreground">¿Cuándo lo usaste?</p>
              <input
                type="date"
                value={fechaMeLoPuse}
                max={today}
                min={thirtyDaysAgo}
                onChange={(e) => setFechaMeLoPuse(e.target.value)}
                className="w-full px-3 py-2.5 text-sm rounded-xl border border-border bg-background"
              />
              {errorRegistro && (
                <p className="text-xs text-destructive">{errorRegistro}</p>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setMode('view')}
                  className="flex-1 py-2.5 rounded-xl border border-border text-sm text-muted-foreground"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleMeLoPuse}
                  disabled={savingRegistro}
                  className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
                >
                  {savingRegistro ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export function MisConjuntos({ conjuntos: initialConjuntos, prendasConUrl }: Readonly<Props>) {
  const [conjuntos, setConjuntos] = useState(initialConjuntos)
  const [detalle, setDetalle] = useState<Conjunto | null>(null)

  const prendasById = new Map(prendasConUrl.map((p) => [p.id, p]))

  function getPrendasDeConjunto(conjunto: Conjunto): PrendaConUrl[] {
    return conjunto.prenda_ids
      .map((id) => prendasById.get(id))
      .filter((p): p is PrendaConUrl => p != null)
  }

  if (conjuntos.length === 0) {
    return (
      <div className="flex flex-col items-center text-center py-16 px-6">
        <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
          <Layers className="w-8 h-8 text-muted-foreground/50" />
        </div>
        <h3 className="text-lg font-light text-foreground mb-2" style={{ fontFamily: 'var(--font-display)' }}>
          Sin conjuntos guardados
        </h3>
        <p className="text-sm text-muted-foreground leading-relaxed max-w-xs">
          Pide una recomendación y guarda los looks que más te gusten.
        </p>
      </div>
    )
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        {conjuntos.map((c) => {
          const cprendas = getPrendasDeConjunto(c)
          const label = c.nombre ?? `Conjunto ${OCASION_LABELS[c.ocasion as Ocasion] ?? c.ocasion}`
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => setDetalle(c)}
              className="group flex flex-col rounded-2xl overflow-hidden border border-border bg-card hover:border-primary/30 hover:shadow-md transition-all duration-200 active:scale-[0.97] text-left"
              aria-label={`Ver conjunto ${label}`}
            >
              <div className="p-2">
                <OutfitCollage prendas={cprendas} />
              </div>
              <div className="px-3 pb-3 space-y-1">
                <p className="text-xs font-semibold text-foreground leading-tight line-clamp-1">
                  {label}
                </p>
                <div className="flex gap-1 flex-wrap">
                  <span className="text-xs text-muted-foreground">
                    {OCASION_EMOJI[c.ocasion as Ocasion] ?? ''} {OCASION_LABELS[c.ocasion as Ocasion] ?? c.ocasion}
                  </span>
                  {c.clima && (
                    <span className="text-xs text-muted-foreground">
                      · {NIVEL_CLIMA_EMOJI[c.clima as NivelClima] ?? ''} {NIVEL_CLIMA_LABELS[c.clima as NivelClima] ?? c.clima}
                    </span>
                  )}
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {detalle && (
        <ConjuntoDetalle
          conjunto={detalle}
          prendas={getPrendasDeConjunto(detalle)}
          onClose={() => setDetalle(null)}
          onDeleted={() => {
            setConjuntos((prev) => prev.filter((c) => c.id !== detalle.id))
            setDetalle(null)
          }}
          onRenamed={(nombre) => {
            setConjuntos((prev) =>
              prev.map((c) => (c.id === detalle.id ? { ...c, nombre } : c)),
            )
            setDetalle((prev) => (prev ? { ...prev, nombre } : null))
          }}
        />
      )}
    </>
  )
}
