import type { PrendaConUrl } from '@/types'

const CAT_ORDER: Record<string, number> = {
  cuerpo_completo: 0,
  superior: 1,
  inferior: 2,
  abrigo: 3,
  calzado: 4,
  accesorio: 5,
}

export function OutfitCollage({
  prendas,
  onRemovePrenda,
}: Readonly<{
  prendas: PrendaConUrl[]
  onRemovePrenda?: (id: string) => void
}>) {
  const sorted = [...prendas].sort(
    (a, b) => (CAT_ORDER[a.categoria] ?? 9) - (CAT_ORDER[b.categoria] ?? 9),
  )

  const main = sorted.filter((p) =>
    ['superior', 'cuerpo_completo', 'inferior'].includes(p.categoria),
  )
  const extras = sorted.filter((p) =>
    ['calzado', 'abrigo', 'accesorio'].includes(p.categoria),
  )

  return (
    <div className="flex gap-1.5 w-full rounded-xl overflow-hidden bg-muted" style={{ aspectRatio: '4/3' }}>
      <div className="flex flex-col gap-1.5 flex-3 min-w-0">
        {main.map((p) => (
          <div key={p.id} className="relative flex-1 overflow-hidden rounded-lg bg-white">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.signedUrl} alt={p.tipo} className="w-full h-full object-cover" loading="lazy" />
            {onRemovePrenda && (
              <button
                type="button"
                onClick={() => onRemovePrenda(p.id)}
                className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/50 text-white text-xs flex items-center justify-center hover:bg-black/70 transition-colors"
                aria-label={`Quitar ${p.tipo}`}
              >
                ✕
              </button>
            )}
          </div>
        ))}
        {main.length === 0 && <div className="flex-1 bg-muted rounded-lg" />}
      </div>

      {extras.length > 0 && (
        <div className="flex flex-col gap-1.5 flex-2 min-w-0">
          {extras.map((p) => (
            <div key={p.id} className="relative flex-1 overflow-hidden rounded-lg bg-white">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.signedUrl} alt={p.tipo} className="w-full h-full object-cover" loading="lazy" />
              {onRemovePrenda && (
                <button
                  type="button"
                  onClick={() => onRemovePrenda(p.id)}
                  className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/50 text-white text-xs flex items-center justify-center hover:bg-black/70 transition-colors"
                  aria-label={`Quitar ${p.tipo}`}
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
