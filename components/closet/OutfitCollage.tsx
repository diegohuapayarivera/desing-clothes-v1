'use client'

import { useState } from 'react'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { colorBgStyle, ESTILO_LABELS } from '@/lib/taxonomia'
import type { PrendaConUrl } from '@/types'

const CAT_ORDER: Record<string, number> = {
  cuerpo_completo: 0,
  superior: 1,
  inferior: 2,
  abrigo: 3,
  calzado: 4,
  accesorio: 5,
}

function PrendaCell({
  p,
  onRemovePrenda,
  isReplacing,
  anyReplacing,
  isPinned,
  onTap,
}: Readonly<{
  p: PrendaConUrl
  onRemovePrenda?: (id: string) => void
  isReplacing: boolean
  anyReplacing: boolean
  isPinned: boolean
  onTap: () => void
}>) {
  return (
    <div
      className="relative flex-1 overflow-hidden rounded-lg bg-white cursor-pointer select-none"
      onClick={onTap}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onTap() }}
      aria-label={`Ver ${p.tipo} en detalle`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={p.signedUrl}
        alt={p.tipo}
        className="w-full h-full object-contain"
        loading="lazy"
      />
      {onRemovePrenda && !isReplacing && !isPinned && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onRemovePrenda(p.id) }}
          disabled={anyReplacing}
          className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/50 text-white text-xs flex items-center justify-center hover:bg-black/70 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          aria-label={`Quitar ${p.tipo}`}
        >
          ✕
        </button>
      )}
      {isPinned && (
        <span className="absolute bottom-1 left-1 text-[10px] bg-black/40 text-white px-1.5 py-0.5 rounded-full leading-tight pointer-events-none">
          Tu elección
        </span>
      )}
      {isReplacing && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/35 rounded-lg">
          <div className="w-5 h-5 rounded-full border-2 border-white border-t-transparent animate-spin" />
        </div>
      )}
    </div>
  )
}

