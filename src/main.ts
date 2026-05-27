import './style.css'
import { SceneEditor } from './editor/scene-editor'
import { NodeEditor } from './logic/node-editor'
import { GameRunner } from './game/game-runner'
import { NODE_DEFS } from './logic/node-types'
import {
  getAllProjects, getCurrentId, saveProject, loadProject,
  deleteProject, createNewId, setCurrentId, formatDate
} from './projects'
import { getAllAssets, addAsset, deleteAsset } from './assets-store'

// ── Module instances ───────────────────────────────────────
let sceneEditor: SceneEditor | null = null
let nodeEditor: NodeEditor | null = null
let gameRunner: GameRunner | null = null
let currentProjectId = ''

// ── Tab switching ──────────────────────────────────────────
const tabBtns = document.querySelectorAll<HTMLButtonElement>('.tab-btn')
const tabPanels = document.querySelectorAll<HTMLElement>('.tab-panel')

function switchTab(name: string) {
  tabBtns.forEach(b => b.classList.toggle('active', b.dataset.tab === name))
  tabPanels.forEach(p => p.classList.toggle('active', p.id === `tab-${name}`))
  if (name === 'scene') sceneEditor?.resize()
}

tabBtns.forEach(btn => btn.addEventListener('click', () => switchTab(btn.dataset.tab!)))

// ── Scene editor ───────────────────────────────────────────
function initSceneEditor() {
  const viewport = document.getElementById('scene-viewport')!
  sceneEditor = new SceneEditor(viewport)

  sceneEditor.onSelect(obj => {
    const empty = document.getElementById('inspector-empty')!
    const props = document.getElementById('inspector-props')!
    if (!obj) {
      empty.classList.remove('hidden')
      props.classList.add('hidden')
      props.innerHTML = ''
      return
    }
    empty.classList.add('hidden')
    props.classList.remove('hidden')
    props.innerHTML = `
      <div class="inspector-title-row">
        <div class="inspector-title">${obj.type}</div>
        <button id="btn-close-inspector" class="inspector-close" title="Zamknij">✕</button>
      </div>
      <div class="inspector-row"><label>Nazwa</label><input type="text"   id="insp-label" value="${obj.label}" /></div>
      <div class="inspector-row"><label>X</label>    <input type="number" id="insp-x"     value="${Math.round(obj.x)}" /></div>
      <div class="inspector-row"><label>Y</label>    <input type="number" id="insp-y"     value="${Math.round(obj.y)}" /></div>
      ${obj.type === 'text' ? `<div class="inspector-row"><label>Tekst</label><input type="text" id="insp-txt" value="${obj.text ?? ''}" /></div>` : ''}
      ${obj.type !== 'text' ? `<div class="inspector-row"><label>Obraz</label><button id="btn-pick-asset" class="btn-secondary" style="flex:1;font-size:11px">${obj.assetKey ? getAllAssets().find(a => a.key === obj.assetKey)?.name ?? 'Zmień…' : 'Brak – wybierz…'}</button></div>` : ''}
      <div class="inspector-row" style="gap:6px">
        <button id="btn-duplicate-obj" class="btn-secondary">⧉ Duplikuj</button>
        <button id="btn-delete-obj" class="btn-danger">🗑 Usuń</button>
      </div>
    `
    props.querySelector<HTMLInputElement>('#insp-label')?.addEventListener('change', e =>
      sceneEditor?.updateObjectProp(obj.id, 'label', (e.target as HTMLInputElement).value))
    props.querySelector<HTMLInputElement>('#insp-x')?.addEventListener('change', e =>
      sceneEditor?.updateObjectProp(obj.id, 'x', parseFloat((e.target as HTMLInputElement).value)))
    props.querySelector<HTMLInputElement>('#insp-y')?.addEventListener('change', e =>
      sceneEditor?.updateObjectProp(obj.id, 'y', parseFloat((e.target as HTMLInputElement).value)))
    props.querySelector<HTMLInputElement>('#insp-txt')?.addEventListener('change', e =>
      sceneEditor?.updateObjectProp(obj.id, 'text', (e.target as HTMLInputElement).value))
    props.querySelector('#btn-close-inspector')?.addEventListener('click', () =>
      sceneEditor?.select(null))
    props.querySelector('#btn-pick-asset')?.addEventListener('click', () =>
      openAssetsModal(key => sceneEditor?.updateObjectProp(obj.id, 'assetKey', key)))
    props.querySelector('#btn-duplicate-obj')?.addEventListener('click', () =>
      sceneEditor?.duplicateObject(obj.id))
    props.querySelector('#btn-delete-obj')?.addEventListener('click', () =>
      sceneEditor?.removeObject(obj.id))
  })

  document.querySelectorAll<HTMLButtonElement>('.tool-btn[data-tool]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tool-btn[data-tool]').forEach(b => b.classList.remove('active'))
      btn.classList.add('active')
      sceneEditor?.setTool(btn.dataset.tool as 'select' | 'move' | 'add')
    })
  })

  document.getElementById('btn-add-sprite')?.addEventListener('click', () => sceneEditor?.addObject('sprite'))
  document.getElementById('btn-add-text')?.addEventListener('click', () => sceneEditor?.addObject('text'))
  document.getElementById('btn-undo')?.addEventListener('click', () => sceneEditor?.undo())
  document.getElementById('btn-redo')?.addEventListener('click', () => sceneEditor?.redo())

  const btnSnap = document.getElementById('btn-snap')!
  const snapXInput = document.getElementById('snap-x') as HTMLInputElement
  const snapYInput = document.getElementById('snap-y') as HTMLInputElement
  let snapActive = false

  function applySnap() {
    sceneEditor?.setSnap(snapActive, parseInt(snapXInput.value) || 32, parseInt(snapYInput.value) || 32)
  }

  btnSnap.addEventListener('click', () => {
    snapActive = !snapActive
    btnSnap.classList.toggle('active', snapActive)
    btnSnap.textContent = snapActive ? 'Włączony' : 'Wyłączony'
    applySnap()
  })
  snapXInput.addEventListener('change', applySnap)
  snapYInput.addEventListener('change', applySnap)

  const inspector = document.getElementById('scene-inspector')!
  const toggleBtn = document.getElementById('inspector-toggle')!
  let inspectorOpen = true
  toggleBtn.addEventListener('click', () => {
    inspectorOpen = !inspectorOpen
    inspector.classList.toggle('collapsed', !inspectorOpen)
    toggleBtn.textContent = inspectorOpen ? '▲ Panel' : '▼ Panel'
    if (inspectorOpen) sceneEditor?.resize()
  })

  // Keyboard shortcuts for selected object
  window.addEventListener('keydown', e => {
    if (document.activeElement?.tagName === 'INPUT') return
    if (e.key === 'Delete' || e.key === 'Backspace') {
      document.getElementById('btn-delete-obj')?.click()
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
      e.preventDefault()
      document.getElementById('btn-duplicate-obj')?.click()
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
      e.preventDefault()
      sceneEditor?.undo()
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
      e.preventDefault()
      sceneEditor?.redo()
    }
  })
}

