'use client'

import { useState, useMemo, useRef, useTransition } from 'react'
import { X, Heart, Shirt, CalendarDays, ChartNoAxesColumn, ChevronLeft, ChevronRight, Plus, Trash2 } from 'lucide-react'
import { OutfitCollage } from './OutfitCollage'
import {
  registrarOutfitUsado,
  updateOutfitUsado,
  deleteOutfitUsado,
  fetchOutfitsUsadosMes,
  fetchOutfitsUsadosRango,
} from '@/app/closet/actions'
import type { OutfitUsado, PrendaConUrl, Conjunto } from '@/types'

interface Props {
  outfitsUsados: OutfitUsado[]
  prendas: PrendaConUrl[]
  conjuntos: Conjunto[]
  initialYear: number
  initialMonth: number
}

// ── Helpers ────────────────────────────────────────────────────────────────

function toDateStr(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function todayStr(): string {
  return new Date().toISOString().split('T')[0]
}

function thirtyDaysAgoStr(): string {
  const d = new Date()
  d.setDate(d.getDate() - 30)
  return d.toISOString().split('T')[0]
}

function sixtyDaysAgoStr(): string {
  const d = new Date()
  d.setDate(d.getDate() - 60)
  return d.toISOString().split('T')[0]
}

function buildMapMulti(list: OutfitUsado[]): Map<string, OutfitUsado[]> {
  const map = new Map<string, OutfitUsado[]>()
  for (const o of list) {
    const arr = map.get(o.fecha) ?? []
    arr.push(o)
    map.set(o.fecha, arr)
  }
  return map
}

function getCalendarCells(year: number, month: number): (string | null)[] {
  const firstDay = new Date(year, month, 1)
  const startPad = (firstDay.getDay() + 6) % 7
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: (string | null)[] = []
  for (let i = 0; i < startPad; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(toDateStr(year, month, d))
  while (cells.length < 42) cells.push(null)
  return cells
}

const MES_LABELS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

const DIA_LABELS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

const OCASION_LABELS: Record<string, string> = {
  trabajo: 'Trabajo', casual: 'Casual', noche: 'Noche',
  formal: 'Formal', deporte: 'Deporte',
}

function formatFechaLarga(fecha: string): string {
  const [y, m, d] = fecha.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  const dias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
  return `${dias[date.getDay()]} ${d} de ${MES_LABELS[m - 1]}`
}

// ── Stats helpers ──────────────────────────────────────────────────────────

interface EstadisticasState {
  prendaMasUsada: { prenda: PrendaConUrl; count: number } | null
  prendasOlvidadas: PrendaConUrl[]
}

function calcEstadisticas(
  outfits: OutfitUsado[],
  prendasById: Map<string, PrendaConUrl>,
  allPrendas: PrendaConUrl[],
): EstadisticasState {
  const thirtyAgo = thirtyDaysAgoStr()
  const recentOutfits = outfits.filter((o) => o.fecha >= thirtyAgo)
  const counts = new Map<string, number>()
  for (const o of recentOutfits) {
    for (const pid of o.prenda_ids) {
      counts.set(pid, (counts.get(pid) ?? 0) + 1)
    }
  }
  let topId: string | null = null
  let topCount = 0
  for (const [pid, cnt] of counts) {
    if (cnt > topCount) { topCount = cnt; topId = pid }
  }
  const prendaMasUsada = topId && prendasById.has(topId)
    ? { prenda: prendasById.get(topId)!, count: topCount }
    : null

  const usedIds = new Set(outfits.flatMap((o) => o.prenda_ids))
  const prendasOlvidadas = allPrendas.filter((p) => !usedIds.has(p.id)).slice(0, 5)

  return { prendaMasUsada, prendasOlvidadas }
}

// ── Main component ─────────────────────────────────────────────────────────

export function CalendarioView({ outfitsUsados, prendas, conjuntos, initialYear, initialMonth }: Readonly<Props>) {
  const [year, setYear] = useState(initialYear)
  const [month, setMonth] = useState(initialMonth)
  const [outfits, setOutfits] = useState<Map<string, OutfitUsado[]>>(() => buildMapMulti(outfitsUsados))
  const [subView, setSubView] = useState<'cal' | 'stats'>('cal')
  const [selectedDia, setSelectedDia] = useState<string | null>(null)
  const [registrando, setRegistrando] = useState<string | null>(null)
  const [estadisticas, setEstadisticas] = useState<EstadisticasState | null>(null)
  const [loadingStats, setLoadingStats] = useState(false)
  const [isPending, startTransition] = useTransition()

  const touchStartX = useRef<number | null>(null)
  const prendasById = useMemo(() => new Map(prendas.map((p) => [p.id, p])), [prendas])
  const cells = useMemo(() => getCalendarCells(year, month), [year, month])
  const today = todayStr()

  function irAMes(dy: number, dm: number) {
    let ny = dy, nm = dm
    if (nm < 0) { ny--; nm = 11 }
    if (nm > 11) { ny++; nm = 0 }
    startTransition(async () => {
      const data = await fetchOutfitsUsadosMes(ny, nm)
      setOutfits(buildMapMulti(data))
      setYear(ny)
      setMonth(nm)
    })
  }

  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current === null) return
    const dx = e.changedTouches[0].clientX - touchStartX.current
    touchStartX.current = null
    if (Math.abs(dx) < 60) return
    if (dx < 0) irAMes(year, month + 1)
    else irAMes(year, month - 1)
  }

  async function handleRegistrar(data: {
    prenda_ids: string[]
    conjunto_id?: string | null
    fecha: string
    ocasion?: string | null
    estado: 'planeado' | 'usado'
  }) {
    const result = await registrarOutfitUsado(data)
    if (!result.error) {
      const newOutfit: OutfitUsado = {
        id: result.id ?? crypto.randomUUID(),
        user_id: '',
        prenda_ids: data.prenda_ids,
        conjunto_id: data.conjunto_id ?? null,
        fecha: data.fecha,
        ocasion: data.ocasion ?? null,
        estado: data.estado,
        created_at: new Date().toISOString(),
      }
      setOutfits((prev) => {
        const next = new Map(prev)
        next.set(data.fecha, [...(next.get(data.fecha) ?? []), newOutfit])
        return next
      })
      setRegistrando(null)
    }
  }

  async function handleToggleEstado(id: string, fecha: string, newEstado: 'planeado' | 'usado') {
    const res = await updateOutfitUsado(id, { estado: newEstado })
    if (!res.error) {
      setOutfits((prev) => {
        const next = new Map(prev)
        const arr = (next.get(fecha) ?? []).map((o) => o.id === id ? { ...o, estado: newEstado } : o)
        next.set(fecha, arr)
        return next
      })
    }
  }

  async function handleDeleteOutfit(id: string, fecha: string) {
    const res = await deleteOutfitUsado(id)
    if (!res.error) {
      setOutfits((prev) => {
        const next = new Map(prev)
        const arr = (next.get(fecha) ?? []).filter((o) => o.id !== id)
        if (arr.length === 0) next.delete(fecha)
        else next.set(fecha, arr)
        return next
      })
    }
  }

  async function loadStats() {
    if (estadisticas || loadingStats) return
    setLoadingStats(true)
    const data = await fetchOutfitsUsadosRango(sixtyDaysAgoStr(), today)
    setEstadisticas(calcEstadisticas(data, prendasById, prendas))
    setLoadingStats(false)
  }

  function handleSubViewChange(v: 'cal' | 'stats') {
    setSubView(v)
    if (v === 'stats') loadStats()
  }

  return (
    <div className="space-y-4">
      {/* Sub-view toggle */}
      <div className="flex gap-1 p-1 bg-muted rounded-xl">
        <button
          onClick={() => handleSubViewChange('cal')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
            subView === 'cal'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <CalendarDays className="w-4 h-4" />
          Calendario
        </button>
        <button
          onClick={() => handleSubViewChange('stats')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
            subView === 'stats'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <ChartNoAxesColumn className="w-4 h-4" />
          Estadísticas
        </button>
      </div>

      {subView === 'cal' && (
        <>
          {/* Month navigation */}
          <div className="flex items-center justify-between">
            <button
              onClick={() => irAMes(year, month - 1)}
              disabled={isPending}
              className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground cursor-pointer disabled:opacity-40"
              aria-label="Mes anterior"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <h2
              className="text-base font-medium text-foreground"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              {MES_LABELS[month]} {year}
            </h2>
            <button
              onClick={() => irAMes(year, month + 1)}
              disabled={isPending}
              className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground cursor-pointer disabled:opacity-40"
              aria-label="Mes siguiente"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          {/* Day-of-week headers */}
          <div className="grid grid-cols-7 gap-1 text-center">
            {DIA_LABELS.map((d) => (
              <div key={d} className="text-xs text-muted-foreground font-medium py-1">
                {d}
              </div>
            ))}
          </div>

          {/* Calendar grid */}
          <div
            className={`grid grid-cols-7 gap-1 transition-opacity duration-200 ${isPending ? 'opacity-40' : 'opacity-100'}`}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            {cells.map((fecha, idx) => {
              if (!fecha) {
                return <div key={`pad-${idx}`} className="min-h-[3rem]" />
              }

              const dayOutfits = outfits.get(fecha) ?? []
              const count = dayOutfits.length
              const isToday = fecha === today
              const isFuture = fecha > today
              const dayNum = parseInt(fecha.split('-')[2], 10)

              let thumbUrl: string | null = null
              if (count > 0) {
                const first = dayOutfits[0]
                for (const cat of ['cuerpo_completo', 'superior']) {
                  const pid = first.prenda_ids.find((id) => prendasById.get(id)?.categoria === cat)
                  if (pid) { thumbUrl = prendasById.get(pid)?.signedUrl ?? null; break }
                }
                if (!thumbUrl && first.prenda_ids.length > 0) {
                  thumbUrl = prendasById.get(first.prenda_ids[0])?.signedUrl ?? null
                }
              }

              const tieneUsado = dayOutfits.some((o) => o.estado === 'usado')
              const tieneSoloPlaneado = count > 0 && !tieneUsado

              return (
                <button
                  key={fecha}
                  onClick={() => {
                    if (count > 0) setSelectedDia(fecha)
                    else setRegistrando(fecha)
                  }}
                  className={[
                    'min-h-12 lg:min-h-20 rounded-lg flex flex-col items-center justify-start pt-1 gap-0.5 transition-colors cursor-pointer relative',
                    isToday ? 'ring-2 ring-primary ring-offset-1' : '',
                    tieneUsado ? 'bg-primary/5' : '',
                    tieneSoloPlaneado ? 'bg-amber-50 dark:bg-amber-950/20' : '',
                    count === 0 && isFuture ? 'opacity-40 hover:opacity-70' : 'hover:bg-muted',
                  ].filter(Boolean).join(' ')}
                >
                  <span className={`text-xs font-medium leading-none ${isToday ? 'text-primary' : 'text-foreground'}`}>
                    {dayNum}
                  </span>
                  {thumbUrl ? (
                    <div className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={thumbUrl}
                        alt=""
                        className={`w-6 h-6 lg:w-10 lg:h-10 rounded-md object-cover ${tieneSoloPlaneado ? 'opacity-60' : ''}`}
                      />
                      {count > 1 && (
                        <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center leading-none">
                          {count}
                        </span>
                      )}
                    </div>
                  ) : count > 0 ? (
                    <div className={`w-2 h-2 rounded-full ${tieneSoloPlaneado ? 'bg-amber-400 border border-amber-500 border-dashed' : 'bg-primary/60'}`} />
                  ) : null}
                </button>
              )
            })}
          </div>

          {/* Legend */}
          <div className="flex gap-4 justify-center pt-1">
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="w-2.5 h-2.5 rounded-full bg-primary/60" />
              Usado
            </span>
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
              Planeado
            </span>
          </div>

          {outfits.size === 0 && (
            <p className="text-center text-sm text-muted-foreground py-4">
              Sin registros este mes — toca cualquier día para agregar un outfit.
            </p>
          )}
        </>
      )}

      {subView === 'stats' && (
        <EstadisticasSection estadisticas={estadisticas} loading={loadingStats} />
      )}

      {selectedDia && (
        <DiaDetalle
          fecha={selectedDia}
          outfits={outfits.get(selectedDia) ?? []}
          prendasById={prendasById}
          onClose={() => setSelectedDia(null)}
          onDelete={(id) => handleDeleteOutfit(id, selectedDia)}
          onToggleEstado={(id, newEstado) => handleToggleEstado(id, selectedDia, newEstado)}
          onAddOutfit={() => {
            const fecha = selectedDia
            setSelectedDia(null)
            setRegistrando(fecha)
          }}
        />
      )}

      {registrando && (
        <RegistrarOutfitModal
          fecha={registrando}
          conjuntos={conjuntos}
          prendas={prendas}
          prendasById={prendasById}
          onSave={handleRegistrar}
          onClose={() => setRegistrando(null)}
        />
      )}
    </div>
  )
}

// ── DiaDetalle ─────────────────────────────────────────────────────────────

interface DiaDetalleProps {
  fecha: string
  outfits: OutfitUsado[]
  prendasById: Map<string, PrendaConUrl>
  onClose: () => void
  onDelete: (id: string) => Promise<void>
  onToggleEstado: (id: string, newEstado: 'planeado' | 'usado') => Promise<void>
  onAddOutfit: () => void
}

function DiaDetalle({ fecha, outfits, prendasById, onClose, onDelete, onToggleEstado, onAddOutfit }: Readonly<DiaDetalleProps>) {
  const [actingId, setActingId] = useState<string | null>(null)

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center md:justify-center" onClick={onClose}>
      <div
        className="w-full max-w-lg mx-auto bg-background rounded-t-2xl md:rounded-2xl border border-border shadow-xl flex flex-col max-h-[85vh] animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0">
          <h3
            className="text-base font-medium text-foreground capitalize"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            {formatFechaLarga(fecha)}
          </h3>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
            aria-label="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Outfit list */}
        <div className="flex-1 overflow-y-auto px-5 space-y-3 pb-3">
          {outfits.map((outfit) => {
            const cprendas = outfit.prenda_ids
              .map((id) => prendasById.get(id))
              .filter((p): p is PrendaConUrl => p != null)
            const esPlaneado = outfit.estado === 'planeado'

            return (
              <div
                key={outfit.id}
                className={`rounded-2xl border overflow-hidden ${esPlaneado ? 'border-amber-200 dark:border-amber-800' : 'border-border'}`}
              >
                <div className="p-3">
                  {cprendas.length > 0 && <OutfitCollage prendas={cprendas} />}
                </div>
                <div className="flex items-center justify-between px-3 pb-3 gap-2 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    {outfit.ocasion && (
                      <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full capitalize">
                        {OCASION_LABELS[outfit.ocasion] ?? outfit.ocasion}
                      </span>
                    )}
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      esPlaneado
                        ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400'
                        : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400'
                    }`}>
                      {esPlaneado ? 'Planeado' : 'Usado'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={async () => {
                        setActingId(outfit.id)
                        await onToggleEstado(outfit.id, esPlaneado ? 'usado' : 'planeado')
                        setActingId(null)
                      }}
                      disabled={actingId === outfit.id}
                      className="text-xs px-2.5 py-1.5 rounded-lg border border-border text-muted-foreground hover:bg-muted disabled:opacity-40 transition-colors cursor-pointer"
                    >
                      {esPlaneado ? 'Marcar usado' : 'Marcar planeado'}
                    </button>
                    <button
                      onClick={async () => {
                        setActingId(outfit.id)
                        await onDelete(outfit.id)
                        setActingId(null)
                      }}
                      disabled={actingId === outfit.id}
                      className="p-1.5 rounded-lg border border-border text-destructive hover:bg-destructive/5 disabled:opacity-40 transition-colors cursor-pointer"
                      aria-label="Eliminar outfit"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Add button */}
        <div className="px-5 pb-5 shrink-0">
          <button
            onClick={onAddOutfit}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-primary/30 text-sm text-primary font-medium hover:bg-primary/5 transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Agregar otro outfit
          </button>
        </div>
      </div>
    </div>
  )
}

// ── RegistrarOutfitModal ───────────────────────────────────────────────────

interface RegistrarProps {
  fecha: string
  conjuntos: Conjunto[]
  prendas: PrendaConUrl[]
  prendasById: Map<string, PrendaConUrl>
  onSave: (data: { prenda_ids: string[]; conjunto_id?: string | null; fecha: string; ocasion?: string | null; estado: 'planeado' | 'usado' }) => Promise<void>
  onClose: () => void
}

function RegistrarOutfitModal({ fecha, conjuntos, prendas, prendasById, onSave, onClose }: Readonly<RegistrarProps>) {
  const isFuture = fecha > todayStr()
  const [mode, setMode] = useState<'conjuntos' | 'prendas'>('conjuntos')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [estado, setEstado] = useState<'planeado' | 'usado'>(isFuture ? 'planeado' : 'usado')
  const [saving, setSaving] = useState(false)

  function togglePrenda(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleSaveManual() {
    if (selected.size === 0) return
    setSaving(true)
    await onSave({ prenda_ids: [...selected], fecha, estado })
    setSaving(false)
  }

  async function handleSaveConjunto(c: Conjunto) {
    setSaving(true)
    await onSave({ prenda_ids: c.prenda_ids, conjunto_id: c.id, fecha, ocasion: c.ocasion, estado })
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center md:justify-center" onClick={onClose}>
      <div
        className="w-full max-w-lg mx-auto bg-background rounded-t-2xl md:rounded-2xl border border-border shadow-xl flex flex-col max-h-[85vh] animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0">
          <div>
            <p className="text-xs text-muted-foreground">Agregar outfit</p>
            <h3 className="text-sm font-medium text-foreground capitalize">{formatFechaLarga(fecha)}</h3>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer" aria-label="Cerrar">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Estado toggle */}
        <div className="flex gap-1 mx-5 mb-3 p-1 bg-muted rounded-xl shrink-0">
          <button
            onClick={() => setEstado('usado')}
            className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
              estado === 'usado' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'
            }`}
          >
            Usado
          </button>
          <button
            onClick={() => setEstado('planeado')}
            className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
              estado === 'planeado' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'
            }`}
          >
            Planeado
          </button>
        </div>

        {/* Source tabs */}
        <div className="flex gap-1 mx-5 mb-3 p-1 bg-muted rounded-xl shrink-0">
          <button
            onClick={() => setMode('conjuntos')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
              mode === 'conjuntos' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'
            }`}
          >
            <Heart className="w-3.5 h-3.5" />
            Mis conjuntos
          </button>
          <button
            onClick={() => setMode('prendas')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
              mode === 'prendas' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'
            }`}
          >
            <Shirt className="w-3.5 h-3.5" />
            Elegir prendas
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 pb-5">
          {mode === 'conjuntos' ? (
            conjuntos.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                Aún no tienes conjuntos guardados.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {conjuntos.map((c) => {
                  const cprendas = c.prenda_ids
                    .map((id) => prendasById.get(id))
                    .filter((p): p is PrendaConUrl => p != null)
                  return (
                    <button
                      key={c.id}
                      disabled={saving}
                      onClick={() => handleSaveConjunto(c)}
                      className="rounded-xl overflow-hidden border border-border hover:border-primary/50 transition-colors cursor-pointer disabled:opacity-50 text-left"
                    >
                      <OutfitCollage prendas={cprendas} />
                      <div className="px-2 py-1.5">
                        <p className="text-xs font-medium text-foreground truncate">
                          {c.nombre ?? `Conjunto ${OCASION_LABELS[c.ocasion] ?? c.ocasion}`}
                        </p>
                      </div>
                    </button>
                  )
                })}
              </div>
            )
          ) : (
            <>
              <div className="grid grid-cols-3 gap-2 mb-4">
                {prendas.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => togglePrenda(p.id)}
                    className={`relative rounded-xl overflow-hidden aspect-square border-2 transition-all cursor-pointer ${
                      selected.has(p.id) ? 'border-primary' : 'border-transparent'
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.signedUrl} alt={p.tipo} className="w-full h-full object-cover" />
                    {selected.has(p.id) && (
                      <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                        <span className="text-primary text-lg font-bold">✓</span>
                      </div>
                    )}
                  </button>
                ))}
              </div>
              <button
                onClick={handleSaveManual}
                disabled={selected.size === 0 || saving}
                className="w-full py-3 rounded-xl bg-primary text-primary-foreground text-sm font-medium cursor-pointer disabled:opacity-40"
              >
                {saving ? 'Guardando...' : `Guardar (${selected.size} prenda${selected.size !== 1 ? 's' : ''})`}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── EstadisticasSection ────────────────────────────────────────────────────

