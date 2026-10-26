import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'

export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
      <h1 className="text-2xl font-semibold">Esta página no existe</h1>
      <p className="text-sm text-muted-foreground leading-relaxed max-w-xs mb-6">
        Revisa el link o vuelve a tu clóset.
      </p>
      <Link href="/" className={buttonVariants()}>
        Volver al inicio
      </Link>
    </main>
  )
}
