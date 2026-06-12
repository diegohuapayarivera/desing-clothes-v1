import type { PrendaConUrl } from '@/types'

const CAT_ORDER: Record<string, number> = {
  cuerpo_completo: 0,
  superior: 1,
  inferior: 2,
  abrigo: 3,
  calzado: 4,
  accesorio: 5,
}

function PrendaCell({
  p,
  onRemovePrenda,
  isReplacing,
  anyReplacing,
  isPinned,
}: Readonly<{
  p: PrendaConUrl
  onRemovePrenda?: (id: string) => void
  isReplacing: boolean
  anyReplacing: boolean
  isPinned: boolean
}>) {
  return (
    <div className="relative flex-1 overflow-hidden rounded-lg bg-white">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={p.signedUrl} alt={p.tipo} className="w-full h-full object-cover" loading="lazy" />
      {onRemovePrenda && !isReplacing && !isPinned && (
        <button
          type="button"
          onClick={() => onRemovePrenda(p.id)}
          disabled={anyReplacing}
          className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/50 text-white text-xs flex items-center justify-center hover:bg-black/70 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          aria-label={`Quitar ${p.tipo}`}
        >
          ✕
        </button>
      )}
      {isPinned && (
        <span className="absolute bottom-1 left-1 text-[10px] bg-black/40 text-white px-1.5 py-0.5 rounded-full leading-tight pointer-events-none">
          Tu elección
        </span>
      )}
      {isReplacing && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/35 rounded-lg">
          <div className="w-5 h-5 rounded-full border-2 border-white border-t-transparent animate-spin" />
        </div>
      )}
    </div>
  )
}

export function OutfitCollage({
  prendas,
  onRemovePrenda,
  replacingPrendaId,
  pinnedIds,
}: Readonly<{
  prendas: PrendaConUrl[]
  onRemovePrenda?: (id: string) => void
  replacingPrendaId?: string
  pinnedIds?: string[]
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

  const anyReplacing = !!replacingPrendaId
  const pinnedSet = new Set(pinnedIds ?? [])

  return (
    <div className="flex gap-1.5 w-full rounded-xl overflow-hidden bg-muted" style={{ aspectRatio: '4/3' }}>
      <div className="flex flex-col gap-1.5 flex-3 min-w-0">
        {main.map((p) => (
          <PrendaCell
            key={p.id}
            p={p}
            onRemovePrenda={onRemovePrenda}
            isReplacing={p.id === replacingPrendaId}
            anyReplacing={anyReplacing}
            isPinned={pinnedSet.has(p.id)}
          />
        ))}
        {main.length === 0 && <div className="flex-1 bg-muted rounded-lg" />}
      </div>

      {extras.length > 0 && (
        <div className="flex flex-col gap-1.5 flex-2 min-w-0">
          {extras.map((p) => (
            <PrendaCell
              key={p.id}
              p={p}
              onRemovePrenda={onRemovePrenda}
              isReplacing={p.id === replacingPrendaId}
              anyReplacing={anyReplacing}
              isPinned={pinnedSet.has(p.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
