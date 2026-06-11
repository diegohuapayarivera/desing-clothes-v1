'use client'

import { useState, useTransition } from 'react'
import { completeOnboarding } from './actions'
import type { PreferenciaPrendas } from '@/types'

const PREFERENCIAS: {
  value: PreferenciaPrendas
  label: string
  emoji: string
  description: string
}[] = [
  { value: 'hombre', label: 'Hombre', emoji: '👔', description: 'Ropa masculina' },
  { value: 'mujer', label: 'Mujer', emoji: '👗', description: 'Ropa femenina' },
  { value: 'ambas', label: 'Ambas', emoji: '✨', description: 'Todo tipo' },
]

export function OnboardingForm({ errorParam }: { errorParam?: string }) {
  const [preferencia, setPreferencia] = useState<PreferenciaPrendas | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!preferencia) return
    const formData = new FormData(e.currentTarget)
    startTransition(() => {
      completeOnboarding(formData)
    })
  }

  const isValid = preferencia !== null

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {/* Name field */}
      <div className="space-y-2">
        <label
          htmlFor="nombre"
          className="block text-sm font-medium text-foreground/80"
        >
          Tu nombre
        </label>
        <input
          id="nombre"
          name="nombre"
          type="text"
          required
          autoComplete="given-name"
          placeholder="¿Cómo te llamamos?"
          className="w-full px-4 py-3 rounded-xl border border-border bg-card text-foreground placeholder:text-muted-foreground/60 text-sm transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50"
        />
      </div>

      {/* Clothing preference chips */}
      <div className="space-y-3">
        <p className="text-sm font-medium text-foreground/80">
          ¿Cómo prefieres vestirte?
        </p>
        <input type="hidden" name="preferencia_prendas" value={preferencia ?? ''} />
        <div className="grid grid-cols-3 gap-3">
          {PREFERENCIAS.map((p) => {
            const isSelected = preferencia === p.value
            return (
              <button
                key={p.value}
                type="button"
                onClick={() => setPreferencia(p.value)}
                className={[
                  'flex flex-col items-center justify-center gap-2 rounded-2xl border-2 px-3 py-5 text-center transition-all duration-200 active:scale-95',
                  isSelected
                    ? 'border-primary bg-primary/10 text-primary shadow-sm'
                    : 'border-border bg-card text-foreground/70 hover:border-primary/40 hover:bg-accent/30',
                ].join(' ')}
                aria-pressed={isSelected}
              >
                <span className="text-2xl" aria-hidden="true">
                  {p.emoji}
                </span>
                <span className="text-sm font-medium leading-tight">{p.label}</span>
                <span className="text-xs text-muted-foreground leading-tight">
                  {p.description}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Error message */}
      {errorParam && (
        <p className="text-sm text-destructive bg-destructive/5 rounded-xl px-4 py-3">
          {errorParam === 'validation'
            ? 'Por favor completa todos los campos.'
            : 'Ocurrió un error al guardar. Intenta de nuevo.'}
        </p>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={!isValid || isPending}
        className="w-full flex items-center justify-center gap-2 px-5 py-4 rounded-xl bg-primary text-primary-foreground text-sm font-semibold transition-all duration-200 hover:opacity-90 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {isPending ? (
          <span className="inline-block w-4 h-4 border-2 border-primary-foreground/40 border-t-primary-foreground rounded-full animate-spin" />
        ) : null}
        {isPending ? 'Guardando...' : 'Empezar →'}
      </button>
    </form>
  )
}
