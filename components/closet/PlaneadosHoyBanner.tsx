'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { CalendarDays, Check } from 'lucide-react'
import { OutfitCollage } from './OutfitCollage'
import { updateOutfitUsado } from '@/app/closet/actions'
import type { OutfitUsado, PrendaConUrl } from '@/types'

interface PlaneadoItem {
  outfit: OutfitUsado
  prendas: PrendaConUrl[]
}

export function PlaneadosHoyBanner({ planeados: initial }: Readonly<{ planeados: PlaneadoItem[] }>) {
  const [items, setItems] = useState(initial)
  const [, startTransition] = useTransition()
  const [loadingId, setLoadingId] = useState<string | null>(null)

  if (items.length === 0) return null

  function marcarUsado(id: string) {
    setLoadingId(id)
    startTransition(async () => {
      await updateOutfitUsado(id, { estado: 'usado' })
      setItems((prev) => prev.filter((item) => item.outfit.id !== id))
      setLoadingId(null)
    })
  }

  return (
    <div className="mb-6 animate-fade-up">
      <div className="flex items-center justify-between mb-2.5">
        <p className="text-sm font-medium text-foreground/80">
          {items.length === 1
            ? 'Hoy planeaste ponerte esto ✨'
            : `Tienes ${items.length} outfits planeados para hoy`}
        </p>
        <Link
          href="/calendario"
          className="flex items-center gap-1 text-xs text-primary hover:underline shrink-0"
        >
          <CalendarDays className="w-3.5 h-3.5" />
          Calendario
        </Link>
      </div>

      <div className="flex flex-col gap-2">
        {items.map(({ outfit, prendas }) => (
          <div
            key={outfit.id}
            className="flex gap-3 bg-amber-50 border border-amber-200/80 rounded-2xl p-3 items-center"
          >
            <div className="w-24 shrink-0 rounded-xl overflow-hidden">
              <OutfitCollage prendas={prendas} />
            </div>

            <div className="flex flex-col gap-1.5 min-w-0 flex-1">
              {outfit.ocasion && (
                <p className="text-xs text-amber-900/70 capitalize truncate">{outfit.ocasion}</p>
              )}
              <button
                type="button"
                onClick={() => marcarUsado(outfit.id)}
                disabled={loadingId !== null}
                className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 active:scale-[0.97] transition-all disabled:opacity-50"
              >
                {loadingId === outfit.id ? (
                  <span className="w-3 h-3 border border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                ) : (
                  <>
                    <Check className="w-3 h-3" />
                    Marcar como usado
                  </>
                )}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
