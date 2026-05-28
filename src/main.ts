import './style.css'
import { SceneEditor } from './editor/scene-editor'
import { NodeEditor } from './logic/node-editor'
import { GameRunner } from './game/game-runner'
import type { GameState } from './types'
import { buildGameHTML } from './export/game-template'
import { getAllNodeDefs } from './logic/node-registry'
import { getCustomNodes, saveCustomNode, deleteCustomNode } from './logic/custom-nodes'
import type { CustomNodeDef } from './logic/custom-nodes'
// @ts-ignore
import nodeBuildPrelude from './logic/node-builder-prelude.js?raw'
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

// ── State machine data ─────────────────────────────────────
// Each state has a name, objects (owned by sceneEditor) and a global graph.
// activeStateId points to the state currently being edited.
let states: GameState[] = []
let activeStateId = ''

// Node editor context: which graph is currently being edited.
// 'state' = the active state's global graph
// { objId } = a specific object's graph
type GraphContext = 'state' | { objId: string }
let graphContext: GraphContext = 'state'

// ── Helpers ────────────────────────────────────────────────

function getActiveState(): GameState | undefined {
  return states.find(s => s.id === activeStateId)
}

function syncOrientationUI() {
  const state = getActiveState()
  const val = state?.orientation ?? 'any'
  document.querySelectorAll<HTMLInputElement>('input[name="orientation"]').forEach(r => {
    r.checked = r.value === val
  })
}

function initOrientationControls() {
  document.querySelectorAll<HTMLInputElement>('input[name="orientation"]').forEach(radio => {
    radio.addEventListener('change', () => {
      const state = getActiveState()
      if (state) state.orientation = radio.value as GameState['orientation']
    })
  })
}

function createDefaultState(name: string): GameState {
  return { id: `state_${Date.now()}_${Math.random().toString(36).slice(2)}`, name, objects: [], graph: '' }
}

// Flush the current node-editor content into the right graph slot before switching.
function flushNodeEditor() {
  if (!nodeEditor) return
  const graph = nodeEditor.serialize()
  if (graphContext === 'state') {
    const s = getActiveState()
    if (s) s.graph = graph
  } else {
    sceneEditor?.setObjectGraph(graphContext.objId, graph)
  }
}

// Load the right graph into node-editor and update the context label.
function loadGraphForContext(ctx: GraphContext) {
  graphContext = ctx
  let json = ''
  let label = ''

  const state = getActiveState()
  if (ctx === 'state') {
    json = state?.graph ?? ''
    label = `${state?.name ?? '?'} / Globalny`
  } else {
    json = sceneEditor?.getObjectGraph(ctx.objId) ?? ''
    const obj = sceneEditor?.getObjects().find(o => o.id === ctx.objId)
    label = `${state?.name ?? '?'} / ${obj?.label ?? '?'}`
  }

  nodeEditor?.load(json)
  const el = document.getElementById('graph-context-label')
  if (el) el.textContent = `📝 ${label}`
}

// ── Tab switching ──────────────────────────────────────────
const tabBtns = document.querySelectorAll<HTMLButtonElement>('.tab-btn')
const tabPanels = document.querySelectorAll<HTMLElement>('.tab-panel')

function switchTab(name: string) {
  tabBtns.forEach(b => b.classList.toggle('active', b.dataset.tab === name))
  tabPanels.forEach(p => p.classList.toggle('active', p.id === `tab-${name}`))
  if (name === 'scene') sceneEditor?.resize()
  // When switching to logic tab, refresh node editor context
  if (name === 'logic') loadGraphForContext(graphContext)
}

tabBtns.forEach(btn => btn.addEventListener('click', () => {
  flushNodeEditor()
  switchTab(btn.dataset.tab!)
}))

// ── State management ───────────────────────────────────────

