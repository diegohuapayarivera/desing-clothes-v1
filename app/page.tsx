import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { signOut } from './actions'
import type { Profile } from '@/types'

function HangerIcon({ className }: Readonly<{ className?: string }>) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M32 6C32 6 32 13 32 15.5C32 18 34 20 36.5 20C39 20 41 18 41 15.5"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M32 20L8 48H56L32 20Z"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path d="M16 56H48" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M16 48V56M48 48V56" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  )
}

function EmptyClosetIllustration() {
  return (
    <svg
      viewBox="0 0 160 140"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="w-40 h-36 text-primary/20"
      aria-hidden="true"
    >
      <rect x="10" y="20" width="140" height="110" rx="8" stroke="currentColor" strokeWidth="2.5" />
      <line x1="80" y1="20" x2="80" y2="130" stroke="currentColor" strokeWidth="2" />
      <line x1="10" y1="50" x2="80" y2="50" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 4" />
      <line x1="80" y1="50" x2="150" y2="50" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 4" />
      <circle cx="72" cy="78" r="4" stroke="currentColor" strokeWidth="2" />
      <circle cx="88" cy="78" r="4" stroke="currentColor" strokeWidth="2" />
      <path d="M35 35 L35 37.5 C35 38.5 36 39 37 39 C38 39 39 38.5 39 37.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M35 39 L26 52 L44 52 Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M115 35 L115 37.5 C115 38.5 116 39 117 39 C118 39 119 38.5 119 37.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M115 39 L106 52 L124 52 Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="25" y1="130" x2="25" y2="140" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="135" y1="130" x2="135" y2="140" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  )
}

export default async function HomePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single<Profile>()

  if (!profile?.onboarding_completado) {
    redirect('/onboarding')
  }

  const initials = profile.nombre
    ? profile.nombre
        .split(' ')
        .slice(0, 2)
        .map((n) => n[0])
        .join('')
        .toUpperCase()
    : '?'

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Nav */}
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm border-b border-border/60">
        <div className="max-w-lg mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
              <HangerIcon className="w-4 h-4 text-primary" />
            </div>
            <span
              className="text-base font-light text-foreground"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              Clóset Digital
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center">
              <span className="text-xs font-semibold text-primary">{initials}</span>
            </div>
            <form action={signOut}>
              <button
                type="submit"
                className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-lg hover:bg-muted cursor-pointer"
                aria-label="Cerrar sesión"
              >
                Salir
              </button>
            </form>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 max-w-lg mx-auto w-full px-4 py-8">
        {/* Greeting */}
        <div className="mb-8 animate-fade-up">
          <p className="text-sm text-muted-foreground mb-1">Bienvenida de vuelta</p>
          <h1
            className="text-3xl font-light text-foreground leading-tight"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            Hola, {profile.nombre?.split(' ')[0]} ✦
          </h1>
        </div>

        {/* Empty state */}
        <div className="flex flex-col items-center text-center py-12 px-6 animate-fade-up delay-100">
          <div className="mb-6 opacity-70">
            <EmptyClosetIllustration />
          </div>
          <h2
            className="text-xl font-light text-foreground mb-2"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            Tu clóset está vacío
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed max-w-xs">
            Agrega tus prendas para empezar a recibir recomendaciones personalizadas.
          </p>
        </div>

        {/* CTA buttons */}
        <div className="space-y-3 animate-fade-up delay-200">
          <button
            disabled
            className="w-full flex items-center justify-center gap-2 px-5 py-4 rounded-xl border-2 border-dashed border-border text-sm font-medium text-muted-foreground cursor-not-allowed opacity-50"
            aria-label="Próximamente: agregar prenda"
          >
            <span aria-hidden="true">{'+'}</span>
            {' Agregar prenda'}
            <span className="ml-auto text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">
              Próximamente
            </span>
          </button>

          <button
            disabled
            className="w-full flex items-center justify-center gap-2 px-5 py-4 rounded-xl bg-primary/5 border border-primary/20 text-sm font-medium text-primary/40 cursor-not-allowed"
            aria-label="Próximamente: recomendaciones de outfits"
          >
            <span aria-hidden="true">{'✨'}</span>
            {' ¿Qué me pongo hoy?'}
            <span className="ml-auto text-xs bg-primary/10 text-primary/50 px-2 py-0.5 rounded-full">
              Próximamente
            </span>
          </button>
        </div>
      </main>
    </div>
  )
}
