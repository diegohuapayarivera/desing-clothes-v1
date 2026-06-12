'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Shirt, Heart, CalendarDays } from 'lucide-react'
import { signOut } from '@/app/actions'

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

const TABS = [
  { href: '/', label: 'Mi clóset', Icon: Shirt },
  { href: '/conjuntos', label: 'Mis conjuntos', Icon: Heart },
  { href: '/calendario', label: 'Calendario', Icon: CalendarDays },
] as const

interface Props {
  initials: string
  children: React.ReactNode
}

export function MainLayout({ initials, children }: Readonly<Props>) {
  const pathname = usePathname()

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-sm border-b border-border/60">
        <div className="max-w-lg lg:max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
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

      <main className="flex-1 max-w-lg lg:max-w-6xl mx-auto w-full px-4 py-8">
        {/* Mobile tab bar */}
        <div className="flex gap-1 bg-muted/50 rounded-xl p-1 mb-5 lg:hidden">
          {TABS.map(({ href, label, Icon }) => {
            const active = pathname === href
            return (
              <Link
                key={href}
                href={href}
                className={[
                  'flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-all',
                  active
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                ].join(' ')}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{label}</span>
              </Link>
            )
          })}
        </div>

        <div className="lg:grid lg:grid-cols-[14rem_1fr] lg:gap-10 lg:items-start">
          {/* Desktop sidebar nav */}
          <aside className="hidden lg:flex lg:flex-col lg:gap-1 lg:sticky lg:top-20">
            {TABS.map(({ href, label, Icon }) => {
              const active = pathname === href
              return (
                <Link
                  key={href}
                  href={href}
                  className={[
                    'flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-sm font-medium transition-all',
                    active
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted',
                  ].join(' ')}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  {label}
                </Link>
              )
            })}
          </aside>

          <div>{children}</div>
        </div>
      </main>
    </div>
  )
}
