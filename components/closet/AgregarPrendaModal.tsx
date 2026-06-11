'use client'

import { useState, useRef, useTransition } from 'react'
import imageCompression from 'browser-image-compression'
import { savePrenda } from '@/app/closet/actions'
import {
  CATEGORIAS,
  COLORES,
  ESTILOS,
  TEMPORADAS,
  CATEGORIA_LABELS,
  CATEGORIA_EMOJIS,
  ESTILO_LABELS,
  TEMPORADA_LABELS,
  COLOR_HEX,
  tiposPorCategoria,
  type Categoria,
  type Color,
  type Estilo,
  type Temporada,
} from '@/lib/taxonomia'
import type { PreferenciaPrendas, TagsIA } from '@/types'

interface Props {
  preferencia: PreferenciaPrendas
  onClose: () => void
  onSaved: () => void
}

type Step = 'capture' | 'analyzing' | 'form' | 'saving' | 'success'

interface FormState {
  foto_path: string
  categoria: Categoria | null
  tipo: string | null
  color_principal: Color | null
  color_secundario: Color | null
  estilo: Estilo | null
  estampado: boolean
  temporada: Temporada
}

function Spinner() {
  return (
    <span className="inline-block w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
  )
}

function ChipGroup<T extends string>({
  options,
  value,
  onChange,
  renderLabel,
  renderPreview,
  cols = 3,
}: {
  options: readonly T[] | T[]
  value: T | null
  onChange: (v: T) => void
  renderLabel: (v: T) => React.ReactNode
  renderPreview?: (v: T) => React.ReactNode
  cols?: 2 | 3 | 4
}) {
  const colClass = cols === 2 ? 'grid-cols-2' : cols === 4 ? 'grid-cols-4' : 'grid-cols-3'
  return (
    <div className={`grid ${colClass} gap-2`}>
      {options.map((opt) => {
        const selected = value === opt
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(opt)}
            className={[
              'flex flex-col items-center gap-1 rounded-xl border-2 px-2 py-2.5 text-center text-xs font-medium transition-all duration-150 active:scale-95',
              selected
                ? 'border-primary bg-primary/10 text-primary shadow-sm'
                : 'border-border bg-card text-foreground/70 hover:border-primary/30',
            ].join(' ')}
            aria-pressed={selected}
          >
            {renderPreview?.(opt)}
            <span className="leading-tight">{renderLabel(opt)}</span>
          </button>
        )
      })}
    </div>
  )
}

