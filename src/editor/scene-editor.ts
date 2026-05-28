import Phaser from 'phaser'
import { getAllAssets } from '../assets-store'
import type { SceneObjectDef } from '../types'

export interface SceneObject extends SceneObjectDef {
  phaserObj?: Phaser.GameObjects.GameObject
}

type Tool = 'select' | 'move' | 'add'

type Snapshot = Omit<SceneObject, 'phaserObj'>[]

export class SceneEditor {
  private game!: Phaser.Game
  private scene!: Phaser.Scene
  private container: HTMLElement
  private objects: SceneObject[] = []
  private selectedId: string | null = null
  private currentTool: Tool = 'select'
  private onSelectCallback?: (obj: SceneObject | null) => void
  private onReadyCallback?: () => void
  private idCounter = 0
  private undoStack: Snapshot[] = []
  private redoStack: Snapshot[] = []
  private snapEnabled = false
  private snapX = 32
  private snapY = 32
  private gridGfx?: Phaser.GameObjects.Graphics

  constructor(container: HTMLElement) {
    this.container = container
    this.init()
  }

  private init() {
    const w = this.container.clientWidth || window.innerWidth
    const h = this.container.clientHeight || window.innerHeight

    const editorRef = this

    class EditorScene extends Phaser.Scene {
      editor!: SceneEditor

      constructor() {
        super({ key: 'EditorScene' })
      }

      preload() {
        for (const asset of getAllAssets()) {
          this.load.image(asset.key, asset.dataUrl)
        }
      }

      create() {
        editorRef.scene = this as unknown as Phaser.Scene

        // Grid background
        editorRef.gridGfx = this.add.graphics()
        editorRef.redrawGrid()

        // Camera pan helpers
        const cam = this.cameras.main
        let spaceDown = false
        let lastTouchMidX = 0, lastTouchMidY = 0

        this.input.keyboard?.on('keydown-SPACE', () => { spaceDown = true })
        this.input.keyboard?.on('keyup-SPACE',   () => { spaceDown = false })

        this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
          const dx = (p.x - p.prevPosition.x) / cam.zoom
          const dy = (p.y - p.prevPosition.y) / cam.zoom

          // Middle mouse button – always pan
          if (p.middleButtonDown()) {
            cam.scrollX -= dx
            cam.scrollY -= dy
            return
          }

          // Space + left drag – pan (Figma-style)
          if (spaceDown && p.isDown) {
            cam.scrollX -= dx
            cam.scrollY -= dy
            return
          }

          // Move tool – pan with left button
          if (p.isDown && editorRef.currentTool === 'move') {
            cam.scrollX -= dx
            cam.scrollY -= dy
            return
          }

          // Two-finger touch pan
          const ptrs = this.input.manager.pointers.filter(pt => pt.isDown)
          if (ptrs.length >= 2) {
            const midX = (ptrs[0].x + ptrs[1].x) / 2
            const midY = (ptrs[0].y + ptrs[1].y) / 2
            if (lastTouchMidX !== 0) {
              cam.scrollX -= (midX - lastTouchMidX) / cam.zoom
              cam.scrollY -= (midY - lastTouchMidY) / cam.zoom
            }
            lastTouchMidX = midX
            lastTouchMidY = midY
          } else {
            lastTouchMidX = 0
            lastTouchMidY = 0
          }
        })

        // Mouse wheel zoom
        this.input.on('wheel', (_p: Phaser.Input.Pointer, _objs: unknown, _dx: number, dy: number) => {
          const factor = dy < 0 ? 1.1 : 0.9
          cam.setZoom(Math.min(3, Math.max(0.3, cam.zoom * factor)))
        })

        // Deselect on background click
        this.input.on('pointerdown', (_p: Phaser.Input.Pointer, targets: Phaser.GameObjects.GameObject[]) => {
          if (targets.length === 0 && editorRef.currentTool === 'select') {
            editorRef.select(null)
          }
        })

        // Restore saved objects if any
        editorRef.objects.forEach(obj => editorRef.spawnPhaserObj(obj))
        editorRef.onReadyCallback?.()
      }
    }

    this.game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: this.container,
      width: w,
      height: h,
      backgroundColor: '#0a0a18',
      scene: EditorScene,
      scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.CENTER_BOTH
      }
    })
  }

  setTool(tool: Tool) {
    this.currentTool = tool
  }

  private saveSnapshot() {
    const snap: Snapshot = this.objects.map(({ phaserObj: _p, ...rest }) => ({ ...rest }))
    this.undoStack.push(snap)
    if (this.undoStack.length > 50) this.undoStack.shift()
    this.redoStack = []
  }

  private restoreSnapshot(snap: Snapshot) {
    this.objects.forEach(o => {
      if (o.phaserObj) {
        const lbl = (o.phaserObj as Phaser.GameObjects.Rectangle).getData?.('labelRef') as Phaser.GameObjects.Text | undefined
        lbl?.destroy()
        ;(o.phaserObj as Phaser.GameObjects.GameObject).destroy()
      }
    })
    this.objects = snap.map(o => ({ ...o }))
    this.idCounter = this.objects.reduce((max, o) => {
      const n = parseInt(o.id.replace('obj_', '')) || 0
      return Math.max(max, n)
    }, this.idCounter)
    if (this.scene) this.objects.forEach(obj => this.spawnPhaserObj(obj))
    this.select(null)
  }

  undo() {
    if (!this.undoStack.length) return
    const current: Snapshot = this.objects.map(({ phaserObj: _p, ...rest }) => ({ ...rest }))
    this.redoStack.push(current)
    this.restoreSnapshot(this.undoStack.pop()!)
  }

  redo() {
    if (!this.redoStack.length) return
    const current: Snapshot = this.objects.map(({ phaserObj: _p, ...rest }) => ({ ...rest }))
    this.undoStack.push(current)
    this.restoreSnapshot(this.redoStack.pop()!)
  }

  setSnap(enabled: boolean, x: number, y: number) {
    this.snapEnabled = enabled
    this.snapX = Math.max(1, x)
    this.snapY = Math.max(1, y)
    this.redrawGrid()
  }

  redrawGrid() {
    const gfx = this.gridGfx
    if (!gfx) return
    gfx.clear()
    const sx = this.snapX
    const sy = this.snapY
    gfx.lineStyle(1, 0x1e293b, 1)
    for (let x = 0; x < 4000; x += sx) gfx.lineBetween(x, 0, x, 4000)
    for (let y = 0; y < 4000; y += sy) gfx.lineBetween(0, y, 4000, y)
  }

  private snap(v: number, step: number): number {
    if (!this.snapEnabled) return v
    return Math.round(v / step) * step
  }

  duplicateObject(id: string) {
    const src = this.objects.find(o => o.id === id)
    if (!src) return
    this.saveSnapshot()
    const copy: SceneObject = {
      ...src,
      id: `obj_${++this.idCounter}`,
      label: `${src.label}_kopia`,
      x: src.x + 24,
      y: src.y + 24,
      graph: src.graph ?? '',
      phaserObj: undefined
    }
    this.objects.push(copy)
    if (this.scene) this.spawnPhaserObj(copy)
    this.select(copy.id)
    return copy
  }

  addObject(type: SceneObject['type']) {
    this.saveSnapshot()
    const cam = this.scene?.cameras?.main
    const cx = cam ? cam.scrollX + cam.width / 2 : 200
    const cy = cam ? cam.scrollY + cam.height / 2 : 200

    const obj: SceneObject = {
      id: `obj_${++this.idCounter}`,
      type,
      x: this.snap(Math.round(cx), this.snapX),
      y: this.snap(Math.round(cy), this.snapY),
      width: type === 'rect' ? 80 : 64,
      height: type === 'rect' ? 60 : 64,
      label: type === 'sprite' ? `Sprite${this.idCounter}` : type === 'text' ? `Tekst${this.idCounter}` : `Rect${this.idCounter}`,
      color: type === 'sprite' ? 0x4ade80 : 0x60a5fa,
      text: type === 'text' ? 'Hello' : undefined,
      graph: ''
    }
    this.objects.push(obj)

    if (this.scene) {
      this.spawnPhaserObj(obj)
    }

    this.select(obj.id)
    return obj
  }

  private spawnPhaserObj(obj: SceneObject) {
    const scene = this.scene as unknown as Phaser.Scene
    let go: Phaser.GameObjects.GameObject

    if (obj.type === 'text') {
      const t = scene.add.text(obj.x, obj.y, obj.text ?? 'Hello', {
        fontSize: '18px',
        color: '#ffffff',
        backgroundColor: '#1e293b'
      })
      t.setOrigin(0.5)
      go = t
    } else if (obj.assetKey && scene.textures.exists(obj.assetKey)) {
      const img = scene.add.image(obj.x, obj.y, obj.assetKey)
      img.setDisplaySize(obj.width ?? 64, obj.height ?? 64)
      const label = scene.add.text(obj.x, obj.y, obj.label, { fontSize: '11px', color: '#fff', backgroundColor: '#0008', padding: { x: 3, y: 1 } })
      label.setOrigin(0.5)
      img.setData('labelRef', label)
      go = img
    } else {
      const gfx = scene.add.rectangle(obj.x, obj.y, obj.width ?? 64, obj.height ?? 64, obj.color ?? 0x4ade80)
      const label = scene.add.text(obj.x, obj.y, obj.label, { fontSize: '12px', color: '#fff' })
      label.setOrigin(0.5)
      gfx.setData('labelRef', label)
      go = gfx
    }

    go.setInteractive({ useHandCursor: true } as Phaser.Types.Input.InputConfiguration)

    go.on('pointerdown', () => {
      if (this.currentTool === 'select') this.select(obj.id)
    })

    let dragStartX = 0, dragStartY = 0
    let dragSnapped = false
    go.on('pointerdown', (p: Phaser.Input.Pointer) => {
      dragStartX = p.worldX - obj.x
      dragStartY = p.worldY - obj.y
      dragSnapped = false
    })

    const scene2 = scene as unknown as Phaser.Scene & { input: Phaser.Input.InputPlugin }
    scene2.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      // Drag object only in select mode
      if (p.isDown && this.selectedId === obj.id && this.currentTool === 'select') {
        if (!dragSnapped) { this.saveSnapshot(); dragSnapped = true }
        obj.x = this.snap(Math.round(p.worldX - dragStartX), this.snapX)
        obj.y = this.snap(Math.round(p.worldY - dragStartY), this.snapY)
        if (go instanceof Phaser.GameObjects.Text) {
          go.setPosition(obj.x, obj.y)
        } else {
          const anyGo = go as Phaser.GameObjects.Rectangle
          anyGo.setPosition(obj.x, obj.y)
          const lbl = anyGo.getData?.('labelRef') as Phaser.GameObjects.Text | undefined
          lbl?.setPosition(obj.x, obj.y)
        }
        this.onSelectCallback?.(obj)
      }
    })

    obj.phaserObj = go
  }

  select(id: string | null) {
    this.selectedId = id
    const obj = id ? this.objects.find(o => o.id === id) ?? null : null
    this.onSelectCallback?.(obj)
  }

  onSelect(cb: (obj: SceneObject | null) => void) {
    this.onSelectCallback = cb
  }

  getObjects(): SceneObject[] {
    return this.objects
  }

  removeObject(id: string) {
    const idx = this.objects.findIndex(o => o.id === id)
    if (idx === -1) return
    this.saveSnapshot()
    const obj = this.objects[idx]
    if (obj.phaserObj) {
      const lbl = (obj.phaserObj as Phaser.GameObjects.Rectangle).getData?.('labelRef') as Phaser.GameObjects.Text | undefined
      lbl?.destroy()
      ;(obj.phaserObj as Phaser.GameObjects.GameObject).destroy()
    }
    this.objects.splice(idx, 1)
    if (this.selectedId === id) this.select(null)
  }

  updateObjectProp(id: string, prop: keyof SceneObject, value: unknown) {
    const obj = this.objects.find(o => o.id === id)
    if (!obj) return
    this.saveSnapshot()
    ;(obj as unknown as Record<string, unknown>)[prop] = value

    if (prop === 'assetKey') {
      const lbl = (obj.phaserObj as Phaser.GameObjects.Rectangle)?.getData?.('labelRef') as Phaser.GameObjects.Text | undefined
      lbl?.destroy()
      obj.phaserObj?.destroy()
      obj.phaserObj = undefined
      // Auto-size to natural texture dimensions
      if (typeof value === 'string' && value) {
        const scene = this.scene as unknown as Phaser.Scene
        if (scene?.textures.exists(value)) {
          const src = scene.textures.get(value).source[0]
          obj.width = src.width
          obj.height = src.height
        }
      }
      if (this.scene) this.spawnPhaserObj(obj)
      return
    }
    if (obj.phaserObj instanceof Phaser.GameObjects.Text) {
      obj.phaserObj.setPosition(obj.x, obj.y)
      if (prop === 'text') obj.phaserObj.setText(String(value))
    } else if (obj.phaserObj) {
      const anyGo = obj.phaserObj as Phaser.GameObjects.Rectangle
      anyGo.setPosition(obj.x, obj.y)
      const lbl = anyGo.getData?.('labelRef') as Phaser.GameObjects.Text | undefined
      lbl?.setPosition(obj.x, obj.y)
      if (prop === 'label') lbl?.setText(String(value))
      if (prop === 'width' || prop === 'height') {
        const w = obj.width ?? 64, h = obj.height ?? 64
        if (anyGo instanceof Phaser.GameObjects.Rectangle) anyGo.setSize(w, h)
        else (anyGo as unknown as Phaser.GameObjects.Image).setDisplaySize(w, h)
      }
    }
  }

  onReady(cb: () => void) {
    if (this.scene) cb()
    else this.onReadyCallback = cb
  }

  getObjectGraph(id: string): string {
    return this.objects.find(o => o.id === id)?.graph ?? ''
  }

  setObjectGraph(id: string, graph: string) {
    const obj = this.objects.find(o => o.id === id)
    if (obj) obj.graph = graph
  }

  loadScene(saved: SceneObjectDef[]) {
    // Destroy existing Phaser objects
    this.objects.forEach(o => {
      if (o.phaserObj) {
        const lbl = (o.phaserObj as Phaser.GameObjects.Rectangle).getData?.('labelRef') as Phaser.GameObjects.Text | undefined
        lbl?.destroy()
        ;(o.phaserObj as Phaser.GameObjects.GameObject).destroy()
      }
    })
    this.objects = saved.map(o => ({ ...o }))
    this.idCounter = saved.reduce((max, o) => {
      const n = parseInt(o.id.replace('obj_', '')) || 0
      return Math.max(max, n)
    }, 0)
    if (this.scene) {
      this.objects.forEach(obj => this.spawnPhaserObj(obj))
    }
    this.select(null)
  }

  clearScene() {
    this.loadScene([])
  }

  resize() {
    if (!this.game) return
    const w = this.container.clientWidth
    const h = this.container.clientHeight
    this.game.scale.resize(w, h)
  }

  reloadWithAssets() {
    const saved = this.objects.map(({ phaserObj: _p, ...rest }) => ({ ...rest }))
    const selId = this.selectedId
    this.game.destroy(true)
    this.objects = []
    this.selectedId = null
    this.onReadyCallback = () => {
      this.loadScene(saved)
      if (selId) this.select(selId)
      this.onReadyCallback = undefined
    }
    this.init()
  }

  destroy() {
    this.game?.destroy(true)
  }
}