function renderStateTabs() {
  const bar = document.getElementById('state-tabs-bar')!
  bar.innerHTML = ''

  for (const s of states) {
    const btn = document.createElement('button')
    btn.className = 'state-tab' + (s.id === activeStateId ? ' active' : '')
    btn.title = `Przełącz na stan: ${s.name}`

    const nameSpan = document.createElement('span')
    nameSpan.className = 'state-tab-name'
    nameSpan.textContent = s.name

    // Inline rename on double-click
    nameSpan.addEventListener('dblclick', e => {
      e.stopPropagation()
      const input = document.createElement('input')
      input.className = 'state-tab-rename'
      input.value = s.name
      input.addEventListener('mousedown', ev => ev.stopPropagation())
      input.addEventListener('keydown', ev => {
        if (ev.key === 'Enter' || ev.key === 'Escape') input.blur()
      })
      input.addEventListener('blur', () => {
        const newName = input.value.trim() || s.name
        s.name = newName
        renderStateTabs()
      })
      nameSpan.replaceWith(input)
      input.focus()
      input.select()
    })

    const delBtn = document.createElement('button')
    delBtn.className = 'state-tab-del'
    delBtn.textContent = '✕'
    delBtn.title = 'Usuń stan'
    delBtn.addEventListener('click', e => {
      e.stopPropagation()
      if (states.length <= 1) return alert('Projekt musi mieć co najmniej jeden stan.')
      if (!confirm(`Usunąć stan "${s.name}"?`)) return
      const idx = states.indexOf(s)
      states.splice(idx, 1)
      if (activeStateId === s.id) {
        switchToState(states[Math.max(0, idx - 1)].id)
      } else {
        renderStateTabs()
      }
    })

    btn.appendChild(nameSpan)
    btn.appendChild(delBtn)
    btn.addEventListener('click', () => switchToState(s.id))
    bar.appendChild(btn)
  }

  const addBtn = document.createElement('button')
  addBtn.className = 'state-tab-add'
  addBtn.textContent = '＋ Stan'
  addBtn.title = 'Dodaj nowy stan'
  addBtn.addEventListener('click', () => {
    flushNodeEditor()
    saveCurrentStateObjects()
    const newState = createDefaultState(`Stan${states.length + 1}`)
    states.push(newState)
    switchToState(newState.id)
  })
  bar.appendChild(addBtn)
}

function switchToState(id: string) {
  flushNodeEditor()
  saveCurrentStateObjects()
  activeStateId = id
  const state = getActiveState()
  sceneEditor?.loadScene(state?.objects ?? [])
  renderStateTabs()
  loadGraphForContext('state')
  syncOrientationUI()
}

// Persist current sceneEditor objects back into the active state.
function saveCurrentStateObjects() {
  const state = getActiveState()
  if (!state) return
  state.objects = sceneEditor?.getObjects().map(({ phaserObj: _p, ...rest }) => ({
    ...rest,
    graph: rest.graph ?? ''
  })) ?? []
}

