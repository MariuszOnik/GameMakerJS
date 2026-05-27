import './style.css'
import { SceneEditor } from './editor/scene-editor'
import { NodeEditor } from './logic/node-editor'
import { GameRunner } from './game/game-runner'
import { getAllNodeDefs } from './logic/node-registry'
import { getCustomNodes, saveCustomNode, deleteCustomNode } from './logic/custom-nodes'
import type { CustomNodeDef } from './logic/custom-nodes'
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
      <div class="inspector-row"><label>X</label><input type="number" id="insp-x" value="${Math.round(obj.x)}" /></div>
      <div class="inspector-row"><label>Y</label><input type="number" id="insp-y" value="${Math.round(obj.y)}" /></div>
      ${obj.type !== 'text' ? `
      <div class="inspector-row"><label>W</label><input type="number" id="insp-w" value="${obj.width ?? 64}" /></div>
      <div class="inspector-row"><label>H</label><input type="number" id="insp-h" value="${obj.height ?? 64}" /></div>` : ''}
      ${obj.type === 'text' ? `<div class="inspector-row"><label>Tekst</label><input type="text" id="insp-txt" value="${obj.text ?? ''}" /></div>` : ''}
      ${obj.type !== 'text' ? `<div class="inspector-row"><label>Obraz</label><button id="btn-pick-asset" class="btn-secondary" style="flex:1;font-size:11px">${obj.assetKey ? getAllAssets().find(a => a.key === obj.assetKey)?.name ?? 'Zmień…' : 'Brak – wybierz…'}</button></div>` : ''}
      <div class="inspector-section-label">Fizyka</div>
      <div class="inspector-row">
        <label>Fizyka</label>
        <input type="checkbox" id="insp-physics" ${obj.physicsEnabled ? 'checked' : ''} />
      </div>
      <div id="physics-extra" class="${obj.physicsEnabled ? '' : 'hidden'}">
        <div class="inspector-row">
          <label>Statyczny</label>
          <input type="checkbox" id="insp-static" ${obj.isStatic ? 'checked' : ''} />
        </div>
        <div class="inspector-row">
          <label>Odbicie</label>
          <input type="number" id="insp-bounce" class="insp-number" value="${obj.bounce ?? 0}" min="0" max="1" step="0.1" />
        </div>
        <div class="inspector-row">
          <label>Grawitacja</label>
          <input type="checkbox" id="insp-gravity" ${obj.allowGravity !== false ? 'checked' : ''} />
        </div>
        <div class="inspector-row">
          <label>Granice</label>
          <input type="checkbox" id="insp-worldbounds" ${obj.collideWorldBounds ? 'checked' : ''} />
        </div>
        <div class="inspector-row">
          <label>Kamera śledzi</label>
          <input type="checkbox" id="insp-camfollow" ${obj.cameraFollow ? 'checked' : ''} />
        </div>
      </div>
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
    props.querySelector<HTMLInputElement>('#insp-w')?.addEventListener('change', e =>
      sceneEditor?.updateObjectProp(obj.id, 'width', parseFloat((e.target as HTMLInputElement).value)))
    props.querySelector<HTMLInputElement>('#insp-h')?.addEventListener('change', e =>
      sceneEditor?.updateObjectProp(obj.id, 'height', parseFloat((e.target as HTMLInputElement).value)))
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
    props.querySelector<HTMLInputElement>('#insp-physics')?.addEventListener('change', e => {
      const enabled = (e.target as HTMLInputElement).checked
      sceneEditor?.updateObjectProp(obj.id, 'physicsEnabled', enabled)
      props.querySelector<HTMLElement>('#physics-extra')?.classList.toggle('hidden', !enabled)
    })
    props.querySelector<HTMLInputElement>('#insp-static')?.addEventListener('change', e =>
      sceneEditor?.updateObjectProp(obj.id, 'isStatic', (e.target as HTMLInputElement).checked))
    props.querySelector<HTMLInputElement>('#insp-bounce')?.addEventListener('change', e =>
      sceneEditor?.updateObjectProp(obj.id, 'bounce', parseFloat((e.target as HTMLInputElement).value)))
    props.querySelector<HTMLInputElement>('#insp-gravity')?.addEventListener('change', e =>
      sceneEditor?.updateObjectProp(obj.id, 'allowGravity', (e.target as HTMLInputElement).checked))
    props.querySelector<HTMLInputElement>('#insp-worldbounds')?.addEventListener('change', e =>
      sceneEditor?.updateObjectProp(obj.id, 'collideWorldBounds', (e.target as HTMLInputElement).checked))
    props.querySelector<HTMLInputElement>('#insp-camfollow')?.addEventListener('change', e =>
      sceneEditor?.updateObjectProp(obj.id, 'cameraFollow', (e.target as HTMLInputElement).checked))
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
    const all = Object.values(getAllNodeDefs())
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
    width: o.width, height: o.height, label: o.label, color: o.color, text: o.text, assetKey: o.assetKey,
    physicsEnabled: o.physicsEnabled, isStatic: o.isStatic, bounce: o.bounce,
    allowGravity: o.allowGravity, collideWorldBounds: o.collideWorldBounds, cameraFollow: o.cameraFollow
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
      const dataUrl = reader.result as string
      const existing = getAllAssets().find(a => a.name === file.name)
      if (existing) {
        if (!confirm(`Obraz "${file.name}" już istnieje. Zastąpić?`)) return
        deleteAsset(existing.key)
      }
      addAsset(file.name, dataUrl)
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

