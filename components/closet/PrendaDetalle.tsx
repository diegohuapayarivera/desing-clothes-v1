'use client'

import { useState, useTransition } from 'react'
import { deletePrenda, updatePrendaTags, countConjuntosForPrenda } from '@/app/closet/actions'
import {
  CATEGORIAS,
  COLORES,
  ESTILOS,
  TEMPORADAS,
  CATEGORIA_LABELS,
  CATEGORIA_EMOJIS,
  ESTILO_LABELS,
  TEMPORADA_LABELS,
  colorBgStyle,
  tiposPorCategoria,
  type Categoria,
  type Color,
  type Estilo,
  type Temporada,
} from '@/lib/taxonomia'
import type { PrendaConUrl, PreferenciaPrendas } from '@/types'

interface Props {
  prenda: PrendaConUrl
  preferencia: PreferenciaPrendas
  onClose: () => void
  onDeleted: () => void
  onUpdated: () => void
}

type Mode = 'view' | 'edit' | 'confirmDelete' | 'deleting'

function Spinner() {
  return (
    <span className="inline-block w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
  )
}

export function PrendaDetalle({ prenda, preferencia, onClose, onDeleted, onUpdated }: Props) {
  const [mode, setMode] = useState<Mode>('view')
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  // Edit form state
  const [editCat, setEditCat] = useState<Categoria>(prenda.categoria)
  const [editTipo, setEditTipo] = useState<string>(prenda.tipo)
  const [editColorP, setEditColorP] = useState<Color>(prenda.color_principal)
  const [editColorS, setEditColorS] = useState<Color | null>(prenda.color_secundario)
  const [editEstilo, setEditEstilo] = useState<Estilo>(prenda.estilo)
  const [editEstampado, setEditEstampado] = useState<boolean>(prenda.estampado)
  const [editTemporada, setEditTemporada] = useState<Temporada>(prenda.temporada)
  const [isSaving, setIsSaving] = useState(false)
  const [conjuntosCount, setConjuntosCount] = useState(0)

  const tiposDisponibles = tiposPorCategoria(editCat, preferencia)

  function handleCatChange(cat: Categoria) {
    setEditCat(cat)
    const tipos = tiposPorCategoria(cat, preferencia)
    if (!tipos.some((t) => t.valor === editTipo)) {
      setEditTipo(tipos[0]?.valor ?? '')
    }
  }

  function handleDelete() {
    setMode('deleting')
    startTransition(async () => {
      const result = await deletePrenda(prenda.id)
      if (result.error) {
        setError(result.error)
        setMode('view')
      } else {
        onDeleted()
      }
    })
  }

  function handleSaveEdit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setIsSaving(true)
    setError(null)

    const fd = new FormData()
    fd.append('categoria', editCat)
    fd.append('tipo', editTipo)
    fd.append('color_principal', editColorP)
    if (editColorS) fd.append('color_secundario', editColorS)
    fd.append('estilo', editEstilo)
    fd.append('estampado', String(editEstampado))
    fd.append('temporada', editTemporada)

    startTransition(async () => {
      const result = await updatePrendaTags(prenda.id, fd)
      setIsSaving(false)
      if (result.error) {
        setError(result.error)
      } else {
        onUpdated()
      }
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end p-3" role="dialog" aria-modal="true">
      <div
        className="absolute inset-0 bg-foreground/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="relative bg-background rounded-3xl overflow-hidden w-full max-w-lg mx-auto max-h-[90dvh] flex flex-col shadow-2xl animate-fade-up">
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full bg-border" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pb-3 shrink-0">
          <h2 style={{ fontFamily: 'var(--font-display)' }} className="text-xl font-light capitalize">
            {prenda.tipo.replace(/_/g, ' ')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-muted text-muted-foreground transition-colors"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-8">
          {/* ── View mode ── */}
          {(mode === 'view' || mode === 'confirmDelete' || mode === 'deleting') && (
            <div className="space-y-5">
              {/* Photo */}
              <div className="w-full aspect-square rounded-2xl overflow-hidden bg-muted">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={prenda.signedUrl}
                  alt={prenda.tipo}
                  className="w-full h-full object-cover"
                />
              </div>

              {/* Tags */}
              <div className="grid grid-cols-2 gap-3">
                <TagPill label="Categoría" value={`${CATEGORIA_EMOJIS[prenda.categoria]} ${CATEGORIA_LABELS[prenda.categoria]}`} />
                <TagPill label="Tipo" value={prenda.tipo.replace(/_/g, ' ')} capitalize />
                <TagPill label="Color principal" value={prenda.color_principal} colorDot={prenda.color_principal} capitalize />
                {prenda.color_secundario && (
                  <TagPill label="Color secundario" value={prenda.color_secundario} colorDot={prenda.color_secundario} capitalize />
                )}
                <TagPill label="Estilo" value={ESTILO_LABELS[prenda.estilo]} />
                <TagPill label="Temporada" value={TEMPORADA_LABELS[prenda.temporada]} />
                <TagPill label="Estampado" value={prenda.estampado ? 'Sí' : 'No'} />
              </div>

              {error && (
                <p className="text-xs text-destructive bg-destructive/5 px-3 py-2 rounded-lg">
                  {error}
                </p>
              )}

              {/* Confirm delete */}
              {mode === 'confirmDelete' && (
                <div className="bg-destructive/5 border border-destructive/20 rounded-2xl p-4 space-y-3">
                  <p className="text-sm font-medium text-foreground">
                    ¿Eliminar esta prenda?
                  </p>
                  {conjuntosCount > 0 ? (
                    <p className="text-xs text-muted-foreground">
                      Esta prenda está en <strong>{conjuntosCount} {conjuntosCount === 1 ? 'conjunto guardado' : 'conjuntos guardados'}</strong>. Al eliminarla, esos conjuntos también se borrarán. Esta acción no se puede deshacer.
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Se borrará la foto y todos sus datos. Esta acción no se puede deshacer.
                    </p>
                  )}
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
                  <Spinner />
                  Eliminando...
                </div>
              )}

              {/* Actions */}
              {mode === 'view' && (
                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setMode('edit')}
                    className="flex-1 px-4 py-3 rounded-xl border-2 border-primary/30 text-primary text-sm font-semibold hover:bg-primary/5 transition-all active:scale-95"
                  >
                    Editar etiquetas
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      countConjuntosForPrenda(prenda.id).then(setConjuntosCount).catch(() => null)
                      setMode('confirmDelete')
                    }}
                    className="px-4 py-3 rounded-xl border border-destructive/30 text-destructive text-sm font-medium hover:bg-destructive/5 transition-all active:scale-95"
                    aria-label="Eliminar prenda"
                  >
                    🗑️
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── Edit mode ── */}
          {mode === 'edit' && (
            <form onSubmit={handleSaveEdit} className="space-y-5">
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground/80">Categoría</p>
                <div className="grid grid-cols-3 gap-2">
                  {CATEGORIAS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => handleCatChange(c)}
                      className={[
                        'flex flex-col items-center gap-1 rounded-xl border-2 px-2 py-2.5 text-xs font-medium transition-all',
                        editCat === c
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border bg-card text-foreground/70',
                      ].join(' ')}
                    >
                      <span className="text-lg">{CATEGORIA_EMOJIS[c]}</span>
                      {CATEGORIA_LABELS[c]}
                    </button>
                  ))}
                </div>
              </div>

              {tiposDisponibles.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground/80">Tipo</p>
                  <div className="grid grid-cols-3 gap-2">
                    {tiposDisponibles.map((t) => (
                      <button
                        key={t.valor}
                        type="button"
                        onClick={() => setEditTipo(t.valor)}
                        className={[
                          'rounded-xl border-2 px-2 py-2 text-xs font-medium transition-all',
                          editTipo === t.valor
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border bg-card text-foreground/70',
                        ].join(' ')}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground/80">Color principal</p>
                <div className="grid grid-cols-4 gap-2">
                  {COLORES.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setEditColorP(c)}
                      className={[
                        'flex items-center gap-1.5 rounded-xl border-2 px-2 py-2 text-xs font-medium transition-all',
                        editColorP === c
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border bg-card text-foreground/70',
                      ].join(' ')}
                    >
                      <span
                        className="w-3.5 h-3.5 rounded-full shrink-0 border border-black/10"
                        style={colorBgStyle(c)}
                      />
                      <span className="truncate capitalize">{c}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground/80">
                  Color secundario{' '}
                  <span className="text-muted-foreground font-normal">(opcional)</span>
                </p>
                <div className="grid grid-cols-4 gap-2">
                  <button
                    type="button"
                    onClick={() => setEditColorS(null)}
                    className={[
                      'flex items-center gap-1.5 rounded-xl border-2 px-2 py-2 text-xs font-medium transition-all',
                      editColorS === null
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border bg-card text-foreground/70',
                    ].join(' ')}
                  >
                    <span className="w-3.5 h-3.5 rounded-full shrink-0 border border-dashed border-muted-foreground/50" />
                    Ninguno
                  </button>
                  {COLORES.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setEditColorS(c)}
                      className={[
                        'flex items-center gap-1.5 rounded-xl border-2 px-2 py-2 text-xs font-medium transition-all',
                        editColorS === c
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border bg-card text-foreground/70',
                      ].join(' ')}
                    >
                      <span
                        className="w-3.5 h-3.5 rounded-full shrink-0 border border-black/10"
                        style={colorBgStyle(c)}
                      />
                      <span className="truncate capitalize">{c}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground/80">Estilo</p>
                <div className="grid grid-cols-2 gap-2">
                  {ESTILOS.map((e) => (
                    <button
                      key={e}
                      type="button"
                      onClick={() => setEditEstilo(e)}
                      className={[
                        'rounded-xl border-2 px-3 py-2.5 text-xs font-medium transition-all',
                        editEstilo === e
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border bg-card text-foreground/70',
                      ].join(' ')}
                    >
                      {ESTILO_LABELS[e]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground/80">Temporada</p>
                <div className="grid grid-cols-3 gap-2">
                  {TEMPORADAS.map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setEditTemporada(t)}
                      className={[
                        'rounded-xl border-2 px-2 py-2.5 text-xs font-medium transition-all',
                        editTemporada === t
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border bg-card text-foreground/70',
                      ].join(' ')}
                    >
                      {TEMPORADA_LABELS[t]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between py-3 border-t border-border">
                <div>
                  <p className="text-sm font-medium text-foreground/80">Tiene estampado</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={editEstampado}
                  onClick={() => setEditEstampado((v) => !v)}
                  className={[
                    'relative w-11 h-6 rounded-full transition-colors duration-200',
                    editEstampado ? 'bg-primary' : 'bg-border',
                  ].join(' ')}
                >
                  <span
                    className={[
                      'absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform duration-200',
                      editEstampado ? 'translate-x-5' : 'translate-x-0',
                    ].join(' ')}
                  />
                </button>
              </div>

              {error && (
                <p className="text-xs text-destructive bg-destructive/5 px-3 py-2 rounded-lg">
                  {error}
                </p>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setMode('view')}
                  className="flex-1 px-4 py-3 rounded-xl border border-border text-sm font-medium text-foreground/70 hover:bg-muted transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 transition-all disabled:opacity-50"
                >
                  {isSaving ? <><Spinner /> Guardando...</> : 'Guardar cambios'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

function TagPill({
  label,
  value,
  colorDot,
  capitalize,
}: {
  label: string
  value: string
  colorDot?: Color
  capitalize?: boolean
}) {
  return (
    <div className="bg-muted/50 rounded-xl px-3 py-2.5">
      <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
      <div className="flex items-center gap-1.5">
        {colorDot && (
          <span
            className="w-3 h-3 rounded-full border border-black/10 shrink-0"
            style={colorBgStyle(colorDot)}
          />
        )}
        <p className={`text-sm font-medium text-foreground ${capitalize ? 'capitalize' : ''}`}>
          {value}
        </p>
      </div>
    </div>
  )
}
