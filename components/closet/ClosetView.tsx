'use client'

import { useState } from 'react'
import { PrendaDetalle } from './PrendaDetalle'
import { AgregarPrendaModal } from './AgregarPrendaModal'
import { RecomendarModal } from './RecomendarModal'
import { CombinarModal } from './CombinarModal'
import { MisConjuntos } from './MisConjuntos'
import { CATEGORIAS, COLORES, CATEGORIA_LABELS, CATEGORIA_EMOJIS, colorBgStyle } from '@/lib/taxonomia'
import { validarCompatibilidadFijas } from '@/lib/recomendador'
import type { PrendaConUrl, PreferenciaPrendas, Conjunto } from '@/types'
import type { Categoria, Color } from '@/lib/taxonomia'

type Tab = 'closet' | 'conjuntos'

function reloadPage() {
  globalThis.location.reload()
}

interface Props {
  prendas: PrendaConUrl[]
  conjuntos: Conjunto[]
  preferencia: PreferenciaPrendas
  nombreUsuario: string | null
  ciudad: string | null
  profileLat: number | null
  profileLon: number | null
}

export function ClosetView({
  prendas: initialPrendas,
  conjuntos,
  preferencia,
  ciudad,
  profileLat,
  profileLon,
}: Readonly<Props>) {
  const [tab, setTab] = useState<Tab>('closet')
  const [prendas, setPrendas] = useState(initialPrendas)
  const [filtroCats, setFiltroCats] = useState<Set<Categoria>>(new Set())
  const [filtroColores, setFiltroColores] = useState<Set<Color>>(new Set())
  const [detalle, setDetalle] = useState<PrendaConUrl | null>(null)
  const [showAgregar, setShowAgregar] = useState(false)
  const [showRecomendar, setShowRecomendar] = useState(false)

  // Modo selección múltiple
  const [modoSeleccion, setModoSeleccion] = useState(false)
  const [seleccionadas, setSeleccionadas] = useState<Set<string>>(new Set())
  const [errorSeleccion, setErrorSeleccion] = useState<string | null>(null)
  const [showCombinar, setShowCombinar] = useState<PrendaConUrl[] | null>(null)

  function toggleCat(cat: Categoria) {
    setFiltroCats((prev) => {
      const next = new Set(prev)
      if (next.has(cat)) { next.delete(cat) } else { next.add(cat) }
      return next
    })
  }

  function toggleColor(color: Color) {
    setFiltroColores((prev) => {
      const next = new Set(prev)
      if (next.has(color)) { next.delete(color) } else { next.add(color) }
      return next
    })
  }

  function salirModoSeleccion() {
    setModoSeleccion(false)
    setSeleccionadas(new Set())
    setErrorSeleccion(null)
  }

  function toggleSeleccion(id: string) {
    setErrorSeleccion(null)
    setSeleccionadas((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else if (next.size < 2) {
        next.add(id)
      }
      return next
    })
  }

  function confirmarCombinar() {
    const selArray = Array.from(seleccionadas)
    const prendasSel = selArray.map((id) => prendas.find((p) => p.id === id)).filter((p): p is PrendaConUrl => p != null)
    const result = validarCompatibilidadFijas(prendasSel)
    if (!result.ok) {
      setErrorSeleccion(result.error ?? 'Prendas incompatibles.')
      return
    }
    setShowCombinar(prendasSel)
  }

  const filtradas = prendas.filter((p) => {
    if (filtroCats.size > 0 && !filtroCats.has(p.categoria)) return false
    if (filtroColores.size > 0 && !filtroColores.has(p.color_principal)) return false
    return true
  })

  const hayFiltros = filtroCats.size > 0 || filtroColores.size > 0

  return (
    <>
      {/* ¿Qué me pongo hoy? CTA */}
      {!modoSeleccion && (
        <button
          type="button"
          onClick={() => setShowRecomendar(true)}
          className="w-full flex items-center justify-center gap-2 px-5 py-4 rounded-2xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-all active:scale-[0.98] mb-2 shadow-sm"
          aria-label="Recibir recomendación de outfit"
        >
          <span aria-hidden="true">✨</span>
          {' ¿Qué me pongo hoy?'}
        </button>
      )}

      {/* Combinar prendas CTA */}
      {!modoSeleccion && (
        <button
          type="button"
          onClick={() => { setModoSeleccion(true); setTab('closet') }}
          className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-2xl border-2 border-dashed border-primary/40 text-sm font-medium text-primary hover:bg-primary/5 transition-all active:scale-[0.98] mb-3"
        >
          <span aria-hidden="true">👗</span>
          {' Combinar prendas'}
        </button>
      )}

      {/* Barra modo selección */}
      {modoSeleccion && (
        <div className="flex items-center justify-between mb-3 px-1">
          <p className="text-sm font-medium text-foreground">
            Elige 1 o 2 prendas para combinar
          </p>
          <button
            type="button"
            onClick={salirModoSeleccion}
            className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-muted-foreground hover:bg-border transition-colors"
            aria-label="Cancelar selección"
          >
            ✕
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-muted/50 rounded-xl p-1 mb-5">
        <button
          type="button"
          onClick={() => setTab('closet')}
          className={[
            'flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-all',
            tab === 'closet'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          ].join(' ')}
        >
          👗 Mi clóset
        </button>
        <button
          type="button"
          onClick={() => setTab('conjuntos')}
          className={[
            'flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-all',
            tab === 'conjuntos'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          ].join(' ')}
        >
          ❤️ Mis conjuntos
          {conjuntos.length > 0 && (
            <span className="ml-1 text-xs bg-primary/15 text-primary px-1.5 py-0.5 rounded-full font-semibold">
              {conjuntos.length}
            </span>
          )}
        </button>
      </div>

      {/* ── TAB: MI CLÓSET ── */}
      {tab === 'closet' && (
        <>
          {/* Agregar button — oculto en modo selección */}
          {!modoSeleccion && (
            <button
              type="button"
              onClick={() => setShowAgregar(true)}
              className="w-full flex items-center justify-center gap-2 px-5 py-4 rounded-xl border-2 border-dashed border-primary/40 text-sm font-medium text-primary hover:bg-primary/5 transition-all active:scale-95 mb-6"
              aria-label="Agregar prenda"
            >
              <span aria-hidden="true">+</span>
              {' Agregar prenda'}
            </button>
          )}

          {/* Filters — ocultos en modo selección */}
          {!modoSeleccion && (
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
          )}

          {/* Instrucción en modo selección */}
          {modoSeleccion && (
            <p className="text-xs text-muted-foreground mb-4">
              {seleccionadas.size === 0 && 'Toca las prendas que quieres ponerse sí o sí (máximo 2).'}
              {seleccionadas.size === 1 && '1 prenda seleccionada — toca otra o presiona Combinar.'}
              {seleccionadas.size === 2 && '2 prendas seleccionadas.'}
            </p>
          )}

          {/* Error de compatibilidad */}
          {errorSeleccion && (
            <p className="text-xs text-destructive bg-destructive/5 rounded-lg px-3 py-2 mb-4">
              {errorSeleccion}
            </p>
          )}

          {/* Grid */}
          {filtradas.length === 0 ? (
            <div className="flex flex-col items-center text-center py-12 px-6">
              <p className="text-3xl mb-3">🔍</p>
              <p className="text-sm font-medium text-foreground mb-1">Sin resultados</p>
              <p className="text-xs text-muted-foreground">
                Ninguna prenda coincide con los filtros seleccionados.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {prendas.map((p) => (
                <PrendaCard
                  key={p.id}
                  prenda={p}
                  modoSeleccion={modoSeleccion}
                  isSelected={seleccionadas.has(p.id)}
                  onClick={() => {
                    if (modoSeleccion) {
                      toggleSeleccion(p.id)
                    } else {
                      setDetalle(p)
                    }
                  }}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* ── TAB: MIS CONJUNTOS ── */}
      {tab === 'conjuntos' && (
        <MisConjuntos conjuntos={conjuntos} prendasConUrl={prendas} />
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
            reloadPage()
          }}
          onCombinar={() => {
            setShowCombinar([detalle])
            setDetalle(null)
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
            reloadPage()
          }}
        />
      )}

      {/* Recomendar modal */}
      {showRecomendar && (
        <RecomendarModal
          prendas={prendas}
          ciudad={ciudad}
          profileLat={profileLat}
          profileLon={profileLon}
          onClose={() => setShowRecomendar(false)}
        />
      )}

      {/* Combinar modal */}
      {showCombinar && (
        <CombinarModal
          prendasFijas={showCombinar}
          prendas={prendas}
          ciudad={ciudad}
          profileLat={profileLat}
          profileLon={profileLon}
          onClose={() => {
            setShowCombinar(null)
            salirModoSeleccion()
          }}
        />
      )}

      {/* Barra fija de acción en modo selección */}
      {modoSeleccion && seleccionadas.size >= 1 && (
        <div className="fixed bottom-0 inset-x-0 max-w-lg mx-auto z-30 px-4 pb-6 pt-3 bg-background/95 backdrop-blur-sm border-t border-border">
          <button
            type="button"
            onClick={confirmarCombinar}
            className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-all active:scale-[0.98] shadow-lg"
          >
            <span aria-hidden="true">✨</span>
            {`Combinar (${seleccionadas.size})`}
          </button>
        </div>
      )}
    </>
  )
}

function PrendaCard({
  prenda,
  modoSeleccion,
  isSelected,
  onClick,
}: Readonly<{
  prenda: PrendaConUrl
  modoSeleccion: boolean
  isSelected: boolean
  onClick: () => void
}>) {
  let borderClass = 'border-border hover:border-primary/30 hover:shadow-md'
  if (modoSeleccion) {
    borderClass = isSelected ? 'border-primary ring-2 ring-primary/40 shadow-md' : 'border-border hover:border-primary/50'
  }

  let ariaAction = 'Ver detalle de'
  if (modoSeleccion) {
    ariaAction = isSelected ? 'Deseleccionar' : 'Seleccionar'
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative flex flex-col rounded-2xl overflow-hidden border bg-card transition-all duration-200 active:scale-[0.97] text-left ${borderClass}`}
      aria-label={`${ariaAction} ${prenda.tipo}`}
      aria-pressed={modoSeleccion ? isSelected : undefined}
    >
      <div className="aspect-square w-full overflow-hidden bg-muted">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={prenda.signedUrl}
          alt={prenda.tipo}
          className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
          loading="lazy"
        />
        {/* Overlay de selección */}
        {modoSeleccion && isSelected && (
          <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
            <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center shadow-lg">
              <span className="text-primary-foreground text-sm font-bold">✓</span>
            </div>
          </div>
        )}
      </div>

      <div className="px-3 py-2.5">
        <p className="text-xs font-semibold text-foreground capitalize leading-tight mb-1.5">
          {prenda.tipo.replaceAll('_', ' ')}
        </p>
        <div className="flex items-center gap-1.5 flex-wrap">
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
