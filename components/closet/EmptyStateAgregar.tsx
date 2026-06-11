'use client'

import { useState } from 'react'
import { AgregarPrendaModal } from './AgregarPrendaModal'
import type { PreferenciaPrendas } from '@/types'

export function EmptyStateAgregar({ preferencia }: { preferencia: PreferenciaPrendas }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full flex items-center justify-center gap-2 px-5 py-4 rounded-xl border-2 border-dashed border-primary/40 text-sm font-medium text-primary hover:bg-primary/5 transition-all active:scale-95"
        aria-label="Agregar primera prenda"
      >
        <span aria-hidden="true">+</span>
        {' Agregar prenda'}
      </button>

      {open && (
        <AgregarPrendaModal
          preferencia={preferencia}
          onClose={() => setOpen(false)}
          onSaved={() => {
            setOpen(false)
            window.location.reload()
          }}
        />
      )}
    </>
  )
}
