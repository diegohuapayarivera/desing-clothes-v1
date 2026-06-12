'use client'

import { useState, useMemo, useRef, useTransition } from 'react'
import { X, Pencil, Trash2, Heart, Shirt, CalendarDays, ChartNoAxesColumn, ChevronLeft, ChevronRight } from 'lucide-react'
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

function buildMap(list: OutfitUsado[]): Map<string, OutfitUsado> {
  return new Map(list.map((o) => [o.fecha, o]))
}

/** Returns 42 date strings (or null for padding cells), week starts Monday */
function getCalendarCells(year: number, month: number): (string | null)[] {
  const firstDay = new Date(year, month, 1)
  // getDay(): 0=Sun, 1=Mon … 6=Sat → convert to Mon=0 … Sun=6
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
  rachaDias: number
  prendaMasUsada: { prenda: PrendaConUrl; count: number } | null
  prendasOlvidadas: PrendaConUrl[]
}

function calcEstadisticas(
  outfits: OutfitUsado[],
  prendasById: Map<string, PrendaConUrl>,
  allPrendas: PrendaConUrl[],
): EstadisticasState {
  const today = todayStr()

  // Racha: días consecutivos hacia atrás desde hoy
  const dateSet = new Set(outfits.map((o) => o.fecha))
  let racha = 0
  const cur = new Date(today)
  while (dateSet.has(cur.toISOString().split('T')[0])) {
    racha++
    cur.setDate(cur.getDate() - 1)
  }

  // Prenda más usada (últimos 30 días)
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

  // Prendas olvidadas (no usadas en últimos 60 días)
  const usedIds = new Set(outfits.flatMap((o) => o.prenda_ids))
  const prendasOlvidadas = allPrendas
    .filter((p) => !usedIds.has(p.id))
    .slice(0, 5)

  return { rachaDias: racha, prendaMasUsada, prendasOlvidadas }
}

// ── Main component ─────────────────────────────────────────────────────────