// Na samym dole pliku (np. src/main.ts lub index.ts)
// @ts-ignore
import { registerSW } from 'virtual:pwa-register'

if ('serviceWorker' in navigator) {
  registerSW({
    immediate: true,
    onNeedRefresh() {
      console.log('[PWA] Dostępna nowa wersja! Przeładuj aplikację.')
    },
    onOfflineReady() {
      console.log('[PWA] Aplikacja w pełni gotowa do pracy OFFLINE!')
    }
  })
}

// ── Custom nodes modal ─────────────────────────────────────
const CUSTOM_NODE_TEMPLATE = [
  "registerNode({",
  "  type: 'moj-wezel',       // unikalny ID (bez spacji)",
  "  label: 'Mój węzeł',     // nazwa w menu",
  "  icon: '⭐',              // emoji",
  "  category: 'action',     // 'action' | 'value' | 'event'",
  "",
  "  props: {",
  "    target: { label: 'Sprite ID', defaultValue: 'Sprite1' },",
  "    amount: { label: 'Wartość',   defaultValue: 10 }",
  "  },",
  "",
  "  // inputs.X = skompilowane wyrażenie JS dla danego props.X",
  "  // 'this' w runtime = Phaser PlayScene",
  "  // Dostępne: this.sprites, this.variables, this.time, this.cameras, this.physics",
  "  run(inputs) {",
  "    return `",
  "      const _s = this.sprites.get(${inputs.target});",
  "      if (_s) {",
  "        // twój kod tutaj",
  "        console.log('Węzeł działa!', ${inputs.amount});",
  "      }",
  "    `",
  "  }",
  "})"
].join('\n')

function renderCustomNodeList() {
  const list = document.getElementById('custom-node-list')!
  const nodes = getCustomNodes()
  if (!nodes.length) {
    list.innerHTML = '<div class="custom-nodes-empty">Brak własnych węzłów. Napisz kod poniżej i kliknij Zarejestruj.</div>'
    return
  }
  list.innerHTML = ''
  for (const n of nodes) {
    const row = document.createElement('div')
    row.className = 'custom-node-row'
    row.innerHTML = `
      <span class="custom-node-icon">${n.icon}</span>
      <span class="custom-node-label">${n.label}</span>
      <code class="custom-node-type">${n.type}</code>
      <button class="custom-node-del" data-type="${n.type}" title="Usuń">🗑</button>
    `
    row.querySelector<HTMLButtonElement>('.custom-node-del')?.addEventListener('click', () => {
      if (!confirm(`Usunąć węzeł "${n.label}"?`)) return
      deleteCustomNode(n.type)
      renderCustomNodeList()
    })
    list.appendChild(row)
  }
}

function openCustomNodesModal() {
  renderCustomNodeList()
  const ta = document.getElementById('custom-node-code') as HTMLTextAreaElement
  if (!ta.value.trim()) ta.value = CUSTOM_NODE_TEMPLATE
  document.getElementById('custom-node-feedback')!.className = 'hidden'
  document.getElementById('modal-code-backdrop')!.classList.remove('hidden')
}
function closeCustomNodesModal() {
  document.getElementById('modal-code-backdrop')!.classList.add('hidden')
}

document.getElementById('btn-custom-nodes')?.addEventListener('click', e => {
  e.stopPropagation()
  openCustomNodesModal()
})
document.getElementById('modal-code-close')?.addEventListener('click', closeCustomNodesModal)
document.getElementById('modal-code-backdrop')?.addEventListener('click', e => {
  if (e.target === e.currentTarget) closeCustomNodesModal()
})

document.getElementById('btn-register-node')?.addEventListener('click', () => {
  const code = (document.getElementById('custom-node-code') as HTMLTextAreaElement).value.trim()
  const fb = document.getElementById('custom-node-feedback')!

  try {
    let captured: CustomNodeDef | null = null
    const registerNode = (def: Record<string, unknown>) => {
      if (!def.type || typeof def.type !== 'string') throw new Error('Brak pola "type"')
      if (!def.run || typeof def.run !== 'function') throw new Error('Brak funkcji run(inputs)')
      captured = {
        type: def.type,
        label: String(def.label ?? def.type),
        icon: String(def.icon ?? '⭐'),
        category: (def.category as CustomNodeDef['category']) ?? 'action',
        props: (def.props as CustomNodeDef['props']) ?? {},
        runSource: (def.run as Function).toString()
      }
    }
    new Function('registerNode', code)(registerNode)
    if (!captured) throw new Error('Nie wywołano registerNode()')
    saveCustomNode(captured)
    renderCustomNodeList()
    fb.textContent = `✓ Węzeł "${(captured as CustomNodeDef).label}" zarejestrowany!`
    fb.className = 'custom-node-success'
  } catch (err: unknown) {
    fb.textContent = String(err)
    fb.className = 'custom-node-error-msg'
  }
})

// ── Help modal ─────────────────────────────────────────────
function openHelp() { document.getElementById('modal-help-backdrop')!.classList.remove('hidden') }
function closeHelp() { document.getElementById('modal-help-backdrop')!.classList.add('hidden') }
document.getElementById('btn-help')?.addEventListener('click', openHelp)
document.getElementById('modal-help-close')?.addEventListener('click', closeHelp)
document.getElementById('modal-help-backdrop')?.addEventListener('click', e => {
  if (e.target === e.currentTarget) closeHelp()
})
