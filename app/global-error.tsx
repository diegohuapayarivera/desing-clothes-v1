'use client'

import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <html lang="es">
      <body className="min-h-full flex flex-col items-center justify-center gap-4 p-6 text-center">
        <h2>Algo salió mal</h2>
        <button type="button" onClick={() => reset()}>
          Intentar de nuevo
        </button>
      </body>
    </html>
  )
}
