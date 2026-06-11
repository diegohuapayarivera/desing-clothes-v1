'use client'

import { useState, useEffect, useCallback } from 'react'
import { obtenerClima } from '@/lib/clima'
import { filtrarCandidatas } from '@/lib/recomendador'
import {
  OCASION_LABELS,
  OCASION_EMOJI,
  NIVEL_CLIMA_LABELS,
  NIVEL_CLIMA_EMOJI,
} from '@/lib/recomendador'
import type { Ocasion, NivelClima } from '@/lib/recomendador'
import type { PrendaConUrl, Outfit } from '@/types'
import { saveGeoLocation } from '@/app/closet/actions'

type Step = 'ocasion' | 'clima' | 'cargando' | 'resultado' | 'error'

const OCASIONES: Ocasion[] = ['trabajo', 'casual', 'noche', 'formal', 'deporte']
const NIVELES_CLIMA: NivelClima[] = ['frio', 'templado', 'calor']

const LOADER_MSGS = [
  'Revisando tu clóset...',
  'Combinando colores...',
  'Armando tu look...',
  'Eligiendo accesorios...',
  'Casi listo...',
]

// Category ordering for collage
const CAT_ORDER: Record<string, number> = {
  cuerpo_completo: 0,
  superior: 1,
  inferior: 2,
  abrigo: 3,
  calzado: 4,
  accesorio: 5,
}

interface Props {
  prendas: PrendaConUrl[]
  ciudad: string | null
  profileLat: number | null
  profileLon: number | null
  onClose: () => void
}

interface OutfitConPrendas extends Outfit {
  prendas: PrendaConUrl[]
}