export function CalendarioView({ outfitsUsados, prendas, conjuntos, initialYear, initialMonth }: Readonly<Props>) {
  const [year, setYear] = useState(initialYear)
  const [month, setMonth] = useState(initialMonth)
  const [outfits, setOutfits] = useState<Map<string, OutfitUsado>>(() => buildMap(outfitsUsados))
  const [subView, setSubView] = useState<'cal' | 'stats'>('cal')
  const [selectedDia, setSelectedDia] = useState<string | null>(null)
  const [registrando, setRegistrando] = useState<string | null>(null)
  // pendingRegData is kept to replay the registration after confirm-replace
  const pendingRegData = useRef<{
    prenda_ids: string[]
    conjunto_id?: string | null
    ocasion?: string | null
    fecha: string
  } | null>(null)
  const [confirmReplace, setConfirmReplace] = useState<{ fecha: string; existing: OutfitUsado } | null>(null)
  const [estadisticas, setEstadisticas] = useState<EstadisticasState | null>(null)
  const [loadingStats, setLoadingStats] = useState(false)
  const [isPending, startTransition] = useTransition()

  // Swipe tracking
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
      setOutfits(buildMap(data))
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
  }) {
    pendingRegData.current = data
    const result = await registrarOutfitUsado({ ...data, force: false })
    if (result.alreadyExists) {
      setRegistrando(null)
      setConfirmReplace({ fecha: data.fecha, existing: result.alreadyExists })
      return
    }
    if (!result.error) {
      const fakeNew: OutfitUsado = {
        id: crypto.randomUUID(),
        user_id: '',
        prenda_ids: data.prenda_ids,
        conjunto_id: data.conjunto_id ?? null,
        fecha: data.fecha,
        ocasion: data.ocasion ?? null,
        created_at: new Date().toISOString(),
      }
      setOutfits((prev) => new Map(prev).set(data.fecha, fakeNew))
      setRegistrando(null)
    }
  }

  async function handleForceRegistrar() {
    const data = pendingRegData.current
    if (!data) return
    const result = await registrarOutfitUsado({ ...data, force: true })
    if (!result.error) {
      const fakeNew: OutfitUsado = {
        id: crypto.randomUUID(),
        user_id: '',
        prenda_ids: data.prenda_ids,
        conjunto_id: data.conjunto_id ?? null,
        fecha: data.fecha,
        ocasion: data.ocasion ?? null,
        created_at: new Date().toISOString(),
      }
      setOutfits((prev) => new Map(prev).set(data.fecha, fakeNew))
    }
    pendingRegData.current = null
    setConfirmReplace(null)
  }

  async function loadStats() {
    if (estadisticas || loadingStats) return
    setLoadingStats(true)
    const desde = sixtyDaysAgoStr()
    const data = await fetchOutfitsUsadosRango(desde, today)
    setEstadisticas(calcEstadisticas(data, prendasById, prendas))
    setLoadingStats(false)
  }

  function handleSubViewChange(v: 'cal' | 'stats') {
    setSubView(v)
    if (v === 'stats') loadStats()
  }

  // ── Render ────────────────────────────────────────────────────────────────

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
              const outfit = outfits.get(fecha)
              const isToday = fecha === today
              const isFuture = fecha > today
              const dayNum = parseInt(fecha.split('-')[2], 10)

              // Thumbnail: first cuerpo_completo or superior prenda
              let thumbUrl: string | null = null
              if (outfit) {
                const CAT_PRIO = ['cuerpo_completo', 'superior']
                for (const cat of CAT_PRIO) {
                  const pid = outfit.prenda_ids.find(
                    (id) => prendasById.get(id)?.categoria === cat,
                  )
                  if (pid) { thumbUrl = prendasById.get(pid)?.signedUrl ?? null; break }
                }
                if (!thumbUrl && outfit.prenda_ids.length > 0) {
                  thumbUrl = prendasById.get(outfit.prenda_ids[0])?.signedUrl ?? null
                }
              }

              return (
                <button
                  key={fecha}
                  disabled={isFuture}
                  onClick={() => {
                    if (outfit) setSelectedDia(fecha)
                    else if (!isFuture) setRegistrando(fecha)
                  }}
                  className={`min-h-[3rem] rounded-lg flex flex-col items-center justify-start pt-1 gap-0.5 transition-colors cursor-pointer
                    ${isToday ? 'ring-2 ring-primary ring-offset-1' : ''}
                    ${isFuture ? 'opacity-30 cursor-not-allowed' : 'hover:bg-muted'}
                    ${outfit ? 'bg-primary/5' : ''}
                  `}
                >
                  <span className={`text-xs font-medium leading-none ${isToday ? 'text-primary' : 'text-foreground'}`}>
                    {dayNum}
                  </span>
                  {thumbUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={thumbUrl}
                      alt=""
                      className="w-6 h-6 rounded-md object-cover"
                    />
                  )}
                  {outfit && !thumbUrl && (
                    <div className="w-2 h-2 rounded-full bg-primary/60" />
                  )}
                </button>
              )
            })}
          </div>

          {/* Empty state */}
          {outfits.size === 0 && (
            <p className="text-center text-sm text-muted-foreground py-4">
              Sin registros este mes — toca un día para agregar un outfit.
            </p>
          )}
        </>
      )}

      {subView === 'stats' && (
        <EstadisticasSection
          estadisticas={estadisticas}
          loading={loadingStats}
        />
      )}

      {/* Día detalle (bottom sheet) */}
      {selectedDia && (
        <DiaDetalle
          fecha={selectedDia}
          outfit={outfits.get(selectedDia)!}
          prendasById={prendasById}
          onClose={() => setSelectedDia(null)}
          onDelete={async (id) => {
            const res = await deleteOutfitUsado(id)
            if (!res.error) {
              setOutfits((prev) => { const next = new Map(prev); next.delete(selectedDia); return next })
              setSelectedDia(null)
            }
          }}
          onUpdateFecha={async (id, newFecha) => {
            const res = await updateOutfitUsado(id, { fecha: newFecha })
            if (!res.error) {
              setOutfits((prev) => {
                const next = new Map(prev)
                const existing = next.get(selectedDia)!
                next.delete(selectedDia)
                next.set(newFecha, { ...existing, fecha: newFecha })
                return next
              })
              setSelectedDia(null)
            }
          }}
        />
      )}

      {/* Registrar outfit modal */}
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

      {/* Confirm replace */}
      {confirmReplace && (
        <ConfirmReplaceSheet
          fecha={confirmReplace.fecha}
          onConfirm={handleForceRegistrar}
          onCancel={() => { setConfirmReplace(null); pendingRegData.current = null }}
        />
      )}
    </div>
  )
}

// ── DiaDetalle ─────────────────────────────────────────────────────────────

interface DiaDetalleProps {
  fecha: string
  outfit: OutfitUsado
  prendasById: Map<string, PrendaConUrl>
  onClose: () => void
  onDelete: (id: string) => Promise<void>
  onUpdateFecha: (id: string, newFecha: string) => Promise<void>
}

