import { createClient } from '@/lib/supabase/server'
import { MisConjuntos } from '@/components/closet/MisConjuntos'
import type { Prenda, PrendaConUrl, Conjunto } from '@/types'

export default async function ConjuntosPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const [{ data: conjuntosData }, { data: prendasData }] = await Promise.all([
    supabase
      .from('conjuntos')
      .select('*')
      .eq('user_id', user!.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('prendas')
      .select('*')
      .eq('user_id', user!.id)
      .order('created_at', { ascending: false }),
  ])

  const conjuntos = (conjuntosData ?? []) as Conjunto[]
  const prendas = (prendasData ?? []) as Prenda[]

  let prendasConUrls: PrendaConUrl[] = []
  if (prendas.length > 0) {
    const { data: signedData } = await supabase.storage
      .from('prendas-fotos')
      .createSignedUrls(prendas.map((p) => p.foto_path), 3600)

    const urlMap = new Map((signedData ?? []).map((s) => [s.path, s.signedUrl ?? '']))
    prendasConUrls = prendas.map((p) => ({ ...p, signedUrl: urlMap.get(p.foto_path) ?? '' }))
  }

  return <MisConjuntos conjuntos={conjuntos} prendasConUrl={prendasConUrls} />
}
