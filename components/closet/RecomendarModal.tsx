'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { obtenerClima } from '@/lib/clima'
import { OCASION_LABELS, OCASION_EMOJI, NIVEL_CLIMA_LABELS, NIVEL_CLIMA_EMOJI } from '@/lib/recomendador'
import type { Ocasion, NivelClima } from '@/lib/recomendador'
import type { PrendaConUrl, Outfit, MotivoFeedback } from '@/types'
import { saveGeoLocation, saveConjunto, saveFeedback, registrarOutfitUsado } from '@/app/closet/actions'
import { OutfitCollage } from './OutfitCollage'

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

const MOTIVOS: { value: MotivoFeedback; label: string }[] = [
  { value: 'colores', label: 'Los colores no combinan' },
  { value: 'muy_formal', label: 'Muy formal' },
  { value: 'muy_informal', label: 'Muy informal' },
  { value: 'muy_simple', label: 'Muy simple' },
]

interface Props {
  prendas: PrendaConUrl[]
  ciudad: string | null
  profileLat: number | null
  profileLon: number | null
  onClose: () => void
}

interface OutfitConPrendas extends Outfit {
  prendas: PrendaConUrl[]
  liked?: boolean
  discarded?: string[]
  registradoHoy?: boolean
  uid: string
}

function ClimaInfo({ loading, detectado }: Readonly<{ loading: boolean; detectado: { nivel: NivelClima; temp: number } | null }>) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="inline-block w-3 h-3 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        <span>Detectando clima...</span>
      </div>
    )
  }
  if (detectado) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>📍</span>
        <span>
          Temperatura máxima del día: <strong>{Math.round(detectado.temp)}°C</strong>
          {' — '}sugerencia preseleccionada
        </span>
      </div>
    )
  }
  return null
}

function MotivoSheet({ onSelect }: Readonly<{ onSelect: (motivo: MotivoFeedback | null) => void }>) {
  return (
    <>
      <div
        className="fixed inset-0 z-55"
        onClick={() => onSelect(null)}
        aria-hidden="true"
      />
      <div
        className="fixed inset-x-0 bottom-0 z-56 max-w-lg mx-auto bg-background rounded-t-2xl shadow-2xl px-5 pt-5 pb-8"
        role="dialog"
        aria-label="¿Por qué no te convence?"
      >
        <div className="flex justify-center mb-4">
          <div className="w-8 h-1 rounded-full bg-border" />
        </div>
        <p className="text-sm font-medium text-center mb-4 text-foreground">¿Por qué no te convence?</p>
        <div className="grid grid-cols-2 gap-2 mb-3">
          {MOTIVOS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => onSelect(value)}
              className="py-3 px-3 rounded-xl border border-border bg-card text-sm text-center hover:bg-accent/50 active:scale-95 transition-all"
            >
              {label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => onSelect(null)}
          className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors py-2"
        >
          Saltar
        </button>
      </div>
    </>
  )
}

