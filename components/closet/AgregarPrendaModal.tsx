'use client'

import { useState, useRef, useTransition, useEffect } from 'react'
import { X, Plus, Check } from 'lucide-react'
import imageCompression from 'browser-image-compression'
import { savePrenda, deleteFotoHuerfana } from '@/app/closet/actions'
import {
  CATEGORIAS,
  COLORES,
  ESTILOS,
  TEMPORADAS,
  CATEGORIA_LABELS,
  ESTILO_LABELS,
  TEMPORADA_LABELS,
  colorBgStyle,
  tiposPorCategoria,
  type Categoria,
  type Color,
  type Estilo,
  type Temporada,
} from '@/lib/taxonomia'
import { CATEGORIA_ICONS } from '@/lib/icons'
import type { PreferenciaPrendas, TagsIA } from '@/types'

// ─── Helpers (module-level, no React deps) ───────────────────────────────────

async function composeOnWhite(blob: Blob): Promise<{ result: Blob; opacityRatio: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(blob)
    img.onload = () => {
      const maxSize = 1024
      let w = img.naturalWidth
      let h = img.naturalHeight
      if (w > maxSize || h > maxSize) {
        if (w >= h) { h = Math.round(h * maxSize / w); w = maxSize }
        else { w = Math.round(w * maxSize / h); h = maxSize }
      }

      // Step 1: draw noBg blob and apply alpha threshold to recover true colors.
      // Without this, partial-alpha edge pixels blend with white and wash out the color.
      const alphaCanvas = document.createElement('canvas')
      alphaCanvas.width = w
      alphaCanvas.height = h
      const alphaCtx = alphaCanvas.getContext('2d', { willReadFrequently: true })
      if (!alphaCtx) { URL.revokeObjectURL(url); reject(new Error('no ctx')); return }
      alphaCtx.drawImage(img, 0, 0, w, h)
      URL.revokeObjectURL(url)

      const imageData = alphaCtx.getImageData(0, 0, w, h)
      const data = imageData.data
      let opaqueCount = 0
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] > 60) {
          data[i + 3] = 255
          opaqueCount++
        } else {
          data[i + 3] = 0
        }
      }
      alphaCtx.putImageData(imageData, 0, 0)

      // Step 2: compose thresholded image on white background
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) { reject(new Error('no ctx')); return }
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, w, h)
      ctx.drawImage(alphaCanvas, 0, 0)

      canvas.toBlob(
        (b) => {
          if (b) { resolve({ result: b, opacityRatio: opaqueCount / (w * h) }) }
          else { reject(new Error('canvas export failed')) }
        },
        'image/webp',
        0.85,
      )
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('img load failed')) }
    img.src = url
  })
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), ms),
    ),
  ])
}

// ─── Types ────────────────────────────────────────────────────────────────────

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

// ─── Sub-components ───────────────────────────────────────────────────────────