interface EstadisticasSectionProps {
  estadisticas: EstadisticasState | null
  loading: boolean
}

function EstadisticasSection({ estadisticas, loading }: Readonly<EstadisticasSectionProps>) {
  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    )
  }

  if (!estadisticas) {
    return (
      <p className="text-sm text-muted-foreground text-center py-8">
        Registra al menos un outfit usado para ver tus estadísticas.
      </p>
    )
  }

  const { prendaMasUsada, prendasOlvidadas } = estadisticas

  return (
    <div className="space-y-5">
      {/* Prenda más usada */}
      {prendaMasUsada ? (
        <div className="bg-muted/60 rounded-2xl p-4">
          <p className="text-xs text-muted-foreground mb-3">Prenda favorita del mes</p>
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={prendaMasUsada.prenda.signedUrl}
              alt={prendaMasUsada.prenda.tipo}
              className="w-14 h-14 rounded-xl object-cover"
            />
            <div>
              <p className="text-sm font-medium text-foreground capitalize">
                {prendaMasUsada.prenda.tipo.replaceAll('_', ' ')}
              </p>
              <p className="text-xs text-muted-foreground">
                Usada {prendaMasUsada.count} {prendaMasUsada.count === 1 ? 'vez' : 'veces'} este mes
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-muted/60 rounded-2xl p-4">
          <p className="text-xs text-muted-foreground">Sin registros usados en los últimos 30 días</p>
        </div>
      )}

      {/* Prendas olvidadas */}
      {prendasOlvidadas.length > 0 && (
        <div className="bg-muted/60 rounded-2xl p-4">
          <p className="text-xs text-muted-foreground mb-3">👀 Sin usar en 60 días</p>
          <div className="flex gap-2 flex-wrap">
            {prendasOlvidadas.map((p) => (
              <div key={p.id} className="flex flex-col items-center gap-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.signedUrl}
                  alt={p.tipo}
                  className="w-14 h-14 rounded-xl object-cover"
                />
                <span className="text-[10px] text-muted-foreground capitalize text-center max-w-[3.5rem] truncate">
                  {p.tipo.replaceAll('_', ' ')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {prendasOlvidadas.length === 0 && prendaMasUsada && (
        <p className="text-xs text-center text-muted-foreground">
          ✨ ¡Estás usando todas tus prendas! Bien hecho.
        </p>
      )}
    </div>
  )
}
