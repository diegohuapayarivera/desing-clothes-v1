'use client'

import { useState } from 'react'
import { PrendaDetalle } from './PrendaDetalle'
import { AgregarPrendaModal } from './AgregarPrendaModal'
import { CATEGORIAS, COLORES, CATEGORIA_LABELS, CATEGORIA_EMOJIS, colorBgStyle } from '@/lib/taxonomia'
import type { PrendaConUrl, PreferenciaPrendas } from '@/types'
import type { Categoria, Color } from '@/lib/taxonomia'

interface Props {
  prendas: PrendaConUrl[]
  preferencia: PreferenciaPrendas
  nombreUsuario: string | null
}

export function ClosetView({ prendas: initialPrendas, preferencia, nombreUsuario }: Props) {
  const [prendas, setPrendas] = useState(initialPrendas)
  const [filtroCats, setFiltroCats] = useState<Set<Categoria>>(new Set())
  const [filtroColores, setFiltroColores] = useState<Set<Color>>(new Set())
  const [detalle, setDetalle] = useState<PrendaConUrl | null>(null)
  const [showAgregar, setShowAgregar] = useState(false)

  function toggleCat(cat: Categoria) {
    setFiltroCats((prev) => {
      const next = new Set(prev)
      next.has(cat) ? next.delete(cat) : next.add(cat)
      return next
    })
  }

  function toggleColor(color: Color) {
    setFiltroColores((prev) => {
      const next = new Set(prev)
      next.has(color) ? next.delete(color) : next.add(color)
      return next
    })
  }

  const filtradas = prendas.filter((p) => {
    if (filtroCats.size > 0 && !filtroCats.has(p.categoria)) return false
    if (filtroColores.size > 0 && !filtroColores.has(p.color_principal)) return false
    return true
  })

  const hayFiltros = filtroCats.size > 0 || filtroColores.size > 0

  function handleRefresh() {
    window.location.reload()
  }

  return (
    <>
      {/* Agregar button */}
      <button
        type="button"
        onClick={() => setShowAgregar(true)}
        className="w-full flex items-center justify-center gap-2 px-5 py-4 rounded-xl border-2 border-dashed border-primary/40 text-sm font-medium text-primary hover:bg-primary/5 transition-all active:scale-95 mb-6"
        aria-label="Agregar prenda"
      >
        <span aria-hidden="true">+</span>
        {' Agregar prenda'}
      </button>

      {/* Filters row — categorías */}
      <div className="space-y-3 mb-5">
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          {CATEGORIAS.map((cat) => {
            const active = filtroCats.has(cat)
            return (
              <button
                key={cat}
                type="button"
                onClick={() => toggleCat(cat)}
                className={[
                  'shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all',
                  active
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-card border-border text-foreground/70 hover:border-primary/40',
                ].join(' ')}
              >
                <span>{CATEGORIA_EMOJIS[cat]}</span>
                {CATEGORIA_LABELS[cat]}
              </button>
            )
          })}
        </div>

        {/* Colors row */}
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
          {COLORES.map((color) => {
            const active = filtroColores.has(color)
            return (
              <button
                key={color}
                type="button"
                onClick={() => toggleColor(color)}
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

        {/* Counter + clear */}
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {filtradas.length}{' '}
            {filtradas.length === 1 ? 'prenda' : 'prendas'}
            {hayFiltros ? ' filtradas' : ' en total'}
          </p>
          {hayFiltros && (
            <button
              type="button"
              onClick={() => { setFiltroCats(new Set()); setFiltroColores(new Set()) }}
              className="text-xs text-primary hover:underline"
            >
              Limpiar filtros
            </button>
          )}
        </div>
      </div>

      {/* Grid */}
      {filtradas.length === 0 ? (
        <div className="flex flex-col items-center text-center py-12 px-6">
          <p className="text-3xl mb-3">🔍</p>
          <p className="text-sm font-medium text-foreground mb-1">
            Sin resultados
          </p>
          <p className="text-xs text-muted-foreground">
            Ninguna prenda coincide con los filtros seleccionados.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {filtradas.map((p) => (
            <PrendaCard key={p.id} prenda={p} onClick={() => setDetalle(p)} />
          ))}
        </div>
      )}

      {/* Detalle modal */}
      {detalle && (
        <PrendaDetalle
          prenda={detalle}
          preferencia={preferencia}
          onClose={() => setDetalle(null)}
          onDeleted={() => {
            setPrendas((prev) => prev.filter((p) => p.id !== detalle.id))
            setDetalle(null)
          }}
          onUpdated={() => {
            setDetalle(null)
            handleRefresh()
          }}
        />
      )}

      {/* Agregar modal */}
      {showAgregar && (
        <AgregarPrendaModal
          preferencia={preferencia}
          onClose={() => setShowAgregar(false)}
          onSaved={() => {
            setShowAgregar(false)
            handleRefresh()
          }}
        />
      )}
    </>
  )
}

function PrendaCard({ prenda, onClick }: { prenda: PrendaConUrl; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative flex flex-col rounded-2xl overflow-hidden border border-border bg-card hover:border-primary/30 hover:shadow-md transition-all duration-200 active:scale-[0.97] text-left"
      aria-label={`Ver detalle de ${prenda.tipo}`}
    >
      {/* Photo */}
      <div className="aspect-square w-full overflow-hidden bg-muted">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={prenda.signedUrl}
          alt={prenda.tipo}
          className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
          loading="lazy"
        />
      </div>

      {/* Info */}
      <div className="px-3 py-2.5">
        <p className="text-xs font-semibold text-foreground capitalize leading-tight mb-1.5">
          {prenda.tipo.replace(/_/g, ' ')}
        </p>
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Color dot */}
          <span
            className="w-3 h-3 rounded-full border border-black/10 shrink-0"
            style={colorBgStyle(prenda.color_principal)}
            title={prenda.color_principal}
          />
          <span className="text-xs text-muted-foreground capitalize">{prenda.color_principal}</span>
          {prenda.estampado && (
            <span className="text-xs bg-accent/60 text-accent-foreground px-1.5 py-0.5 rounded-full">
              estampado
            </span>
          )}
        </div>
      </div>
    </button>
  )
}