function Spinner({ size = 'md' }: { size?: 'sm' | 'md' }) {
  const cls = size === 'sm'
    ? 'w-4 h-4 border-2'
    : 'w-5 h-5 border-2'
  return (
    <span className={`inline-block ${cls} border-primary/30 border-t-primary rounded-full animate-spin`} />
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

// ─── Main component ───────────────────────────────────────────────────────────

export function AgregarPrendaModal({ preferencia, onClose, onSaved }: Props) {
  const [step, setStep] = useState<Step>('capture')
  const [preview, setPreview] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [analysisLabel, setAnalysisLabel] = useState('Procesando...')
  const [quitarFondo, setQuitarFondo] = useState(true)
  const [badMaskNotice, setBadMaskNotice] = useState<string | null>(null)
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
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const galleryInputRef = useRef<HTMLInputElement>(null)
  const [, startTransition] = useTransition()

  // Preload bg-removal model as soon as modal opens
  useEffect(() => {
    void import('@imgly/background-removal')
      .then(({ preload }) => preload())
      .catch(() => {})
  }, [])

  const tiposDisponibles = form.categoria
    ? tiposPorCategoria(form.categoria, preferencia)
    : []

  function setCategoria(cat: Categoria) {
    setForm((f) => ({
      ...f,
      categoria: cat,
      tipo: f.tipo && tiposPorCategoria(cat, preferencia).some((t) => t.valor === f.tipo)
        ? f.tipo
        : null,
    }))
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    setBadMaskNotice(null)
    setStep('analyzing')

    let processedBlob: Blob
    // Compressed original (jpeg) — always sent to /api/etiquetar as image_original
    // so Claude sees faithful colors even when processedBlob has a white background.
    let compressedOriginal: Blob | null = null

    if (quitarFondo) {
      setAnalysisLabel('Recortando prenda...')
      // Start compressing original immediately so it runs in parallel with bg removal.
      const compressTask = imageCompression(file, {
        maxSizeMB: 0.5,
        maxWidthOrHeight: 1024,
        fileType: 'image/jpeg',
        useWebWorker: true,
      })
      try {
        const { removeBackground } = await import('@imgly/background-removal')
        const [noBg, compressed] = await Promise.all([
          withTimeout(
            removeBackground(file, {
              model: 'isnet',
              progress: (key: string, current: number, total: number) => {
                if (total > 0 && key.startsWith('fetch')) {
                  const pct = Math.round((current / total) * 100)
                  setAnalysisLabel(`Descargando modelo... ${pct}%`)
                } else {
                  setAnalysisLabel('Recortando prenda...')
                }
              },
            }),
            20_000,
          ),
          compressTask,
        ])
        compressedOriginal = compressed
        const { result, opacityRatio } = await composeOnWhite(noBg)
        if (opacityRatio < 0.15 || opacityRatio > 0.95) {
          // Bad mask: almost nothing or almost everything was cut. Use original.
          processedBlob = compressedOriginal
          setBadMaskNotice('No pudimos aislar bien la prenda — se guardó la foto original.')
        } else {
          processedBlob = result
        }
      } catch {
        compressedOriginal = await compressTask
        processedBlob = compressedOriginal
      }
    } else {
      processedBlob = await imageCompression(file, {
        maxSizeMB: 0.2,
        maxWidthOrHeight: 1024,
        fileType: 'image/webp',
        useWebWorker: true,
      })
    }

    const objectUrl = URL.createObjectURL(processedBlob)
    setPreview(objectUrl)

    setAnalysisLabel('Analizando prenda...')
    try {
      const fd = new FormData()
      fd.append('image', processedBlob, 'prenda.webp')
      // Send original separately so the server uses it for AI color detection.
      // Skip when compressedOriginal IS processedBlob (bad-mask fallback) to avoid duplication.
      if (compressedOriginal !== null && compressedOriginal !== processedBlob) {
        fd.append('image_original', compressedOriginal, 'original.jpg')
      }
      const res = await fetch('/api/etiquetar', { method: 'POST', body: fd })
      if (!res.ok) throw new Error('server error')
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
    form.foto_path && form.categoria && form.tipo && form.color_principal && form.estilo

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

  function handleClose() {
    // If a photo was uploaded but the prenda was never saved, delete the orphan file
    if (form.foto_path && step !== 'success') {
      deleteFotoHuerfana(form.foto_path).catch(() => null)
    }
    onClose()
  }

  function handleAgregarOtra() {
    setStep('capture')
    setPreview(null)
    setError(null)
    setBadMaskNotice(null)
    setAnalysisLabel('Procesando...')
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
    if (cameraInputRef.current) cameraInputRef.current.value = ''
    if (galleryInputRef.current) galleryInputRef.current.value = ''
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end p-3 md:justify-center md:p-6" role="dialog" aria-modal="true">
      <div
        className="absolute inset-0 bg-foreground/40 backdrop-blur-sm"
        onClick={handleClose}
        aria-hidden="true"
      />

      <div className="relative bg-background rounded-3xl overflow-hidden w-full max-w-lg mx-auto max-h-[92dvh] flex flex-col shadow-2xl animate-fade-up">
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
            onClick={step === 'success' ? onSaved : handleClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-muted text-muted-foreground transition-colors"
            aria-label="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 pb-8">

          {/* ── Step: capture ── */}
          {step === 'capture' && (
            <div className="flex flex-col py-6 gap-8">
              {/* Illustration */}
              <div className="flex flex-col items-center gap-3 pt-2">
                <div className="relative flex items-center justify-center">
                  <div className="w-36 h-36 rounded-full bg-accent/30" />
                  <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg"
                    className="absolute w-16 h-16 text-primary/60" aria-hidden="true">
                    <path d="M32 8C32 8 32 15 32 17C32 19.2 33.8 21 36 21C38.2 21 40 19.2 40 17"
                      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
                    <path d="M32 21L10 48H54L32 21Z" stroke="currentColor" strokeWidth="2.5"
                      strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                    <path d="M18 54H46" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
                    <path d="M18 48V54M46 48V54" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
                  </svg>
                </div>
                <div className="text-center">
                  <p className="text-lg font-light text-foreground"
                    style={{ fontFamily: 'var(--font-display)' }}>
                    ¿Qué prenda agregas?
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    La IA la etiquetará automáticamente
                  </p>
                </div>
              </div>

              {/* Hidden file inputs */}
              <input ref={cameraInputRef} type="file" accept="image/*" capture="environment"
                className="hidden" onChange={handleFileChange} />
              <input ref={galleryInputRef} type="file" accept="image/*"
                className="hidden" onChange={handleFileChange} />

              {/* Action buttons */}
              <div className="space-y-3">
                <button type="button" onClick={() => cameraInputRef.current?.click()}
                  className="w-full flex items-center gap-3 px-5 py-4 rounded-2xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 active:scale-[0.98] transition-all">
                  <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5 shrink-0" aria-hidden="true">
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"
                      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <circle cx="12" cy="13" r="4" stroke="currentColor" strokeWidth="2"/>
                  </svg>
                  <span>Tomar foto</span>
                </button>

                <button type="button" onClick={() => galleryInputRef.current?.click()}
                  className="w-full flex items-center gap-3 px-5 py-4 rounded-2xl border-2 border-border bg-card text-foreground text-sm font-medium hover:border-primary/40 hover:bg-accent/20 active:scale-[0.98] transition-all">
                  <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5 shrink-0 text-primary" aria-hidden="true">
                    <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="2"/>
                    <circle cx="8.5" cy="8.5" r="1.5" stroke="currentColor" strokeWidth="2"/>
                    <path d="m21 15-5-5L5 21" stroke="currentColor" strokeWidth="2"
                      strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <span>Elegir de galería</span>
                </button>

                {/* Toggle: quitar fondo */}
                <div className="flex items-center justify-between px-1 pt-2 border-t border-border">
                  <div>
                    <p className="text-sm font-medium text-foreground/80">Quitar fondo</p>
                    <p className="text-xs text-muted-foreground">Foto tipo catálogo sobre blanco</p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={quitarFondo}
                    onClick={() => setQuitarFondo((v) => !v)}
                    className={[
                      'relative w-11 h-6 rounded-full transition-colors duration-200 shrink-0',
                      quitarFondo ? 'bg-primary' : 'bg-border',
                    ].join(' ')}
                  >
                    <span className={[
                      'absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform duration-200',
                      quitarFondo ? 'translate-x-5' : 'translate-x-0',
                    ].join(' ')} />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── Step: analyzing ── */}
          {step === 'analyzing' && (
            <div className="flex flex-col items-center justify-center py-12 gap-5">
              {preview && (
                <div className="w-32 h-32 rounded-2xl overflow-hidden border border-border shadow-sm">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={preview} alt="Prenda" className="w-full h-full object-cover" />
                </div>
              )}
              {!preview && (
                <div className="w-32 h-32 rounded-2xl bg-muted animate-pulse" />
              )}
              <div className="flex flex-col items-center gap-2">
                <Spinner />
                <p className="text-sm text-foreground font-medium">{analysisLabel}</p>
                <p className="text-xs text-muted-foreground">Esto puede tardar unos segundos</p>
              </div>
            </div>
          )}

          {/* ── Step: form ── */}
          {(step === 'form' || step === 'saving') && (
            <form id="prenda-form" onSubmit={handleSubmit} className="space-y-6">
              {/* Preview thumbnail */}
              {preview && (
                <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-xl">
                  <div className="w-14 h-14 rounded-xl overflow-hidden border border-border shrink-0 bg-white">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={preview} alt="Prenda" className="w-full h-full object-cover" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-foreground">Foto lista</p>
                    <p className="text-xs text-muted-foreground">Revisa y ajusta las etiquetas</p>
                  </div>
                </div>
              )}

              {badMaskNotice && (
                <p className="text-xs text-amber-700 bg-amber-50 px-4 py-3 rounded-xl">
                  {badMaskNotice}
                </p>
              )}

              {error && (
                <p className="text-xs text-destructive bg-destructive/5 px-4 py-3 rounded-xl">
                  {error}
                </p>
              )}

              {/* Categoría */}
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground/80">Categoría</p>
                <ChipGroup options={CATEGORIAS} value={form.categoria} onChange={setCategoria}
                  cols={3}
                  renderPreview={(c) => { const Icon = CATEGORIA_ICONS[c]; return <Icon className="w-6 h-6" /> }}
                  renderLabel={(c) => CATEGORIA_LABELS[c]} />
              </div>

              {/* Tipo */}
              {form.categoria && tiposDisponibles.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground/80">Tipo de prenda</p>
                  <div className="grid grid-cols-3 gap-2">
                    {tiposDisponibles.map((t) => {
                      const selected = form.tipo === t.valor
                      return (
                        <button key={t.valor} type="button"
                          onClick={() => setForm((f) => ({ ...f, tipo: t.valor }))}
                          className={[
                            'rounded-xl border-2 px-2 py-2 text-center text-xs font-medium transition-all duration-150 active:scale-95',
                            selected
                              ? 'border-primary bg-primary/10 text-primary shadow-sm'
                              : 'border-border bg-card text-foreground/70 hover:border-primary/30',
                          ].join(' ')}
                          aria-pressed={selected}>
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
                    return (
                      <button key={c} type="button"
                        onClick={() => setForm((f) => ({ ...f, color_principal: c }))}
                        className={[
                          'flex items-center gap-1.5 rounded-xl border-2 px-2 py-2 text-xs font-medium transition-all duration-150 active:scale-95',
                          selected ? 'border-primary bg-primary/10 text-primary shadow-sm'
                            : 'border-border bg-card text-foreground/70 hover:border-primary/30',
                        ].join(' ')}
                        aria-pressed={selected} title={c}>
                        <span className="w-3.5 h-3.5 rounded-full shrink-0 border border-black/10"
                          style={colorBgStyle(c)} />
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
                  <button type="button" onClick={() => setForm((f) => ({ ...f, color_secundario: null }))}
                    className={[
                      'flex items-center gap-1.5 rounded-xl border-2 px-2 py-2 text-xs font-medium transition-all duration-150 active:scale-95',
                      form.color_secundario === null
                        ? 'border-primary bg-primary/10 text-primary shadow-sm'
                        : 'border-border bg-card text-foreground/70 hover:border-primary/30',
                    ].join(' ')}
                    aria-pressed={form.color_secundario === null}>
                    <span className="w-3.5 h-3.5 rounded-full shrink-0 border border-dashed border-muted-foreground/50" />
                    <span className="leading-tight">Ninguno</span>
                  </button>
                  {COLORES.map((c) => {
                    const selected = form.color_secundario === c
                    return (
                      <button key={c} type="button"
                        onClick={() => setForm((f) => ({ ...f, color_secundario: c }))}
                        className={[
                          'flex items-center gap-1.5 rounded-xl border-2 px-2 py-2 text-xs font-medium transition-all duration-150 active:scale-95',
                          selected ? 'border-primary bg-primary/10 text-primary shadow-sm'
                            : 'border-border bg-card text-foreground/70 hover:border-primary/30',
                        ].join(' ')}
                        aria-pressed={selected} title={c}>
                        <span className="w-3.5 h-3.5 rounded-full shrink-0 border border-black/10"
                          style={colorBgStyle(c)} />
                        <span className="truncate leading-tight capitalize">{c}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Estilo */}
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground/80">Estilo</p>
                <ChipGroup options={ESTILOS} value={form.estilo}
                  onChange={(v) => setForm((f) => ({ ...f, estilo: v }))}
                  cols={2} renderLabel={(v) => ESTILO_LABELS[v]} />
              </div>

              {/* Temporada */}
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground/80">Temporada</p>
                <ChipGroup options={TEMPORADAS} value={form.temporada}
                  onChange={(v) => setForm((f) => ({ ...f, temporada: v }))}
                  cols={3} renderLabel={(v) => TEMPORADA_LABELS[v]} />
              </div>

              {/* Estampado */}
              <div className="flex items-center justify-between py-3 border-t border-border">
                <div>
                  <p className="text-sm font-medium text-foreground/80">Tiene estampado</p>
                  <p className="text-xs text-muted-foreground">Rayas, flores, logos, etc.</p>
                </div>
                <button type="button" role="switch" aria-checked={form.estampado}
                  onClick={() => setForm((f) => ({ ...f, estampado: !f.estampado }))}
                  className={[
                    'relative w-11 h-6 rounded-full transition-colors duration-200',
                    form.estampado ? 'bg-primary' : 'bg-border',
                  ].join(' ')}>
                  <span className={[
                    'absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform duration-200',
                    form.estampado ? 'translate-x-5' : 'translate-x-0',
                  ].join(' ')} />
                </button>
              </div>

              {/* Submit */}
              <button type="submit" disabled={!isFormValid || step === 'saving'}
                className="w-full flex items-center justify-center gap-2 px-5 py-4 rounded-xl bg-primary text-primary-foreground text-sm font-semibold transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed">
                {step === 'saving' ? <><Spinner size="sm" />Guardando...</> : 'Guardar prenda →'}
              </button>
            </form>
          )}

          {/* ── Step: success ── */}
          {step === 'success' && (
            <div className="flex flex-col items-center py-10 gap-6">
              {preview && (
                <div className="w-28 h-28 rounded-2xl overflow-hidden border-2 border-primary/20 shadow-md bg-white">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={preview} alt="Prenda guardada" className="w-full h-full object-cover" />
                </div>
              )}
              <div className="text-center">
                <div className="flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 mx-auto mb-3">
                  <Check className="w-6 h-6 text-primary" />
                </div>
                <p className="text-base font-medium text-foreground">
                  {form.tipo ? form.tipo.replace(/_/g, ' ') : 'Prenda'} guardada
                </p>
                <p className="text-sm text-muted-foreground mt-1">Ya aparece en tu clóset</p>
              </div>
              <div className="flex flex-col gap-3 w-full">
                <button type="button" onClick={handleAgregarOtra}
                  className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl border-2 border-dashed border-border text-sm font-medium text-foreground/70 hover:border-primary/40 hover:bg-accent/20 transition-all active:scale-95">
                  <Plus className="w-4 h-4" />
                  Agregar otra prenda
                </button>
                <button type="button" onClick={onSaved}
                  className="w-full px-5 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 active:scale-95 transition-all">
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