function DiaDetalle({ fecha, outfit, prendasById, onClose, onDelete, onUpdateFecha }: Readonly<DiaDetalleProps>) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showEditFecha, setShowEditFecha] = useState(false)
  const [newFecha, setNewFecha] = useState(fecha)
  const [saving, setSaving] = useState(false)

  const resolvedPrendas = outfit.prenda_ids
    .map((id) => prendasById.get(id))
    .filter((p): p is PrendaConUrl => p != null)

  async function handleDelete() {
    setSaving(true)
    await onDelete(outfit.id)
    setSaving(false)
  }

  async function handleSaveFecha() {
    if (newFecha === fecha) { setShowEditFecha(false); return }
    setSaving(true)
    await onUpdateFecha(outfit.id, newFecha)
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end" onClick={onClose}>
      <div
        className="w-full max-w-lg mx-auto bg-background rounded-t-2xl border border-border shadow-xl p-5 space-y-4 animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <h3
            className="text-base font-medium text-foreground capitalize"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            {formatFechaLarga(fecha)}
          </h3>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer" aria-label="Cerrar">
            <X className="w-4 h-4" />
          </button>
        </div>

        {resolvedPrendas.length > 0 && (
          <OutfitCollage prendas={resolvedPrendas} />
        )}

        {outfit.ocasion && (
          <span className="inline-block text-xs bg-primary/10 text-primary px-2.5 py-1 rounded-full capitalize">
            {OCASION_LABELS[outfit.ocasion] ?? outfit.ocasion}
          </span>
        )}

        {/* Edit fecha */}
        {showEditFecha ? (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">Nueva fecha</p>
            <input
              type="date"
              value={newFecha}
              max={todayStr()}
              onChange={(e) => setNewFecha(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-xl border border-border bg-background"
            />
            <div className="flex gap-2">
              <button
                onClick={() => setShowEditFecha(false)}
                className="flex-1 py-2.5 rounded-xl border border-border text-sm text-muted-foreground cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveFecha}
                disabled={saving}
                className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium cursor-pointer disabled:opacity-50"
              >
                Guardar
              </button>
            </div>
          </div>
        ) : showDeleteConfirm ? (
          <div className="space-y-2">
            <p className="text-sm text-center text-foreground">¿Eliminar este registro?</p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 py-2.5 rounded-xl border border-border text-sm cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                disabled={saving}
                className="flex-1 py-2.5 rounded-xl bg-destructive text-destructive-foreground text-sm font-medium cursor-pointer disabled:opacity-50"
              >
                Eliminar
              </button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={() => setShowEditFecha(true)}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-border text-sm text-muted-foreground hover:bg-muted transition-colors cursor-pointer"
            >
              <Pencil className="w-3.5 h-3.5" />
              Cambiar fecha
            </button>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="py-2.5 px-4 rounded-xl border border-border text-sm text-destructive hover:bg-destructive/5 transition-colors cursor-pointer"
              aria-label="Eliminar registro"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        )}
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
  onSave: (data: { prenda_ids: string[]; conjunto_id?: string | null; fecha: string; ocasion?: string | null }) => Promise<void>
  onClose: () => void
}

function RegistrarOutfitModal({ fecha, conjuntos, prendas, prendasById, onSave, onClose }: Readonly<RegistrarProps>) {
  const [mode, setMode] = useState<'conjuntos' | 'prendas'>('conjuntos')
  const [selected, setSelected] = useState<Set<string>>(new Set())
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
    await onSave({ prenda_ids: [...selected], fecha })
    setSaving(false)
  }

  async function handleSaveConjunto(c: Conjunto) {
    setSaving(true)
    await onSave({ prenda_ids: c.prenda_ids, conjunto_id: c.id, fecha, ocasion: c.ocasion })
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end" onClick={onClose}>
      <div
        className="w-full max-w-lg mx-auto bg-background rounded-t-2xl border border-border shadow-xl flex flex-col max-h-[85vh] animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div>
            <p className="text-xs text-muted-foreground">Registrar outfit</p>
            <h3 className="text-sm font-medium text-foreground capitalize">{formatFechaLarga(fecha)}</h3>
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer" aria-label="Cerrar">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Mode tabs */}
        <div className="flex gap-1 mx-5 mb-3 p-1 bg-muted rounded-xl">
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
                {saving ? 'Guardando...' : `Guardar outfit (${selected.size} prenda${selected.size !== 1 ? 's' : ''})`}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── ConfirmReplaceSheet ────────────────────────────────────────────────────

interface ConfirmReplaceProps {
  fecha: string
  onConfirm: () => Promise<void>
  onCancel: () => void
}

function ConfirmReplaceSheet({ fecha, onConfirm, onCancel }: Readonly<ConfirmReplaceProps>) {
  const [saving, setSaving] = useState(false)

  async function handleConfirm() {
    setSaving(true)
    await onConfirm()
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end" onClick={onCancel}>
      <div
        className="w-full max-w-lg mx-auto bg-background rounded-t-2xl border border-border shadow-xl p-5 space-y-4 animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-sm text-foreground text-center">
          Ya registraste un outfit el <span className="font-medium">{formatFechaLarga(fecha)}</span>.
          <br />¿Lo reemplazas?
        </p>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl border border-border text-sm cursor-pointer"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            disabled={saving}
            className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium cursor-pointer disabled:opacity-50"
          >
            {saving ? 'Guardando...' : 'Sí, reemplazar'}
          </button>
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
        Registra al menos un outfit para ver tus estadísticas.
      </p>
    )
  }

  const { rachaDias, prendaMasUsada, prendasOlvidadas } = estadisticas

  return (
    <div className="space-y-5">
      {/* Racha */}
      <div className="bg-muted/60 rounded-2xl p-4 flex items-center gap-3">
        <span className="text-2xl">🔥</span>
        <div>
          <p className="text-sm font-medium text-foreground">
            Racha actual: {rachaDias} {rachaDias === 1 ? 'día' : 'días'}
          </p>
          <p className="text-xs text-muted-foreground">
            {rachaDias === 0 ? 'Registra hoy para empezar una racha' : 'Días seguidos registrando tu outfit'}
          </p>
        </div>
      </div>

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
          <p className="text-xs text-muted-foreground">Sin registros en los últimos 30 días</p>
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