// ── Node editor ────────────────────────────────────────────
function initNodeEditor() {
  const container = document.getElementById('node-editor-container')!
  nodeEditor = new NodeEditor(container)

  const menu = document.getElementById('node-add-menu')!
  const searchInput = document.getElementById('node-search') as HTMLInputElement
  const menuItems = document.getElementById('node-menu-items')!

  const CATEGORIES = [
    { id: 'event',  label: 'Zdarzenia' },
    { id: 'action', label: 'Akcje' },
    { id: 'value',  label: 'Wartości' },
  ] as const

  function renderNodeMenu(filter = '') {
    menuItems.innerHTML = ''
    const q = filter.toLowerCase().trim()
    const all = Object.values(NODE_DEFS)
    for (const cat of CATEGORIES) {
      const nodes = all.filter(n =>
        n.category === cat.id &&
        (!q || n.label.toLowerCase().includes(q) || n.type.includes(q))
      )
      if (!nodes.length) continue
      if (!q) {
        const title = document.createElement('div')
        title.className = 'menu-title'
        title.textContent = cat.label
        menuItems.appendChild(title)
      }
      for (const def of nodes) {
        const btn = document.createElement('button')
        btn.className = 'menu-item'
        btn.textContent = `${def.icon} ${def.label}`
        btn.addEventListener('click', () => {
          nodeEditor?.addNode(def.type)
          closeMenu()
        })
        menuItems.appendChild(btn)
      }
    }
  }

  function openMenu() {
    renderNodeMenu('')
    menu.classList.remove('hidden')
    searchInput.value = ''
  }
  function closeMenu() {
    menu.classList.add('hidden')
  }

  document.getElementById('btn-add-node')?.addEventListener('click', e => {
    e.stopPropagation()
    menu.classList.contains('hidden') ? openMenu() : closeMenu()
  })
  searchInput.addEventListener('input', () => renderNodeMenu(searchInput.value))
  searchInput.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeMenu()
    if (e.key === 'Enter') {
      const first = menuItems.querySelector<HTMLButtonElement>('.menu-item')
      first?.click()
    }
  })
  document.getElementById('btn-clear-graph')?.addEventListener('click', () => {
    if (confirm('Wyczyścić cały graf?')) nodeEditor?.clear()
  })
  document.getElementById('btn-export-graph')?.addEventListener('click', () => {
    const blob = new Blob([nodeEditor?.serialize() ?? '{}'], { type: 'application/json' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'graph.json'; a.click()
  })
  document.addEventListener('click', () => menu.classList.add('hidden'))
}

// ── Game runner ────────────────────────────────────────────
function initPlayTab() {
  const playViewport = document.getElementById('play-viewport')!
  const overlay = document.getElementById('play-overlay')!
  const btnStop = document.getElementById('btn-stop')!
  gameRunner = new GameRunner(playViewport)

  const startGame = () => {
    overlay.classList.add('hidden')
    btnStop.classList.remove('hidden')
    gameRunner?.start(sceneEditor?.getObjects() ?? [], nodeEditor?.serialize() ?? '{}')
  }
  const stopGame = () => {
    gameRunner?.stop()
    btnStop.classList.add('hidden')
    overlay.classList.remove('hidden')
  }

  document.getElementById('btn-play-start')?.addEventListener('click', startGame)
  document.getElementById('btn-play-header')?.addEventListener('click', () => { switchTab('play'); startGame() })
  btnStop.addEventListener('click', stopGame)
}

// ── Project management ─────────────────────────────────────
function getNameInput(): string {
  return (document.getElementById('project-name') as HTMLInputElement).value.trim() || 'Projekt'
}
function setNameInput(name: string) {
  (document.getElementById('project-name') as HTMLInputElement).value = name
}

function save(showFeedback = true) {
  const objects = sceneEditor?.getObjects().map(o => ({
    id: o.id, type: o.type, x: o.x, y: o.y,
    width: o.width, height: o.height, label: o.label, color: o.color, text: o.text, assetKey: o.assetKey
  })) ?? []
  const graph = nodeEditor?.serialize() ?? '{}'

  if (!currentProjectId) currentProjectId = createNewId()
  saveProject(currentProjectId, getNameInput(), objects, graph)

  if (showFeedback) {
    const btn = document.getElementById('btn-save')!
    btn.textContent = '✓'
    setTimeout(() => { btn.textContent = '💾' }, 1500)
  }
}

function applyProject(proj: { name: string; objects: unknown[]; graph: string }) {
  setNameInput(proj.name)
  sceneEditor?.loadScene(proj.objects as Parameters<SceneEditor['loadScene']>[0])
  if (nodeEditor && proj.graph) nodeEditor.load(proj.graph)
}

// ── Project manager modal ──────────────────────────────────
function renderProjectList() {
  const list = document.getElementById('project-list')!
  const all = getAllProjects()

  if (!all.length) {
    list.innerHTML = '<div class="project-list-empty">Brak zapisanych projektów.<br>Zapisz obecny projekt przyciskiem 💾</div>'
    return
  }

  list.innerHTML = ''
  for (const proj of all) {
    const isCurrent = proj.id === currentProjectId
    const item = document.createElement('div')
    item.className = `project-item${isCurrent ? ' current' : ''}`
    item.innerHTML = `
      <div class="project-item-info">
        <div class="project-item-name">${proj.name}</div>
        <div class="project-item-date">${formatDate(proj.savedAt)}</div>
        ${isCurrent ? '<div class="project-item-current">● AKTUALNY</div>' : ''}
      </div>
      <div class="project-item-actions">
        ${!isCurrent ? `<button class="btn-load" data-id="${proj.id}">Wczytaj</button>` : ''}
        <button class="btn-delete" data-id="${proj.id}" title="Usuń projekt">🗑</button>
      </div>
    `
    list.appendChild(item)
  }

  list.querySelectorAll<HTMLButtonElement>('.btn-load').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id!
      const proj = loadProject(id)
      if (!proj) return
      save(false) // auto-save current before switching
      currentProjectId = id
      setCurrentId(id)
      applyProject(proj)
      closeModal()
    })
  })

  list.querySelectorAll<HTMLButtonElement>('.btn-delete').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id!
      const proj = getAllProjects().find(p => p.id === id)
      if (!confirm(`Usunąć projekt "${proj?.name}"?`)) return
      deleteProject(id)
      if (id === currentProjectId) {
        const remaining = getAllProjects()
        if (remaining.length) {
          const next = remaining[0]
          currentProjectId = next.id
          setCurrentId(next.id)
          applyProject(next)
        } else {
          currentProjectId = createNewId()
          setNameInput('Projekt 1')
          sceneEditor?.clearScene()
          nodeEditor?.clear()
        }
      }
      renderProjectList()
    })
  })
}

