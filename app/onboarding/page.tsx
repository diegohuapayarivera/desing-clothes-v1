import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { OnboardingForm } from './OnboardingForm'
import { Isotipo } from '@/components/brand/Isotipo'

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('onboarding_completado')
    .eq('id', user.id)
    .single()

  if (profile?.onboarding_completado) {
    redirect('/')
  }

  const { error } = await searchParams

  return (
    <main className="min-h-screen flex flex-col bg-background px-4 py-10">
      {/* Background blobs */}
      <div className="pointer-events-none fixed inset-0 -z-10" aria-hidden="true">
        <div
          className="absolute top-0 right-0 w-72 h-72 rounded-full opacity-20"
          style={{
            background: 'radial-gradient(circle, oklch(0.82 0.07 125) 0%, transparent 70%)',
          }}
        />
        <div
          className="absolute bottom-0 left-0 w-64 h-64 rounded-full opacity-15"
          style={{
            background: 'radial-gradient(circle, oklch(0.86 0.04 95) 0%, transparent 70%)',
          }}
        />
      </div>

      {/* Logo header */}
      <div className="flex items-center gap-2 mb-10 animate-fade-in">
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
          <Isotipo className="w-5 h-5 text-primary" />
        </div>
        <span
          className="text-lg font-medium text-foreground"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          Clóset Digital
        </span>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col max-w-sm mx-auto w-full">
        <div className="mb-8 animate-fade-up">
          <h1
            className="text-3xl font-medium text-foreground mb-2 leading-snug"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            ¡Hola! Cuéntanos
            <br />
            sobre ti.
          </h1>
          <p className="text-sm text-muted-foreground">
            Solo necesitamos un momento para personalizar tu experiencia.
          </p>
        </div>

        <div className="opacity-0 animate-fade-up delay-200">
          <OnboardingForm errorParam={error} />
        </div>
      </div>
    </main>
  )
}