function OutfitCard({
  outfit,
  ocasion,
  nivelClima,
  onLike,
  onRefresh,
  onRemovePrenda,
  onRegistrarHoy,
  refreshing,
  replacingPrendaId,
}: Readonly<{
  outfit: OutfitConPrendas
  ocasion: Ocasion
  nivelClima: NivelClima
  onLike: () => void
  onRefresh: () => void
  onRemovePrenda: (prendaId: string) => void
  onRegistrarHoy: () => void
  refreshing: boolean
  replacingPrendaId?: string
}>) {
  const likeClass = outfit.liked
    ? 'border-primary/40 bg-primary/8 text-primary'
    : 'border-border bg-background text-foreground hover:bg-accent/50'

  const busy = refreshing || !!replacingPrendaId

  return (
    <div className="bg-card rounded-2xl border border-border overflow-hidden shadow-sm">
      <div className="p-3">
        <OutfitCollage
          prendas={outfit.prendas}
          onRemovePrenda={onRemovePrenda}
          replacingPrendaId={replacingPrendaId}
        />
      </div>

      <div className="px-4 pb-4">
        <p className="text-xs text-muted-foreground leading-relaxed mb-3 italic">
          {outfit.justificacion}
        </p>

        <div className="flex flex-wrap gap-1 mb-3">
          {outfit.prendas.map((p) => (
            <span
              key={p.id}
              className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full capitalize"
            >
              {p.tipo.replaceAll('_', ' ')}
            </span>
          ))}
        </div>

        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-muted-foreground">
            {OCASION_EMOJI[ocasion]} {OCASION_LABELS[ocasion]} · {NIVEL_CLIMA_EMOJI[nivelClima]} {NIVEL_CLIMA_LABELS[nivelClima]}
          </span>
        </div>

        <div className="flex gap-2 mb-2">
          <button
            type="button"
            onClick={onLike}
            disabled={busy}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border text-sm font-medium transition-all active:scale-95 disabled:opacity-50 ${likeClass}`}
            aria-label="Me encanta este conjunto"
          >
            <span aria-hidden="true">{outfit.liked ? '❤️' : '🤍'}</span>
            <span>{outfit.liked ? 'Guardado' : 'Me encanta'}</span>
          </button>
          <button
            type="button"
            onClick={onRefresh}
            disabled={busy}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border border-border bg-background text-sm font-medium text-foreground hover:bg-accent/50 transition-colors active:scale-95 disabled:opacity-50"
            aria-label="Ver otra opción"
          >
            <span aria-hidden="true" className={refreshing ? 'animate-spin inline-block' : ''}>
              🔄
            </span>
            <span>{refreshing ? 'Buscando...' : 'Otra opción'}</span>
          </button>
        </div>
        {outfit.registradoHoy ? (
          <p className="text-xs text-center text-muted-foreground">✓ Registrado para hoy</p>
        ) : (
          <button
            type="button"
            onClick={onRegistrarHoy}
            disabled={busy}
            className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl border border-border bg-background text-sm text-foreground hover:bg-accent/50 transition-colors active:scale-95 disabled:opacity-50"
          >
            <span>👕</span> Me lo pongo hoy
          </button>
        )}
      </div>
    </div>
  )
}

export function RecomendarModal({ prendas, ciudad, profileLat, profileLon, onClose }: Readonly<Props>) {
  const router = useRouter()
  const [step, setStep] = useState<Step>('ocasion')
  const [ocasion, setOcasion] = useState<Ocasion | null>(null)
  const [nivelClima, setNivelClima] = useState<NivelClima | null>(null)
  const [climaDetectado, setClimaDetectado] = useState<{ nivel: NivelClima; temp: number } | null>(null)
  const climaLoading = step === 'clima' && climaDetectado === null
  const [loaderMsg, setLoaderMsg] = useState(LOADER_MSGS[0])
  const [outfits, setOutfits] = useState<OutfitConPrendas[]>([])
  const [errorMsg, setErrorMsg] = useState('')
  const [refreshingIdx, setRefreshingIdx] = useState<number | null>(null)
  const [replacingInfo, setReplacingInfo] = useState<{ outfitIdx: number; prendaId: string } | null>(null)
  const [pendingRefreshIdx, setPendingRefreshIdx] = useState<number | null>(null)
  const [toast, setToast] = useState('')

  const prendasById = new Map(prendas.map((p) => [p.id, p]))

  async function handleRegistrarHoy(idx: number) {
    const outfit = outfits[idx]
    if (!outfit || !ocasion) return
    const today = new Date().toISOString().split('T')[0]
    const result = await registrarOutfitUsado({
      prenda_ids: outfit.prenda_ids,
      fecha: today,
      ocasion,
      force: true,
    })
    if (!result.error) {
      setOutfits((prev) => prev.map((o, i) => i === idx ? { ...o, registradoHoy: true } : o))
    }
  }

  useEffect(() => {
    if (step !== 'cargando') return
    let i = 0
    const iv = setInterval(() => {
      i = (i + 1) % LOADER_MSGS.length
      setLoaderMsg(LOADER_MSGS[i])
    }, 1800)
    return () => clearInterval(iv)
  }, [step])

  useEffect(() => {
    if (step !== 'clima' || climaDetectado !== null) return
    obtenerClima(ciudad, profileLat, profileLon)
      .then((result) => {
        setClimaDetectado({ nivel: result.nivelClima, temp: result.tempMax })
        setNivelClima((prev) => prev ?? result.nivelClima)
        if (profileLat == null && profileLon == null) {
          saveGeoLocation(result.lat, result.lon).catch(() => null)
        }
      })
      .catch(() => {
        setClimaDetectado({ nivel: 'templado', temp: 20 })
        setNivelClima((prev) => prev ?? 'templado')
      })
  }, [step, climaDetectado, ciudad, profileLat, profileLon])

  const buildOutfitCon = useCallback(
    (raw: Outfit[]): OutfitConPrendas[] =>
      raw.map((o) => ({
        ...o,
        uid: crypto.randomUUID(),
        prendas: o.prenda_ids.map((id) => prendasById.get(id)).filter((p): p is PrendaConUrl => p != null),
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [prendas],
  )

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  async function recomendar(avoid?: string[][]) {
    if (!ocasion || !nivelClima) return
    setStep('cargando')
    setLoaderMsg(LOADER_MSGS[0])

    try {
      const res = await fetch('/api/recomendar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ocasion, clima: nivelClima, avoid }),
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

  // Full outfit refresh — triggered after MotivoSheet selection
  async function refreshOutfit(idx: number, motivo?: MotivoFeedback | null) {
    if (!ocasion || !nivelClima) return
    setRefreshingIdx(idx)

    const currentOutfit = outfits[idx]
    const avoidIds = currentOutfit?.prenda_ids ?? []

    saveFeedback({ prenda_ids: avoidIds, ocasion, clima: nivelClima, accion: 'regenerado', motivo }).catch(() => null)

    try {
      const res = await fetch('/api/recomendar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ocasion,
          clima: nivelClima,
          avoid: [avoidIds],
          ...(motivo ? { motivo } : {}),
        }),
      })
      const data = (await res.json()) as { outfits?: Outfit[]; error?: string }
      if (res.ok && data.outfits && data.outfits.length > 0) {
        const [nuevo] = buildOutfitCon(data.outfits)
        setOutfits((prev) => prev.map((o, i) => (i === idx ? { ...nuevo, discarded: [] } : o)))
      }
    } catch {}

    setRefreshingIdx(null)
  }

  // Surgical single-prenda replacement
  async function replacePrenda(outfitIdx: number, prendaId: string) {
    if (!ocasion || !nivelClima) return
    const outfit = outfits[outfitIdx]
    if (!outfit) return

    setReplacingInfo({ outfitIdx, prendaId })

    saveFeedback({
      prenda_ids: [prendaId],
      ocasion,
      clima: nivelClima,
      accion: 'descartado',
      motivo: 'prenda_puntual',
    }).catch(() => null)

    const previouslyDiscarded = outfit.discarded ?? []

    try {
      const res = await fetch('/api/recomendar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ocasion,
          clima: nivelClima,
          mode: 'replace',
          outfit_actual: outfit.prenda_ids,
          prenda_descartada: prendaId,
          excludePrendaIds: previouslyDiscarded,
        }),
      })
      const data = (await res.json()) as { outfits?: Outfit[]; error?: string }
      if (res.ok && data.outfits && data.outfits.length > 0) {
        const [nuevo] = buildOutfitCon(data.outfits)
        setOutfits((prev) =>
          prev.map((o, i) =>
            i === outfitIdx
              ? { ...nuevo, uid: o.uid, discarded: [...previouslyDiscarded, prendaId] }
              : o,
          ),
        )
      } else {
        showToast(data.error ?? 'No se pudo reemplazar la prenda.')
      }
    } catch {
      showToast('Error de red. Intenta de nuevo.')
    }

    setReplacingInfo(null)
  }

  async function handleMotivoSelect(motivo: MotivoFeedback | null) {
    const idx = pendingRefreshIdx
    setPendingRefreshIdx(null)
    if (idx === null) return
    await refreshOutfit(idx, motivo)
  }

  async function handleLike(idx: number) {
    if (!ocasion || !nivelClima) return
    const outfit = outfits[idx]
    if (!outfit || outfit.liked) return

    const result = await saveConjunto({
      prenda_ids: outfit.prenda_ids,
      ocasion,
      clima: nivelClima,
      justificacion: outfit.justificacion,
    })

    if (result.error) {
      showToast('Error al guardar. Intenta de nuevo.')
      return
    }

    setOutfits((prev) => prev.map((o, i) => (i === idx ? { ...o, liked: true } : o)))
    showToast('¡Guardado en Mis conjuntos! ❤️')
    router.refresh()
  }

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        className="fixed inset-x-0 bottom-0 z-50 max-w-lg mx-auto bg-background rounded-t-3xl shadow-xl flex flex-col"
        style={{ maxHeight: '92dvh' }}
        role="dialog"
        aria-modal="true"
        aria-label="¿Qué me pongo hoy?"
      >
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full bg-border" />
        </div>

        <div className="flex items-center justify-between px-5 pb-4 shrink-0">
          <h2 className="text-xl font-light" style={{ fontFamily: 'var(--font-display)' }}>
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

        <div className="flex-1 overflow-y-auto px-5 pb-8">

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
                    onClick={() => { setOcasion(oc); setStep('clima') }}
                    className="flex items-center gap-4 px-5 py-4 rounded-2xl border-2 border-border bg-card hover:border-primary/60 hover:bg-accent/30 transition-all active:scale-[0.98] text-left"
                  >
                    <span className="text-2xl">{OCASION_EMOJI[oc]}</span>
                    <span className="text-sm font-medium">{OCASION_LABELS[oc]}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 'clima' && ocasion && (
            <div className="space-y-5">
              <div>
                <p className="text-sm text-muted-foreground mb-1">
                  Ocasión elegida:{' '}
                  <span className="font-medium text-foreground">
                    {OCASION_EMOJI[ocasion]} {OCASION_LABELS[ocasion]}
                  </span>
                </p>
                <p className="text-sm text-muted-foreground">¿Cómo está el clima hoy?</p>
              </div>

              <ClimaInfo loading={climaLoading} detectado={climaDetectado} />

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

              <button
                type="button"
                disabled={!nivelClima}
                onClick={() => recomendar().catch(() => null)}
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

          {step === 'cargando' && (
            <div className="flex flex-col items-center justify-center py-16 gap-6">
              <div className="w-14 h-14 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
              <p className="text-lg font-light text-center" style={{ fontFamily: 'var(--font-display)' }}>
                {loaderMsg}
              </p>
            </div>
          )}

          {step === 'error' && (
            <div className="flex flex-col items-center text-center py-12 gap-4">
              <span className="text-4xl">🔍</span>
              <p className="text-sm font-medium text-foreground">{errorMsg}</p>
              <div className="flex gap-2 flex-col w-full mt-2">
                <button
                  type="button"
                  onClick={() => recomendar().catch(() => null)}
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

          {step === 'resultado' && ocasion && nivelClima && (
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground">
                Toca ✕ en una prenda para sustituirla · 🔄 para otro conjunto completo.
              </p>
              {outfits.map((outfit, i) => (
                <OutfitCard
                  key={outfit.uid}
                  outfit={outfit}
                  ocasion={ocasion}
                  nivelClima={nivelClima}
                  onLike={() => handleLike(i).catch(() => null)}
                  onRefresh={() => setPendingRefreshIdx(i)}
                  onRemovePrenda={(prendaId) => replacePrenda(i, prendaId).catch(() => null)}
                  onRegistrarHoy={() => handleRegistrarHoy(i).catch(() => null)}
                  refreshing={refreshingIdx === i}
                  replacingPrendaId={replacingInfo?.outfitIdx === i ? replacingInfo.prendaId : undefined}
                />
              ))}

              <button
                type="button"
                onClick={() => recomendar(outfits.map((o) => o.prenda_ids)).catch(() => null)}
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

      {toast && (
        <div className="fixed bottom-24 inset-x-4 max-w-sm mx-auto z-60 bg-foreground text-background text-sm px-4 py-3 rounded-xl shadow-lg text-center animate-fade-up">
          {toast}
        </div>
      )}

      {pendingRefreshIdx !== null && (
        <MotivoSheet onSelect={(m) => handleMotivoSelect(m).catch(() => null)} />
      )}
    </>
  )
}
