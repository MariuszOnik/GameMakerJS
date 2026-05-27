export interface SavedProject {
  id: string
  name: string
  savedAt: number
  objects: unknown[]
  graph: string
}

interface Store {
  currentId: string
  projects: Record<string, SavedProject>
}

const KEY = 'gmjs_store'

function load(): Store {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw) as Store
  } catch { /* ignore */ }
  return { currentId: '', projects: {} }
}

function persist(store: Store) {
  localStorage.setItem(KEY, JSON.stringify(store))
}

export function getAllProjects(): SavedProject[] {
  const store = load()
  return Object.values(store.projects).sort((a, b) => b.savedAt - a.savedAt)
}

export function getCurrentId(): string {
  return load().currentId
}

export function saveProject(id: string, name: string, objects: unknown[], graph: string) {
  const store = load()
  store.projects[id] = { id, name, savedAt: Date.now(), objects, graph }
  store.currentId = id
  persist(store)
}

export function loadProject(id: string): SavedProject | null {
  const store = load()
  return store.projects[id] ?? null
}

export function deleteProject(id: string) {
  const store = load()
  delete store.projects[id]
  if (store.currentId === id) {
    const remaining = Object.keys(store.projects)
    store.currentId = remaining[0] ?? ''
  }
  persist(store)
}

export function createNewId(): string {
  return `proj_${Date.now()}`
}

export function setCurrentId(id: string) {
  const store = load()
  store.currentId = id
  persist(store)
}

export function formatDate(ts: number): string {
  return new Date(ts).toLocaleString('pl-PL', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  })
}