function OutfitCollage({ prendas }: { prendas: PrendaConUrl[] }) {
  const sorted = [...prendas].sort((a, b) => (CAT_ORDER[a.categoria] ?? 9) - (CAT_ORDER[b.categoria] ?? 9))

  const main = sorted.filter((p) =>
    ['superior', 'cuerpo_completo', 'inferior'].includes(p.categoria),
  )
  const extras = sorted.filter((p) =>
    ['calzado', 'abrigo', 'accesorio'].includes(p.categoria),
  )

  return (
    <div className="flex gap-1.5 w-full rounded-xl overflow-hidden bg-muted" style={{ aspectRatio: '4/3' }}>
      {/* Main column */}
      <div className="flex flex-col gap-1.5 flex-[3] min-w-0">
        {main.map((p) => (
          <div key={p.id} className="relative flex-1 overflow-hidden rounded-lg bg-white">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={p.signedUrl}
              alt={p.tipo}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          </div>
        ))}
        {main.length === 0 && <div className="flex-1 bg-muted rounded-lg" />}
      </div>

      {/* Side column */}
      {extras.length > 0 && (
        <div className="flex flex-col gap-1.5 flex-[2] min-w-0">
          {extras.map((p) => (
            <div key={p.id} className="relative flex-1 overflow-hidden rounded-lg bg-white">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.signedUrl}
                alt={p.tipo}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function OutfitCard({
  outfit,
  index,
  onLike,
  onRefresh,
  refreshing,
}: {
  outfit: OutfitConPrendas
  index: number
  onLike: () => void
  onRefresh: () => void
  refreshing: boolean
}) {
  return (
    <div className="bg-card rounded-2xl border border-border overflow-hidden shadow-sm">
      <div className="p-3">
        <OutfitCollage prendas={outfit.prendas} />
      </div>

      <div className="px-4 pb-4">
        <p className="text-xs text-muted-foreground leading-relaxed mb-3 italic">
          {outfit.justificacion}
        </p>

        {/* Prenda labels */}
        <div className="flex flex-wrap gap-1 mb-3">
          {outfit.prendas.map((p) => (
            <span
              key={p.id}
              className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full capitalize"
            >
              {p.tipo.replace(/_/g, ' ')}
            </span>
          ))}
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onLike}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border border-border bg-background text-sm font-medium text-foreground hover:bg-accent/50 transition-colors active:scale-95"
            aria-label="Me encanta este conjunto"
          >
            <span aria-hidden="true">❤️</span>
            <span>Me encanta</span>
          </button>
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border border-border bg-background text-sm font-medium text-foreground hover:bg-accent/50 transition-colors active:scale-95 disabled:opacity-50"
            aria-label="Ver otra opción"
          >
            <span aria-hidden="true" className={refreshing ? 'animate-spin inline-block' : ''}>
              🔄
            </span>
            <span>{refreshing ? 'Buscando...' : 'Otra opción'}</span>
          </button>
        </div>
      </div>
    </div>
  )
}

export function RecomendarModal({ prendas, ciudad, profileLat, profileLon, onClose }: Props) {
  const [step, setStep] = useState<Step>('ocasion')
  const [ocasion, setOcasion] = useState<Ocasion | null>(null)
  const [nivelClima, setNivelClima] = useState<NivelClima | null>(null)
  const [climaDetectado, setClimaDetectado] = useState<{ nivel: NivelClima; temp: number } | null>(null)
  const [climaLoading, setClimaLoading] = useState(false)
  const [loaderMsg, setLoaderMsg] = useState(LOADER_MSGS[0])
  const [outfits, setOutfits] = useState<OutfitConPrendas[]>([])
  const [errorMsg, setErrorMsg] = useState('')
  const [refreshingIdx, setRefreshingIdx] = useState<number | null>(null)
  const [toast, setToast] = useState('')

  const prendasById = new Map(prendas.map((p) => [p.id, p]))

  // Rotate loader messages
  useEffect(() => {
    if (step !== 'cargando') return
    let i = 0
    const iv = setInterval(() => {
      i = (i + 1) % LOADER_MSGS.length
      setLoaderMsg(LOADER_MSGS[i])
    }, 1800)
    return () => clearInterval(iv)
  }, [step])

  // Start clima detection when entering clima step
  useEffect(() => {
    if (step !== 'clima') return
    setClimaLoading(true)
    obtenerClima(ciudad, profileLat, profileLon)
      .then((result) => {
        setClimaDetectado({ nivel: result.nivelClima, temp: result.tempMax })
        setNivelClima((prev) => prev ?? result.nivelClima)
        // Save lat/lon to profile if obtained from geolocation
        if (profileLat == null && profileLon == null) {
          void saveGeoLocation(result.lat, result.lon)
        }
      })
      .catch(() => {
        setClimaDetectado({ nivel: 'templado', temp: 20 })
        setNivelClima((prev) => prev ?? 'templado')
      })
      .finally(() => setClimaLoading(false))
  }, [step, ciudad, profileLat, profileLon])

  const buildOutfitCon = useCallback(
    (raw: Outfit[]): OutfitConPrendas[] =>
      raw.map((o) => ({
        ...o,
        prendas: o.prenda_ids.map((id) => prendasById.get(id)).filter(Boolean) as PrendaConUrl[],
      })),
    // prendasById is rebuilt from prendas on each render; use prendas as dep
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [prendas],
  )

  async function recomendar(avoid?: string[][]) {
    if (!ocasion || !nivelClima) return
    setStep('cargando')
    setLoaderMsg(LOADER_MSGS[0])

    const { candidatas, error } = filtrarCandidatas(prendas, ocasion, nivelClima)
    if (error) {
      setErrorMsg(error)
      setStep('error')
      return
    }

    const body = {
      prendas: candidatas.map(({ id, tipo, categoria, color_principal, color_secundario, estilo, estampado }) => ({
        id,
        tipo,
        categoria,
        color_principal,
        color_secundario: color_secundario ?? null,
        estilo,
        estampado,
      })),
      ocasion,
      clima: nivelClima,
      avoid,
    }

    try {
      const res = await fetch('/api/recomendar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = (await res.json()) as { outfits?: Outfit[]; error?: string }

      if (!res.ok || !data.outfits) {
        setErrorMsg(data.error ?? 'Error inesperado. Intenta de nuevo.')
        setStep('error')
        return
      }

      setOutfits(buildOutfitCon(data.outfits))
      setStep('resultado')
    } catch {
      setErrorMsg('Ocurrió un problema de red. Intenta de nuevo.')
      setStep('error')
    }
  }

  async function refreshOutfit(idx: number) {
    if (!ocasion || !nivelClima) return
    setRefreshingIdx(idx)

    const avoidIds = outfits[idx]?.prenda_ids ?? []
    const body = {
      prendas: prendas.map(({ id, tipo, categoria, color_principal, color_secundario, estilo, estampado }) => ({
        id,
        tipo,
        categoria,
        color_principal,
        color_secundario: color_secundario ?? null,
        estilo,
        estampado,
      })),
      ocasion,
      clima: nivelClima,
      avoid: [avoidIds],
    }

    try {
      const res = await fetch('/api/recomendar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = (await res.json()) as { outfits?: Outfit[]; error?: string }
      if (res.ok && data.outfits && data.outfits.length > 0) {
        const [nuevo] = buildOutfitCon(data.outfits)
        setOutfits((prev) => prev.map((o, i) => (i === idx ? nuevo : o)))
      }
    } catch {}

    setRefreshingIdx(null)
  }

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sheet */}
      <div
        className="fixed inset-x-0 bottom-0 z-50 max-w-lg mx-auto bg-background rounded-t-3xl shadow-xl flex flex-col"
        style={{ maxHeight: '92dvh' }}
        role="dialog"
        aria-modal="true"
        aria-label="¿Qué me pongo hoy?"
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full bg-border" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pb-4 shrink-0">
          <h2
            className="text-xl font-light"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            {step === 'resultado' ? 'Tu look de hoy ✦' : '¿Qué me pongo hoy?'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-muted-foreground hover:bg-border transition-colors"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        {/* Body — scrollable */}
        <div className="flex-1 overflow-y-auto px-5 pb-8">

          {/* ── STEP: OCASION ── */}
          {step === 'ocasion' && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground mb-4">
                ¿Para qué ocasión te vas a vestir hoy?
              </p>
              <div className="grid grid-cols-1 gap-2.5">
                {OCASIONES.map((oc) => (
                  <button
                    key={oc}
                    type="button"
                    onClick={() => {
                      setOcasion(oc)
                      setStep('clima')
                    }}
                    className="flex items-center gap-4 px-5 py-4 rounded-2xl border-2 border-border bg-card hover:border-primary/60 hover:bg-accent/30 transition-all active:scale-[0.98] text-left"
                  >
                    <span className="text-2xl">{OCASION_EMOJI[oc]}</span>
                    <span className="text-sm font-medium">{OCASION_LABELS[oc]}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── STEP: CLIMA ── */}
          {step === 'clima' && ocasion && (
            <div className="space-y-5">
              <div>
                <p className="text-sm text-muted-foreground mb-1">
                  Ocasión elegida: <span className="font-medium text-foreground">{OCASION_EMOJI[ocasion]} {OCASION_LABELS[ocasion]}</span>
                </p>
                <p className="text-sm text-muted-foreground">¿Cómo está el clima hoy?</p>
              </div>

              {/* Auto-detected badge */}
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {climaLoading ? (
                  <>
                    <span className="inline-block w-3 h-3 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                    <span>Detectando clima...</span>
                  </>
                ) : climaDetectado ? (
                  <>
                    <span>📍</span>
                    <span>
                      Temperatura máxima del día: <strong>{Math.round(climaDetectado.temp)}°C</strong>
                      {' — '}sugerencia preseleccionada
                    </span>
                  </>
                ) : null}
              </div>

              {/* Clima chips */}
              <div className="grid grid-cols-3 gap-2.5">
                {NIVELES_CLIMA.map((nivel) => {
                  const active = nivelClima === nivel
                  return (
                    <button
                      key={nivel}
                      type="button"
                      onClick={() => setNivelClima(nivel)}
                      className={[
                        'flex flex-col items-center gap-1 py-4 rounded-2xl border-2 transition-all active:scale-[0.97]',
                        active
                          ? 'border-primary bg-primary/8 text-primary'
                          : 'border-border bg-card text-foreground/70 hover:border-primary/40',
                      ].join(' ')}
                    >
                      <span className="text-xl">{NIVEL_CLIMA_EMOJI[nivel]}</span>
                      <span className="text-xs font-medium">{NIVEL_CLIMA_LABELS[nivel]}</span>
                    </button>
                  )
                })}
              </div>

              {/* CTA */}
              <button
                type="button"
                disabled={!nivelClima}
                onClick={() => void recomendar()}
                className="w-full py-4 rounded-2xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                ✨ Recomiéndame un look
              </button>

              <button
                type="button"
                onClick={() => setStep('ocasion')}
                className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                ← Cambiar ocasión
              </button>
            </div>
          )}

          {/* ── STEP: CARGANDO ── */}
          {step === 'cargando' && (
            <div className="flex flex-col items-center justify-center py-16 gap-6">
              <div className="w-14 h-14 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
              <p
                className="text-lg font-light text-center"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                {loaderMsg}
              </p>
            </div>
          )}

          {/* ── STEP: ERROR ── */}
          {step === 'error' && (
            <div className="flex flex-col items-center text-center py-12 gap-4">
              <span className="text-4xl">🔍</span>
              <p className="text-sm font-medium text-foreground">{errorMsg}</p>
              <div className="flex gap-2 flex-col w-full mt-2">
                <button
                  type="button"
                  onClick={() => void recomendar()}
                  className="w-full py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
                >
                  Intentar de nuevo
                </button>
                <button
                  type="button"
                  onClick={() => { setStep('clima'); setNivelClima(null); setClimaDetectado(null) }}
                  className="w-full py-3 rounded-xl border border-border text-sm text-foreground hover:bg-muted transition-colors"
                >
                  Cambiar filtros
                </button>
              </div>
            </div>
          )}

          {/* ── STEP: RESULTADO ── */}
          {step === 'resultado' && (
            <div className="space-y-4">
              {outfits.map((outfit, i) => (
                <OutfitCard
                  key={outfit.prenda_ids.join('-')}
                  outfit={outfit}
                  index={i}
                  onLike={() => showToast('¡Guardado próximamente! 💕')}
                  onRefresh={() => void refreshOutfit(i)}
                  refreshing={refreshingIdx === i}
                />
              ))}

              <button
                type="button"
                onClick={() => void recomendar(outfits.map((o) => o.prenda_ids))}
                className="w-full py-4 rounded-2xl border-2 border-dashed border-primary/40 text-sm font-medium text-primary hover:bg-primary/5 transition-colors active:scale-[0.98]"
              >
                🔀 Generar de nuevo
              </button>

              <button
                type="button"
                onClick={() => { setStep('ocasion'); setOcasion(null); setNivelClima(null); setClimaDetectado(null) }}
                className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors pb-2"
              >
                ← Empezar de nuevo
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-24 inset-x-4 max-w-sm mx-auto z-[60] bg-foreground text-background text-sm px-4 py-3 rounded-xl shadow-lg text-center animate-fade-up">
          {toast}
        </div>
      )}
    </>
  )
}
