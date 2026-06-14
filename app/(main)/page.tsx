import { createClient } from '@/lib/supabase/server'
import { ClosetView } from '@/components/closet/ClosetView'
import { EmptyStateAgregar } from '@/components/closet/EmptyStateAgregar'
import { PlaneadosHoyBanner } from '@/components/closet/PlaneadosHoyBanner'
import { fetchPlaneadosHoy } from '@/app/closet/actions'
import { Sparkles } from 'lucide-react'
import type { Profile, Prenda, PrendaConUrl } from '@/types'

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

export default async function ClosetPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // user is guaranteed by layout — cast is safe
  const { data: profile } = await supabase
    .from('profiles')
    .select('preferencia_prendas, nombre, ciudad, lat, lon')
    .eq('id', user!.id)
    .single<Pick<Profile, 'preferencia_prendas' | 'nombre' | 'ciudad' | 'lat' | 'lon'>>()

  const { data: prendas } = await supabase
    .from('prendas')
    .select('*')
    .eq('user_id', user!.id)
    .order('created_at', { ascending: false })

  const prendasData = (prendas ?? []) as Prenda[]

  let prendasConUrls: PrendaConUrl[] = []
  if (prendasData.length > 0) {
    const fotoPaths = prendasData.map((p) => p.foto_path)
    const { data: signedData } = await supabase.storage
      .from('prendas-fotos')
      .createSignedUrls(fotoPaths, 3600)

    const urlMap = new Map((signedData ?? []).map((s) => [s.path, s.signedUrl ?? '']))
    prendasConUrls = prendasData.map((p) => ({
      ...p,
      signedUrl: urlMap.get(p.foto_path) ?? '',
    }))
  }

  const preferencia = profile?.preferencia_prendas ?? 'ambas'
  const nombre = profile?.nombre ?? null
  const ciudad = profile?.ciudad ?? null
  const profileLat = profile?.lat ?? null
  const profileLon = profile?.lon ?? null
  const tieneRopa = prendasConUrls.length > 0

  const planeadosHoy = await fetchPlaneadosHoy()

  return (
    <>
      <div className="mb-8 animate-fade-up">
        <p className="text-sm text-muted-foreground mb-1">
          {tieneRopa ? 'Tu clóset' : 'Bienvenida de vuelta'}
        </p>
        <h1
          className="text-3xl font-light text-foreground leading-tight"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          Hola, {nombre?.split(' ')[0]} ✦
        </h1>
      </div>

      {planeadosHoy.length > 0 && (
        <PlaneadosHoyBanner planeados={planeadosHoy} />
      )}

      {tieneRopa ? (
        <ClosetView
          prendas={prendasConUrls}
          preferencia={preferencia}
          ciudad={ciudad}
          profileLat={profileLat}
          profileLon={profileLon}
        />
      ) : (
        <div className="animate-fade-up delay-100">
          <div className="flex flex-col items-center text-center py-12 px-6">
            <div className="mb-6 opacity-70">
              <EmptyClosetIllustration />
            </div>
            <h2
              className="text-xl font-light text-foreground mb-2"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              Tu clóset está vacío
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-xs mb-8">
              Agrega tus prendas para empezar a recibir recomendaciones personalizadas.
            </p>
            <EmptyStateAgregar preferencia={preferencia} />
          </div>

          <div className="mt-4 animate-fade-up delay-200">
            <button
              disabled
              className="w-full flex items-center justify-center gap-2 px-5 py-4 rounded-xl bg-primary/5 border border-primary/20 text-sm font-medium text-primary/40 cursor-not-allowed"
              aria-label="Próximamente: recomendaciones de outfits"
            >
              <Sparkles className="w-4 h-4" aria-hidden="true" />
              ¿Qué me pongo hoy?
              <span className="ml-auto text-xs bg-primary/10 text-primary/50 px-2 py-0.5 rounded-full">
                Próximamente
              </span>
            </button>
          </div>
        </div>
      )}
    </>
  )
}