// ── Scene editor ───────────────────────────────────────────
function initSceneEditor() {
  const viewport = document.getElementById('scene-viewport')!
  sceneEditor = new SceneEditor(viewport)

  sceneEditor.onSelect(obj => {
    const empty = document.getElementById('inspector-empty')!
    const props = document.getElementById('inspector-props')!

    if (!obj) {
      // Deselected: flush object graph, switch context to state global graph
      flushNodeEditor()
      loadGraphForContext('state')
      empty.classList.remove('hidden')
      props.classList.add('hidden')
      props.innerHTML = ''
      return
    }

    // Selected object: flush current graph, switch context to object's graph
    flushNodeEditor()
    loadGraphForContext({ objId: obj.id })

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
        <button id="btn-edit-logic" class="btn-secondary">⬡ Edytuj logikę</button>
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
    props.querySelector('#btn-edit-logic')?.addEventListener('click', () => {
      switchTab('logic')
    })
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
    if (confirm('Wyczyścić bieżący graf?')) nodeEditor?.clear()
  })
  document.getElementById('btn-export-graph')?.addEventListener('click', () => {
    const blob = new Blob([nodeEditor?.serialize() ?? '{}'], { type: 'application/json' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'graph.json'; a.click()
  })
  document.addEventListener('click', () => menu.classList.add('hidden'))
}

// ── Game runner ────────────────────────────────────────────
function initPlayTab() {
  const playIframe = document.getElementById('play-iframe') as HTMLIFrameElement
  const overlay = document.getElementById('play-overlay')!
  const btnStop = document.getElementById('btn-stop')!
  const btnFullscreen = document.getElementById('btn-fullscreen')!
  gameRunner = new GameRunner(playIframe)

  const startGame = () => {
    flushNodeEditor()
    saveCurrentStateObjects()
    sceneEditor?.pauseLoop()
    overlay.classList.add('hidden')
    btnStop.classList.remove('hidden')
    btnFullscreen.classList.remove('hidden')
    gameRunner?.start(states, activeStateId, getAllAssets(), getCustomNodes())
  }
  const stopGame = () => {
    if (document.fullscreenElement) document.exitFullscreen()
    gameRunner?.stop()
    sceneEditor?.resumeLoop()
    btnStop.classList.add('hidden')
    btnFullscreen.classList.add('hidden')
    overlay.classList.remove('hidden')
  }

  btnFullscreen.addEventListener('click', () => {
    if (!document.fullscreenElement) {
      playIframe.requestFullscreen().catch(() => {})
    } else {
      document.exitFullscreen()
    }
  })

  document.addEventListener('fullscreenchange', () => {
    const isFs = !!document.fullscreenElement
    btnFullscreen.textContent = isFs ? '✕' : '⛶'
    btnFullscreen.title = isFs ? 'Wyjdź z pełnego ekranu' : 'Pełny ekran'
  })

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
  flushNodeEditor()
  saveCurrentStateObjects()

  if (!currentProjectId) currentProjectId = createNewId()
  saveProject(currentProjectId, getNameInput(), states, activeStateId)

  if (showFeedback) {
    const btn = document.getElementById('btn-save')!
    btn.textContent = '✓'
    setTimeout(() => { btn.textContent = '💾' }, 1500)
  }
}

function applyProject(proj: { name: string; states: GameState[]; activeStateId: string }) {
  setNameInput(proj.name)
  states = proj.states.length ? proj.states : [createDefaultState('Stan1')]
  activeStateId = proj.states.find(s => s.id === proj.activeStateId) ? proj.activeStateId : states[0].id
  const state = getActiveState()
  sceneEditor?.loadScene(state?.objects ?? [])
  renderStateTabs()
  loadGraphForContext('state')
  syncOrientationUI()
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
      save(false)
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
          states = [createDefaultState('Stan1')]
          activeStateId = states[0].id
          sceneEditor?.clearScene()
          renderStateTabs()
          loadGraphForContext('state')
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
  states = [createDefaultState('Stan1')]
  activeStateId = states[0].id
  sceneEditor?.clearScene()
  renderStateTabs()
  loadGraphForContext('state')
  closeModal()
})

document.getElementById('btn-save')?.addEventListener('click', () => save(true))

document.getElementById('btn-export-html')?.addEventListener('click', () => {
  flushNodeEditor()
  saveCurrentStateObjects()
  const assets = getAllAssets()
  const assetsMap = Object.fromEntries(assets.map(a => [a.key, a.dataUrl]))
  const html = buildGameHTML(states, assetsMap, activeStateId, getCustomNodes())
  const blob = new Blob([html], { type: 'text/html' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${getNameInput().replace(/\s+/g, '_') || 'gra'}.html`
  a.click()
  URL.revokeObjectURL(url)
})
document.getElementById('btn-new')?.addEventListener('click', () => {
  if (!confirm('Nowy projekt? Obecny zostanie zapisany.')) return
  save(false)
  currentProjectId = createNewId()
  setCurrentId(currentProjectId)
  setNameInput('Nowy Projekt')
  states = [createDefaultState('Stan1')]
  activeStateId = states[0].id
  sceneEditor?.clearScene()
  renderStateTabs()
  loadGraphForContext('state')
})

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
  initOrientationControls()

  const savedId = getCurrentId()
  if (savedId) {
    const proj = loadProject(savedId)
    if (proj) {
      currentProjectId = savedId
      applyProject(proj)
      return
    }
  }

  // Fresh start
  currentProjectId = createNewId()
  states = [createDefaultState('Stan1')]
  activeStateId = states[0].id
  renderStateTabs()
  loadGraphForContext('state')
})

window.addEventListener('resize', () => sceneEditor?.resize())

// @ts-ignore
import { registerSW } from 'virtual:pwa-register'

if ('serviceWorker' in navigator) {
  registerSW({
    immediate: true,
    onNeedRefresh() { console.log('[PWA] Nowa wersja dostępna!') },
    onOfflineReady() { console.log('[PWA] Tryb offline gotowy!') }
  })
}

// ── Custom nodes modal ─────────────────────────────────────
const CUSTOM_NODE_TEMPLATE = `// ── Węzeł akcji (ma exec wejście i wyjście) ─────────────────
let DisplayTekst = new Node('pokaz-tekst', 'Pokaż Tekst', '💬')
DisplayTekst.input('cel', 'string')  // port wejściowy — drut lub pole
DisplayTekst.input('txt', 'string')

/**
 * @this {NodeContext}
 * @param {{ cel: string, txt: string }} inputs
 */
DisplayTekst.Execute = function(inputs) {
  // this = Phaser.Scene + helpers
  // this.self                 — nazwa bieżącego obiektu
  // this.GetObjectByName(n)   — pobierz obiekt po nazwie
  // this.add.sprite(x,y,key)  — Phaser API (tworzenie obiektów)
  // this.DrawText(cel, txt)   — zmień tekst
  // this.Move(cel, dx, dy)    — przesuń
  // this.SetVelocity(cel,vx,vy) / Jump(cel,force)
  // this.SetPos(cel, x, y)    — teleportuj
  // this.Show/Hide/Toggle(cel)
  // this.GetX/GetY/GetVX/GetVY(cel)
  // this.GetVar(n)/SetVar(n,v) — globalne zmienne
  // this.ChangeState(n)       — zmień stan gry
  this.DrawText(inputs.cel, inputs.txt)
}

// ── Węzeł wartości (bez exec, zwraca dane przez SetOutput) ──
let GetPlayerPos = new Node('get-player-pos', 'Pozycja Gracza', '📍')
GetPlayerPos.noExecIn().noExecOut()
GetPlayerPos.output('pozycja', 'string')

/** @this {NodeContext} */
GetPlayerPos.Execute = function() {
  const player = this.GetObjectByName('Gracz')
  if (player) this.SetOutput('pozycja', player.x + ',' + player.y)
}`

let monacoEditor: unknown = null

function getEditorValue(): string {
  if (monacoEditor) return (monacoEditor as { getValue(): string }).getValue()
  return (document.getElementById('custom-node-code') as HTMLTextAreaElement | null)?.value ?? ''
}
function setEditorValue(v: string) {
  if (monacoEditor) { (monacoEditor as { setValue(s: string): void }).setValue(v); return }
  const ta = document.getElementById('custom-node-code') as HTMLTextAreaElement | null
  if (ta) ta.value = v
}

async function initMonacoEditor() {
  if (monacoEditor) return
  const container = document.getElementById('monaco-editor-container')
  if (!container) return
  await new Promise<void>((resolve, reject) => {
    if ((window as unknown as Record<string, unknown>).monaco) { resolve(); return }
    const s = document.createElement('script')
    s.src = 'https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs/loader.js'
    s.onload = () => resolve()
    s.onerror = reject
    document.head.appendChild(s)
  })
  const w = window as unknown as { require: { config(o: object): void; (deps: string[], cb: () => void): void } }
  w.require.config({ paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs' } })
  await new Promise<void>(resolve => w.require(['vs/editor/editor.main'], resolve))

  const monaco = (window as unknown as {
    monaco: {
      editor: { create(el: HTMLElement, opts: object): unknown }
      languages: { typescript: { javascriptDefaults: { addExtraLib(src: string, name: string): void } } }
    }
  }).monaco

  // Add type definitions for Node builder and Execute `this` context (IntelliSense)
  monaco.languages.typescript.javascriptDefaults.addExtraLib(`
declare class Node {
  constructor(type: string, label: string, icon?: string);
  input(name: string, type?: 'string'|'number'|'bool'|'any'|'text'|'tekst'|'liczba', label?: string): this;
  output(name: string, type?: 'string'|'number'|'bool', label?: string): this;
  prop(name: string, label: string, defaultValue?: string|number, options?: string[]): this;
  noExecIn(): this;
  noExecOut(): this;
  run(fn: (this: NodeContext, inputs: Record<string,any>) => void): this;
  Execute: ((this: NodeContext, inputs: Record<string,any>) => void) | null;
}
interface NodeContext {
  /** Nazwa bieżącego obiektu (self) */
  readonly self: string;
  /** Mapa wszystkich obiektów sceny: nazwa → Phaser.GameObjects.* */
  readonly sprites: Map<string, any>;
  /** Globalne zmienne gry */
  readonly variables: Map<string, number|string>;
  /** Phaser: tworzenie obiektów (this.add.sprite, this.add.text...) */
  readonly add: any;
  /** Phaser: kamera (this.cameras.main) */
  readonly cameras: any;
  /** Phaser: fizyka (this.physics.add.existing...) */
  readonly physics: any;
  /** Phaser: timery (this.time.delayedCall...) */
  readonly time: any;
  /** Pobierz obiekt po nazwie (alias dla sprites.get) */
  GetObjectByName(name: string): any;
  /** Ustaw wartość wyjściowego portu (dla węzłów wartości) */
  SetOutput(port: string, value: any): void;
  /** Zmień tekst obiektu */
  DrawText(target: string, text: string): void;
  /** Przesuń obiekt o delta */
  Move(target: string, dx: number, dy: number): void;
  /** Ustaw prędkość fizyki */
  SetVelocity(target: string, vx: number, vy: number): void;
  /** Skocz (gdy obiekt stoi na podłodze) */
  Jump(target: string, force?: number): void;
  /** Teleportuj obiekt */
  SetPos(target: string, x: number, y: number): void;
  Show(target: string): void;
  Hide(target: string): void;
  Toggle(target: string): void;
  GetX(target: string): number;
  GetY(target: string): number;
  GetVX(target: string): number;
  GetVY(target: string): number;
  /** Pobierz globalną zmienną */
  GetVar(name: string): number|string;
  /** Ustaw globalną zmienną */
  SetVar(name: string, value: number|string): void;
  /** Przejdź do innego stanu */
  ChangeState(name: string): void;
  PushState(name: string): void;
  PopState(): void;
  Log(...args: any[]): void;
}
`, 'ts:node-api.d.ts')

  monacoEditor = monaco.editor.create(container, {
    value: CUSTOM_NODE_TEMPLATE,
    language: 'javascript',
    theme: 'vs-dark',
    fontSize: 13,
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    automaticLayout: true,
    lineNumbers: 'on',
    roundedSelection: true,
    wordWrap: 'on'
  })
}

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
      <button class="custom-node-del" data-type="${n.type}" title="Usuń węzeł">🗑</button>
    `
    row.querySelector<HTMLButtonElement>('.custom-node-del')?.addEventListener('click', () => {
      if (!confirm(`Usunąć węzeł "${n.label}"?`)) return
      deleteCustomNode(n.type)
      renderCustomNodeList()
    })
    list.appendChild(row)
  }
}

async function openCustomNodesModal() {
  renderCustomNodeList()
  document.getElementById('modal-code-backdrop')!.classList.remove('hidden')
  const fb = document.getElementById('custom-node-feedback')!
  fb.className = 'hidden'; fb.textContent = ''
  await initMonacoEditor()
  if (!getEditorValue().trim()) setEditorValue(CUSTOM_NODE_TEMPLATE)
}
function closeCustomNodesModal() {
  document.getElementById('modal-code-backdrop')!.classList.add('hidden')
}

document.getElementById('btn-custom-nodes')?.addEventListener('click', () => openCustomNodesModal())
document.getElementById('modal-code-close')?.addEventListener('click', closeCustomNodesModal)
document.getElementById('modal-code-backdrop')?.addEventListener('click', e => {
  if (e.target === e.currentTarget) closeCustomNodesModal()
})
document.getElementById('btn-register-node')?.addEventListener('click', () => {
  const code = getEditorValue().trim()
  const fb = document.getElementById('custom-node-feedback')!
  try {
    const fullCode = `${nodeBuildPrelude}\n${code}\n__nodes`
    const created = new Function(fullCode)() as Array<{ _build(): CustomNodeDef; _label: string }>
    if (!created.length) throw new Error('Nie znaleziono węzła – utwórz: new Node("typ", "Nazwa", "ikona")')
    for (const n of created) saveCustomNode(n._build())
    renderCustomNodeList()
    fb.className = 'custom-node-ok'
    fb.textContent = `Zarejestrowano: ${created.map(n => `"${n._label}"`).join(', ')}`
  } catch (err) {
    fb.className = 'custom-node-err'
    fb.textContent = `Błąd: ${err instanceof Error ? err.message : String(err)}`
  }
})

// ── Help modal ─────────────────────────────────────────────
declare const __BUILD_TIME__: string

function openHelp() { document.getElementById('modal-help-backdrop')!.classList.remove('hidden') }
function closeHelp() { document.getElementById('modal-help-backdrop')!.classList.add('hidden') }
const helpBuildInfo = document.getElementById('help-build-info')
if (helpBuildInfo) helpBuildInfo.textContent = `GameMakerJS • build: ${__BUILD_TIME__}`

document.getElementById('btn-help')?.addEventListener('click', openHelp)
document.getElementById('modal-help-close')?.addEventListener('click', closeHelp)
document.getElementById('modal-help-backdrop')?.addEventListener('click', e => {
  if (e.target === e.currentTarget) closeHelp()
})