function PrendaViewer({
  prendas,
  initialIdx,
  onClose,
  onViewPrenda,
}: Readonly<{
  prendas: PrendaConUrl[]
  initialIdx: number
  onClose: () => void
  onViewPrenda?: (prenda: PrendaConUrl) => void
}>) {
  const [idx, setIdx] = useState(initialIdx)
  const [touchX, setTouchX] = useState<number | null>(null)
  const prenda = prendas[idx]

  const prev = () => setIdx((i) => (i - 1 + prendas.length) % prendas.length)
  const next = () => setIdx((i) => (i + 1) % prendas.length)

  function handleTouchStart(e: React.TouchEvent) {
    setTouchX(e.touches[0].clientX)
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (touchX === null) return
    const dx = e.changedTouches[0].clientX - touchX
    if (Math.abs(dx) > 50) {
      if (dx < 0) next(); else prev()
    }
    setTouchX(null)
  }

  return (
    <div
      className="fixed inset-0 z-100 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="relative bg-white rounded-2xl overflow-hidden w-full max-w-sm shadow-2xl flex flex-col md:max-w-md"
        role="dialog"
        aria-modal="true"
        aria-label={`Detalle de ${prenda.tipo}`}
        onClick={(e) => e.stopPropagation()}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-black/10 flex items-center justify-center hover:bg-black/20 transition-colors"
          aria-label="Cerrar visor"
        >
          <X className="w-4 h-4 text-gray-700" />
        </button>

        {prendas.length > 1 && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); prev() }}
            className="absolute left-2 top-1/3 -translate-y-1/2 z-10 w-8 h-8 rounded-full bg-black/10 flex items-center justify-center hover:bg-black/20 transition-colors"
            aria-label="Prenda anterior"
          >
            <ChevronLeft className="w-4 h-4 text-gray-700" />
          </button>
        )}

        {prendas.length > 1 && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); next() }}
            className="absolute right-2 top-1/3 -translate-y-1/2 z-10 w-8 h-8 rounded-full bg-black/10 flex items-center justify-center hover:bg-black/20 transition-colors"
            aria-label="Prenda siguiente"
          >
            <ChevronRight className="w-4 h-4 text-gray-700" />
          </button>
        )}

        <div className="aspect-square bg-white flex items-center justify-center p-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={prenda.signedUrl}
            alt={prenda.tipo}
            className="max-w-full max-h-full object-contain"
          />
        </div>

        <div className="px-4 pt-3 pb-4 border-t border-gray-100">
          <p className="text-sm font-semibold text-foreground capitalize mb-1.5">
            {prenda.tipo.replaceAll('_', ' ')}
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5">
              <span
                className="w-3 h-3 rounded-full border border-black/10 shrink-0"
                style={colorBgStyle(prenda.color_principal)}
              />
              <span className="text-xs text-muted-foreground capitalize">{prenda.color_principal}</span>
            </div>
            <span className="text-xs text-muted-foreground">·</span>
            <span className="text-xs text-muted-foreground capitalize">
              {ESTILO_LABELS[prenda.estilo]}
            </span>
            {prenda.estampado && (
              <span className="text-xs bg-accent/60 text-accent-foreground px-1.5 py-0.5 rounded-full">
                estampado
              </span>
            )}
          </div>
          {onViewPrenda && (
            <button
              type="button"
              onClick={() => { onClose(); onViewPrenda(prenda) }}
              className="mt-3 w-full py-2 rounded-xl border border-border text-xs font-medium text-foreground hover:bg-muted transition-colors"
            >
              Ver en mi clóset
            </button>
          )}
        </div>

        {prendas.length > 1 && (
          <div className="flex justify-center gap-1.5 pb-3">
            {prendas.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={(e) => { e.stopPropagation(); setIdx(i) }}
                className={[
                  'w-1.5 h-1.5 rounded-full transition-all',
                  i === idx ? 'bg-primary scale-125' : 'bg-primary/30',
                ].join(' ')}
                aria-label={`Ir a prenda ${i + 1}`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export function OutfitCollage({
  prendas,
  onRemovePrenda,
  replacingPrendaId,
  pinnedIds,
  onViewPrenda,
}: Readonly<{
  prendas: PrendaConUrl[]
  onRemovePrenda?: (id: string) => void
  replacingPrendaId?: string
  pinnedIds?: string[]
  onViewPrenda?: (prenda: PrendaConUrl) => void
}>) {
  const [viewerIdx, setViewerIdx] = useState<number | null>(null)

  const sorted = [...prendas].sort(
    (a, b) => (CAT_ORDER[a.categoria] ?? 9) - (CAT_ORDER[b.categoria] ?? 9),
  )

  const main = sorted.filter((p) =>
    ['superior', 'cuerpo_completo', 'inferior'].includes(p.categoria),
  )
  const extras = sorted.filter((p) =>
    ['calzado', 'abrigo', 'accesorio'].includes(p.categoria),
  )

  const anyReplacing = !!replacingPrendaId
  const pinnedSet = new Set(pinnedIds ?? [])

  return (
    <>
      <div className="flex gap-1.5 w-full rounded-xl overflow-hidden bg-muted" style={{ aspectRatio: '4/3' }}>
        <div className="flex flex-col gap-1.5 flex-3 min-w-0">
          {main.map((p) => (
            <PrendaCell
              key={p.id}
              p={p}
              onRemovePrenda={onRemovePrenda}
              isReplacing={p.id === replacingPrendaId}
              anyReplacing={anyReplacing}
              isPinned={pinnedSet.has(p.id)}
              onTap={() => setViewerIdx(sorted.findIndex((s) => s.id === p.id))}
            />
          ))}
          {main.length === 0 && <div className="flex-1 bg-muted rounded-lg" />}
        </div>

        {extras.length > 0 && (
          <div className="flex flex-col gap-1.5 flex-2 min-w-0">
            {extras.map((p) => (
              <PrendaCell
                key={p.id}
                p={p}
                onRemovePrenda={onRemovePrenda}
                isReplacing={p.id === replacingPrendaId}
                anyReplacing={anyReplacing}
                isPinned={pinnedSet.has(p.id)}
                onTap={() => setViewerIdx(sorted.findIndex((s) => s.id === p.id))}
              />
            ))}
          </div>
        )}
      </div>

      {viewerIdx !== null && (
        <PrendaViewer
          prendas={sorted}
          initialIdx={viewerIdx}
          onClose={() => setViewerIdx(null)}
          onViewPrenda={onViewPrenda}
        />
      )}
    </>
  )
}