export function AgregarPrendaModal({ preferencia, onClose, onSaved }: Props) {
  const [step, setStep] = useState<Step>('capture')
  const [preview, setPreview] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>({
    foto_path: '',
    categoria: null,
    tipo: null,
    color_principal: null,
    color_secundario: null,
    estilo: null,
    estampado: false,
    temporada: 'todo_el_año',
  })
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [, startTransition] = useTransition()

  const tiposDisponibles =
    form.categoria ? tiposPorCategoria(form.categoria, preferencia) : []

  function setCategoria(cat: Categoria) {
    setForm((f) => ({
      ...f,
      categoria: cat,
      // Reset tipo if not valid for new category
      tipo:
        f.tipo && tiposPorCategoria(cat, preferencia).some((t) => t.valor === f.tipo)
          ? f.tipo
          : null,
    }))
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setError(null)
    setStep('analyzing')

    try {
      // Compress client-side
      const compressed = await imageCompression(file, {
        maxSizeMB: 0.2,
        maxWidthOrHeight: 1024,
        fileType: 'image/webp',
        useWebWorker: true,
      })

      // Preview
      const objectUrl = URL.createObjectURL(compressed)
      setPreview(objectUrl)

      // Send to /api/etiquetar
      const formData = new FormData()
      formData.append('image', compressed, 'prenda.webp')

      const res = await fetch('/api/etiquetar', { method: 'POST', body: formData })
      if (!res.ok) throw new Error('Error del servidor')

      const data: { foto_path: string; tags: TagsIA | null } = await res.json()

      setForm({
        foto_path: data.foto_path,
        categoria: data.tags?.categoria ?? null,
        tipo: data.tags?.tipo ?? null,
        color_principal: data.tags?.color_principal ?? null,
        color_secundario: data.tags?.color_secundario ?? null,
        estilo: data.tags?.estilo ?? null,
        estampado: data.tags?.estampado ?? false,
        temporada: data.tags?.temporada ?? 'todo_el_año',
      })

      setStep('form')
    } catch {
      setError('No se pudo analizar la imagen. Rellena los datos manualmente.')
      setStep('form')
    }
  }

  const isFormValid =
    form.foto_path &&
    form.categoria &&
    form.tipo &&
    form.color_principal &&
    form.estilo

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!isFormValid) return
    setStep('saving')
    setError(null)

    const fd = new FormData()
    fd.append('foto_path', form.foto_path)
    fd.append('categoria', form.categoria!)
    fd.append('tipo', form.tipo!)
    fd.append('color_principal', form.color_principal!)
    if (form.color_secundario) fd.append('color_secundario', form.color_secundario)
    fd.append('estilo', form.estilo!)
    fd.append('estampado', String(form.estampado))
    fd.append('temporada', form.temporada)

    startTransition(async () => {
      const result = await savePrenda(fd)
      if (result.error) {
        setError(result.error)
        setStep('form')
      } else {
        setStep('success')
      }
    })
  }

  function handleAgregarOtra() {
    setStep('capture')
    setPreview(null)
    setError(null)
    setForm({
      foto_path: '',
      categoria: null,
      tipo: null,
      color_principal: null,
      color_secundario: null,
      estilo: null,
      estampado: false,
      temporada: 'todo_el_año',
    })
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" role="dialog" aria-modal="true">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-foreground/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sheet */}
      <div className="relative bg-background rounded-t-3xl w-full max-w-lg mx-auto max-h-[92dvh] flex flex-col shadow-2xl animate-fade-up">
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full bg-border" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pb-3 shrink-0">
          <h2 style={{ fontFamily: 'var(--font-display)' }} className="text-xl font-light">
            {step === 'success' ? '¡Prenda guardada!' : 'Agregar prenda'}
          </h2>
          <button
            type="button"
            onClick={step === 'success' ? onSaved : onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-muted text-muted-foreground transition-colors"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 pb-8">
          {/* ── Step: capture ── */}
          {step === 'capture' && (
            <div className="flex flex-col items-center justify-center py-10 gap-6">
              <div className="w-24 h-24 rounded-2xl bg-accent/40 flex items-center justify-center text-4xl">
                📷
              </div>
              <div className="text-center">
                <p className="text-sm text-foreground font-medium mb-1">
                  Toma una foto de tu prenda
                </p>
                <p className="text-xs text-muted-foreground">
                  La IA la etiquetará automáticamente
                </p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handleFileChange}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-6 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold transition-all hover:opacity-90 active:scale-95"
              >
                Abrir cámara / galería
              </button>
            </div>
          )}

          {/* ── Step: analyzing ── */}
          {step === 'analyzing' && (
            <div className="flex flex-col items-center justify-center py-12 gap-5">
              {preview && (
                <div className="w-32 h-32 rounded-2xl overflow-hidden border border-border">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={preview}
                    alt="Prenda"
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
              <div className="flex flex-col items-center gap-3">
                <Spinner />
                <p className="text-sm text-muted-foreground">Analizando prenda...</p>
              </div>
            </div>
          )}

          {/* ── Step: form ── */}
          {(step === 'form' || step === 'saving') && (
            <form id="prenda-form" onSubmit={handleSubmit} className="space-y-6">
              {/* Preview thumbnail */}
              {preview && (
                <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-xl">
                  <div className="w-14 h-14 rounded-xl overflow-hidden border border-border shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={preview} alt="Prenda" className="w-full h-full object-cover" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-foreground">Foto lista</p>
                    <p className="text-xs text-muted-foreground">Revisa y ajusta las etiquetas</p>
                  </div>
                </div>
              )}

              {error && (
                <p className="text-xs text-destructive bg-destructive/5 px-4 py-3 rounded-xl">
                  {error}
                </p>
              )}

              {/* Categoría */}
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground/80">Categoría</p>
                <ChipGroup
                  options={CATEGORIAS}
                  value={form.categoria}
                  onChange={setCategoria}
                  cols={3}
                  renderPreview={(c) => <span className="text-lg">{CATEGORIA_EMOJIS[c]}</span>}
                  renderLabel={(c) => CATEGORIA_LABELS[c]}
                />
              </div>

              {/* Tipo */}
              {form.categoria && tiposDisponibles.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground/80">Tipo de prenda</p>
                  <div className="grid grid-cols-3 gap-2">
                    {tiposDisponibles.map((t) => {
                      const selected = form.tipo === t.valor
                      return (
                        <button
                          key={t.valor}
                          type="button"
                          onClick={() => setForm((f) => ({ ...f, tipo: t.valor }))}
                          className={[
                            'rounded-xl border-2 px-2 py-2 text-center text-xs font-medium transition-all duration-150 active:scale-95',
                            selected
                              ? 'border-primary bg-primary/10 text-primary shadow-sm'
                              : 'border-border bg-card text-foreground/70 hover:border-primary/30',
                          ].join(' ')}
                          aria-pressed={selected}
                        >
                          {t.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Color principal */}
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground/80">Color principal</p>
                <div className="grid grid-cols-4 gap-2">
                  {COLORES.map((c) => {
                    const selected = form.color_principal === c
                    const hex = COLOR_HEX[c]
                    return (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, color_principal: c }))}
                        className={[
                          'flex items-center gap-1.5 rounded-xl border-2 px-2 py-2 text-xs font-medium transition-all duration-150 active:scale-95',
                          selected
                            ? 'border-primary bg-primary/10 text-primary shadow-sm'
                            : 'border-border bg-card text-foreground/70 hover:border-primary/30',
                        ].join(' ')}
                        aria-pressed={selected}
                        title={c}
                      >
                        <span
                          className="w-3.5 h-3.5 rounded-full shrink-0 border border-black/10"
                          style={
                            c === 'multicolor'
                              ? { background: 'linear-gradient(135deg,#f06,#a0f,#0af)' }
                              : { background: hex }
                          }
                        />
                        <span className="truncate leading-tight capitalize">{c}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Color secundario */}
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground/80">
                  Color secundario{' '}
                  <span className="text-muted-foreground font-normal">(opcional)</span>
                </p>
                <div className="grid grid-cols-4 gap-2">
                  {/* Ninguno option */}
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, color_secundario: null }))}
                    className={[
                      'flex items-center gap-1.5 rounded-xl border-2 px-2 py-2 text-xs font-medium transition-all duration-150 active:scale-95',
                      form.color_secundario === null
                        ? 'border-primary bg-primary/10 text-primary shadow-sm'
                        : 'border-border bg-card text-foreground/70 hover:border-primary/30',
                    ].join(' ')}
                    aria-pressed={form.color_secundario === null}
                  >
                    <span className="w-3.5 h-3.5 rounded-full shrink-0 border border-dashed border-muted-foreground/50" />
                    <span className="leading-tight">Ninguno</span>
                  </button>
                  {COLORES.map((c) => {
                    const selected = form.color_secundario === c
                    const hex = COLOR_HEX[c]
                    return (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, color_secundario: c }))}
                        className={[
                          'flex items-center gap-1.5 rounded-xl border-2 px-2 py-2 text-xs font-medium transition-all duration-150 active:scale-95',
                          selected
                            ? 'border-primary bg-primary/10 text-primary shadow-sm'
                            : 'border-border bg-card text-foreground/70 hover:border-primary/30',
                        ].join(' ')}
                        aria-pressed={selected}
                        title={c}
                      >
                        <span
                          className="w-3.5 h-3.5 rounded-full shrink-0 border border-black/10"
                          style={
                            c === 'multicolor'
                              ? { background: 'linear-gradient(135deg,#f06,#a0f,#0af)' }
                              : { background: hex }
                          }
                        />
                        <span className="truncate leading-tight capitalize">{c}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Estilo */}
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground/80">Estilo</p>
                <ChipGroup
                  options={ESTILOS}
                  value={form.estilo}
                  onChange={(v) => setForm((f) => ({ ...f, estilo: v }))}
                  cols={2}
                  renderLabel={(v) => ESTILO_LABELS[v]}
                />
              </div>

              {/* Temporada */}
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground/80">Temporada</p>
                <ChipGroup
                  options={TEMPORADAS}
                  value={form.temporada}
                  onChange={(v) => setForm((f) => ({ ...f, temporada: v }))}
                  cols={3}
                  renderLabel={(v) => TEMPORADA_LABELS[v]}
                />
              </div>

              {/* Estampado toggle */}
              <div className="flex items-center justify-between py-3 border-t border-border">
                <div>
                  <p className="text-sm font-medium text-foreground/80">Tiene estampado</p>
                  <p className="text-xs text-muted-foreground">Rayas, flores, logos, etc.</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={form.estampado}
                  onClick={() => setForm((f) => ({ ...f, estampado: !f.estampado }))}
                  className={[
                    'relative w-11 h-6 rounded-full transition-colors duration-200',
                    form.estampado ? 'bg-primary' : 'bg-border',
                  ].join(' ')}
                >
                  <span
                    className={[
                      'absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform duration-200',
                      form.estampado ? 'translate-x-5' : 'translate-x-0',
                    ].join(' ')}
                  />
                </button>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={!isFormValid || step === 'saving'}
                className="w-full flex items-center justify-center gap-2 px-5 py-4 rounded-xl bg-primary text-primary-foreground text-sm font-semibold transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {step === 'saving' ? (
                  <>
                    <Spinner />
                    Guardando...
                  </>
                ) : (
                  'Guardar prenda →'
                )}
              </button>
            </form>
          )}

          {/* ── Step: success ── */}
          {step === 'success' && (
            <div className="flex flex-col items-center py-10 gap-6">
              {preview && (
                <div className="w-28 h-28 rounded-2xl overflow-hidden border-2 border-primary/20 shadow-md">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={preview} alt="Prenda guardada" className="w-full h-full object-cover" />
                </div>
              )}
              <div className="text-center">
                <div className="text-4xl mb-3">✓</div>
                <p className="text-base font-medium text-foreground">
                  {form.tipo ? `${form.tipo.replace(/_/g, ' ')} guardado` : 'Prenda guardada'}
                </p>
                <p className="text-sm text-muted-foreground mt-1">Ya aparece en tu clóset</p>
              </div>
              <div className="flex flex-col gap-3 w-full">
                <button
                  type="button"
                  onClick={handleAgregarOtra}
                  className="w-full px-5 py-3 rounded-xl border-2 border-dashed border-border text-sm font-medium text-foreground/70 hover:border-primary/40 hover:bg-accent/20 transition-all active:scale-95"
                >
                  + Agregar otra prenda
                </button>
                <button
                  type="button"
                  onClick={onSaved}
                  className="w-full px-5 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 active:scale-95 transition-all"
                >
                  Ver mi clóset
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
