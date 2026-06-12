import { createClient } from '@/lib/supabase/server'
import { CalendarioView } from '@/components/closet/CalendarioView'
import type { Prenda, PrendaConUrl, Conjunto, OutfitUsado } from '@/types'

export default async function CalendarioPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const now = new Date()
  const calYear = now.getFullYear()
  const calMonth = now.getMonth()
  const calMm = String(calMonth + 1).padStart(2, '0')
  const calFirstDay = `${calYear}-${calMm}-01`
  const calLastDate = new Date(calYear, calMonth + 1, 0).getDate()
  const calLastDay = `${calYear}-${calMm}-${String(calLastDate).padStart(2, '0')}`

  const [{ data: outfitsData }, { data: prendasData }, { data: conjuntosData }] = await Promise.all([
    supabase
      .from('outfits_usados')
      .select('*')
      .eq('user_id', user!.id)
      .gte('fecha', calFirstDay)
      .lte('fecha', calLastDay)
      .order('fecha', { ascending: false }),
    supabase
      .from('prendas')
      .select('*')
      .eq('user_id', user!.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('conjuntos')
      .select('*')
      .eq('user_id', user!.id)
      .order('created_at', { ascending: false }),
  ])

  const outfitsUsados = (outfitsData ?? []) as OutfitUsado[]
  const prendas = (prendasData ?? []) as Prenda[]
  const conjuntos = (conjuntosData ?? []) as Conjunto[]

  let prendasConUrls: PrendaConUrl[] = []
  if (prendas.length > 0) {
    const { data: signedData } = await supabase.storage
      .from('prendas-fotos')
      .createSignedUrls(prendas.map((p) => p.foto_path), 3600)

    const urlMap = new Map((signedData ?? []).map((s) => [s.path, s.signedUrl ?? '']))
    prendasConUrls = prendas.map((p) => ({ ...p, signedUrl: urlMap.get(p.foto_path) ?? '' }))
  }

  return (
    <CalendarioView
      outfitsUsados={outfitsUsados}
      prendas={prendasConUrls}
      conjuntos={conjuntos}
      initialYear={calYear}
      initialMonth={calMonth}
    />
  )
}
