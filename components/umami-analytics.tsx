import Script from 'next/script'

export function UmamiAnalytics() {
  const id = process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID
  if (!id) return null

  return (
    <Script
      src="https://stats.nrlsys.com/script.js"
      data-website-id={id}
      strategy="afterInteractive"
    />
  )
}
