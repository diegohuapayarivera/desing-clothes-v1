import Image from 'next/image'
import { signInWithGoogle } from './actions'

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5" aria-hidden="true">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  )
}

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-12 relative overflow-hidden bg-background">
      {/* Background decorative blobs */}
      <div
        className="pointer-events-none absolute inset-0 -z-10"
        aria-hidden="true"
      >
        <div
          className="absolute -top-24 -right-24 w-96 h-96 rounded-full opacity-30"
          style={{
            background:
              'radial-gradient(circle, oklch(0.82 0.07 125) 0%, transparent 70%)',
          }}
        />
        <div
          className="absolute -bottom-32 -left-20 w-80 h-80 rounded-full opacity-20"
          style={{
            background:
              'radial-gradient(circle, oklch(0.86 0.04 95) 0%, transparent 70%)',
          }}
        />
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full opacity-10"
          style={{
            background:
              'radial-gradient(circle, oklch(0.80 0.05 110) 0%, transparent 60%)',
          }}
        />
      </div>

      {/* Card */}
      <div className="w-full max-w-sm animate-fade-up">
        <div className="bg-card rounded-3xl border border-border/60 shadow-sm shadow-primary/5 px-8 py-10 flex flex-col items-center gap-6">
          {/* Logo — el emblema ya incluye el nombre, el h1 queda solo para lectores de pantalla */}
          <div className="w-full text-center space-y-3 opacity-0 animate-fade-up delay-100">
            <h1 className="sr-only">Clóset Digital</h1>
            <Image
              src="/logo-emblema.png"
              alt=""
              width={760}
              height={340}
              priority
              className="w-full h-auto"
            />
            <p className="text-sm text-muted-foreground leading-relaxed">
              Tu armario, inteligente.
            </p>
          </div>

          {/* Divider */}
          <div className="w-full flex items-center gap-3 opacity-0 animate-fade-up delay-300">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-muted-foreground uppercase tracking-widest">
              acceder
            </span>
            <div className="flex-1 h-px bg-border" />
          </div>

          {/* Google button */}
          <div className="w-full opacity-0 animate-fade-up delay-400">
            <form action={signInWithGoogle}>
              <button
                type="submit"
                className="w-full flex items-center justify-center gap-3 px-5 py-3.5 rounded-xl border border-border bg-card text-sm font-medium text-foreground transition-all duration-200 hover:border-primary/40 hover:shadow-sm hover:bg-accent/30 active:scale-[0.98] cursor-pointer"
              >
                <GoogleIcon />
                Continuar con Google
              </button>
            </form>
          </div>

          {/* Footer note */}
          <p className="text-xs text-muted-foreground text-center leading-relaxed opacity-0 animate-fade-up delay-400">
            Al continuar, aceptas nuestros{' '}
            <span className="underline underline-offset-2 decoration-muted-foreground/50">
              términos de uso
            </span>
            .
          </p>
        </div>
      </div>
    </main>
  )
}
