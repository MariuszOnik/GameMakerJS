export interface Asset {
  key: string
  name: string
  dataUrl: string
}

const STORE_KEY = 'gmjs_assets'

function load(): Asset[] {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) ?? '[]') } catch { return [] }
}

export function getAllAssets(): Asset[] { return load() }

export function addAsset(name: string, dataUrl: string): Asset {
  const assets = load()
  const key = `asset_${Date.now()}`
  const asset: Asset = { key, name, dataUrl }
  assets.push(asset)
  localStorage.setItem(STORE_KEY, JSON.stringify(assets))
  return asset
}

export function deleteAsset(key: string) {
  localStorage.setItem(STORE_KEY, JSON.stringify(load().filter(a => a.key !== key)))
}
