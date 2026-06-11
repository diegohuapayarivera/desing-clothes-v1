import type { NivelClima } from '@/lib/recomendador'

const CACHE_KEY = 'closet_clima_cache'
const CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour

interface ClimaCache {
  nivelClima: NivelClima
  tempMax: number
  lat: number
  lon: number
  timestamp: number
}

export interface ClimaResult {
  nivelClima: NivelClima
  tempMax: number
  lat: number
  lon: number
}

function tempANivel(temp: number): NivelClima {
  if (temp < 15) return 'frio'
  if (temp <= 22) return 'templado'
  return 'calor'
}

async function geocodificarCiudad(ciudad: string): Promise<{ lat: number; lon: number } | null> {
  try {
    const res = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(ciudad)}&count=1&language=es`,
    )
    const data = (await res.json()) as { results?: { latitude: number; longitude: number }[] }
    const r = data.results?.[0]
    if (r?.latitude != null && r?.longitude != null) {
      return { lat: r.latitude, lon: r.longitude }
    }
  } catch {}
  return null
}

async function geolocalizarBrowser(): Promise<{ lat: number; lon: number } | null> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      resolve(null)
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      () => resolve(null),
      { timeout: 6000 },
    )
  })
}

async function fetchTempMax(lat: number, lon: number): Promise<number> {
  const res = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max&timezone=auto&forecast_days=1`,
  )
  const data = (await res.json()) as { daily?: { temperature_2m_max?: number[] } }
  const temp = data.daily?.temperature_2m_max?.[0]
  if (temp == null) throw new Error('No temperature data')
  return temp
}

function readCache(): ClimaResult | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const cache: ClimaCache = JSON.parse(raw)
    if (Date.now() - cache.timestamp < CACHE_TTL_MS) {
      return { nivelClima: cache.nivelClima, tempMax: cache.tempMax, lat: cache.lat, lon: cache.lon }
    }
  } catch {}
  return null
}

function writeCache(result: ClimaResult): void {
  try {
    const cache: ClimaCache = { ...result, timestamp: Date.now() }
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache))
  } catch {}
}

// Lima fallback
const LIMA = { lat: -12.046, lon: -77.043 }

export async function obtenerClima(
  ciudad: string | null | undefined,
  profileLat: number | null | undefined,
  profileLon: number | null | undefined,
): Promise<ClimaResult> {
  const cached = readCache()
  if (cached) return cached

  let coords: { lat: number; lon: number } | null = null

  if (profileLat != null && profileLon != null) {
    coords = { lat: profileLat, lon: profileLon }
  } else if (ciudad && ciudad.trim().length > 0) {
    coords = await geocodificarCiudad(ciudad.trim())
  }

  if (!coords) {
    coords = await geolocalizarBrowser()
  }

  if (!coords) coords = LIMA

  let tempMax: number
  try {
    tempMax = await fetchTempMax(coords.lat, coords.lon)
  } catch {
    // If API fails, return a sensible default for Lima
    tempMax = 20
  }

  const result: ClimaResult = {
    nivelClima: tempANivel(tempMax),
    tempMax,
    lat: coords.lat,
    lon: coords.lon,
  }

  writeCache(result)
  return result
}
