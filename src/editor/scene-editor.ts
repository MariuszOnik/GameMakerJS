import Phaser from 'phaser'

export interface SceneObject {
  id: string
  type: 'sprite' | 'text' | 'rect'
  x: number
  y: number
  width?: number
  height?: number
  label: string
  color?: number
  text?: string
  phaserObj?: Phaser.GameObjects.GameObject
}

type Tool = 'select' | 'move' | 'add'

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
        // Placeholder colored rect for sprites (no external assets needed)
      }

      create() {
        editorRef.scene = this as unknown as Phaser.Scene

        // Grid background
        const gfx = this.add.graphics()
        gfx.lineStyle(1, 0x1e293b, 1)
        for (let x = 0; x < 2000; x += 32) gfx.lineBetween(x, 0, x, 2000)
        for (let y = 0; y < 2000; y += 32) gfx.lineBetween(0, y, 2000, y)

        // Camera pan (drag on empty space)
        this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
          if (p.isDown && editorRef.currentTool === 'move' && !editorRef.selectedId) {
            this.cameras.main.scrollX -= p.velocity.x / this.cameras.main.zoom
            this.cameras.main.scrollY -= p.velocity.y / this.cameras.main.zoom
          }
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

  addObject(type: SceneObject['type']) {
    const cam = this.scene?.cameras?.main
    const cx = cam ? cam.scrollX + cam.width / 2 : 200
    const cy = cam ? cam.scrollY + cam.height / 2 : 200

    const obj: SceneObject = {
      id: `obj_${++this.idCounter}`,
      type,
      x: Math.round(cx),
      y: Math.round(cy),
      width: type === 'rect' ? 80 : 64,
      height: type === 'rect' ? 60 : 64,
      label: type === 'sprite' ? `Sprite${this.idCounter}` : type === 'text' ? `Tekst${this.idCounter}` : `Rect${this.idCounter}`,
      color: type === 'sprite' ? 0x4ade80 : 0x60a5fa,
      text: type === 'text' ? 'Hello' : undefined
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
    go.on('pointerdown', (p: Phaser.Input.Pointer) => {
      dragStartX = p.worldX - obj.x
      dragStartY = p.worldY - obj.y
    })

    const scene2 = scene as unknown as Phaser.Scene & { input: Phaser.Input.InputPlugin }
    scene2.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (p.isDown && this.selectedId === obj.id) {
        obj.x = Math.round(p.worldX - dragStartX)
        obj.y = Math.round(p.worldY - dragStartY)
        if (go instanceof Phaser.GameObjects.Rectangle) {
          go.setPosition(obj.x, obj.y)
          const lbl = go.getData('labelRef') as Phaser.GameObjects.Text | undefined
          lbl?.setPosition(obj.x, obj.y)
        } else if (go instanceof Phaser.GameObjects.Text) {
          go.setPosition(obj.x, obj.y)
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
    ;(obj as unknown as Record<string, unknown>)[prop] = value

    if (obj.phaserObj instanceof Phaser.GameObjects.Rectangle) {
      obj.phaserObj.setPosition(obj.x, obj.y)
      const lbl = obj.phaserObj.getData('labelRef') as Phaser.GameObjects.Text | undefined
      lbl?.setPosition(obj.x, obj.y)
    } else if (obj.phaserObj instanceof Phaser.GameObjects.Text) {
      obj.phaserObj.setPosition(obj.x, obj.y)
      if (prop === 'text') obj.phaserObj.setText(String(value))
    }
  }

  onReady(cb: () => void) {
    if (this.scene) cb()
    else this.onReadyCallback = cb
  }

  loadScene(saved: Omit<SceneObject, 'phaserObj'>[]) {
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

  destroy() {
    this.game?.destroy(true)
  }
}