function openModal() {
  renderProjectList()
  document.getElementById('modal-backdrop')!.classList.remove('hidden')
}
function closeModal() {
  document.getElementById('modal-backdrop')!.classList.add('hidden')
}

document.getElementById('btn-projects')?.addEventListener('click', openModal)
document.getElementById('modal-close')?.addEventListener('click', closeModal)
document.getElementById('modal-backdrop')?.addEventListener('click', e => {
  if (e.target === e.currentTarget) closeModal()
})
document.getElementById('btn-new-project')?.addEventListener('click', () => {
  save(false)
  currentProjectId = createNewId()
  setCurrentId(currentProjectId)
  setNameInput('Nowy Projekt')
  sceneEditor?.clearScene()
  nodeEditor?.clear()
  closeModal()
})

document.getElementById('btn-save')?.addEventListener('click', () => save(true))
document.getElementById('btn-new')?.addEventListener('click', () => {
  if (!confirm('Nowy projekt? Obecny zostanie zapisany.')) return
  save(false)
  currentProjectId = createNewId()
  setCurrentId(currentProjectId)
  setNameInput('Nowy Projekt')
  sceneEditor?.clearScene()
  nodeEditor?.clear()
})

// Auto-save every 30s
setInterval(() => save(false), 30_000)

// ── Assets modal ───────────────────────────────────────────
let assetPickerCallback: ((key: string) => void) | null = null

function renderAssetsGrid() {
  const grid = document.getElementById('assets-grid')!
  const assets = getAllAssets()
  if (!assets.length) {
    grid.innerHTML = '<div class="assets-empty">Brak wgranych obrazów.<br>Kliknij „Wgraj obraz" poniżej.</div>'
    return
  }
  grid.innerHTML = ''
  for (const asset of assets) {
    const card = document.createElement('div')
    card.className = 'asset-card' + (assetPickerCallback ? ' pickable' : '')
    card.innerHTML = `
      <img src="${asset.dataUrl}" class="asset-thumb" />
      <div class="asset-name">${asset.name}</div>
      <button class="asset-delete" title="Usuń">✕</button>
      ${!assetPickerCallback ? `<button class="asset-add-scene" title="Dodaj do sceny">➕ Do sceny</button>` : ''}
    `
    card.querySelector('.asset-delete')?.addEventListener('click', e => {
      e.stopPropagation()
      if (!confirm(`Usunąć "${asset.name}"?`)) return
      deleteAsset(asset.key)
      renderAssetsGrid()
    })
    card.querySelector('.asset-add-scene')?.addEventListener('click', e => {
      e.stopPropagation()
      const obj = sceneEditor?.addObject('sprite')
      if (obj) sceneEditor?.updateObjectProp(obj.id, 'assetKey', asset.key)
      closeAssetsModal()
      switchTab('scene')
    })
    if (assetPickerCallback) {
      card.addEventListener('click', () => {
        assetPickerCallback!(asset.key)
        assetPickerCallback = null
        closeAssetsModal()
      })
    }
    grid.appendChild(card)
  }
}

function openAssetsModal(pickerCb?: (key: string) => void) {
  assetPickerCallback = pickerCb ?? null
  renderAssetsGrid()
  document.getElementById('modal-assets-backdrop')!.classList.remove('hidden')
}
function closeAssetsModal() {
  document.getElementById('modal-assets-backdrop')!.classList.add('hidden')
  assetPickerCallback = null
}

document.getElementById('btn-assets')?.addEventListener('click', () => openAssetsModal())
document.getElementById('modal-assets-close')?.addEventListener('click', closeAssetsModal)
document.getElementById('modal-assets-backdrop')?.addEventListener('click', e => {
  if (e.target === e.currentTarget) closeAssetsModal()
})

const fileInput = document.getElementById('asset-file-input') as HTMLInputElement
fileInput?.addEventListener('change', () => {
  const file = fileInput.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    try {
      addAsset(file.name, reader.result as string)
      sceneEditor?.reloadWithAssets()
      renderAssetsGrid()
    } catch {
      alert('Nie można wgrać – za mało miejsca w pamięci przeglądarki.')
    }
  }
  reader.readAsDataURL(file)
  fileInput.value = ''
})

// ── Boot ───────────────────────────────────────────────────
initSceneEditor()
initPlayTab()

sceneEditor!.onReady(() => {
  initNodeEditor()

  // Load last active project
  const savedId = getCurrentId()
  if (savedId) {
    const proj = loadProject(savedId)
    if (proj) {
      currentProjectId = savedId
      applyProject(proj)
      return
    }
  }
  // No saved project – start fresh with a new ID
  currentProjectId = createNewId()
})

window.addEventListener('resize', () => sceneEditor?.resize())
