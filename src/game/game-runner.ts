import Phaser from 'phaser'
import type { GameState, SceneObjectDef } from '../types'
import { getAllAssets } from '../assets-store'

interface GraphData {
  nodes: Array<{ id: string; type: string; x: number; y: number; props: Record<string, string | number> }>
  connections: Array<{ fromNode: string; fromPort: string; toNode: string; toPort: string }>
}

type ArcadeBody = Phaser.Physics.Arcade.Body | Phaser.Physics.Arcade.StaticBody

function getBody(go: Phaser.GameObjects.GameObject): ArcadeBody | null {
  return (go as unknown as { body?: ArcadeBody }).body ?? null
}

function parseGraph(json: string): GraphData | null {
  if (!json) return null
  try { return JSON.parse(json) } catch { return null }
}

// ctx carries: per-frame input data + __self (label of owning object, or '' for state graph)
type ExecCtx = Record<string, number | string>

export class GameRunner {
  private game: Phaser.Game | null = null
  private container: HTMLElement

  constructor(container: HTMLElement) {
    this.container = container
  }

  private lockOrientation(states: GameState[], startStateId: string) {
    const startState = states.find(s => s.id === startStateId) ?? states[0]
    const orient = startState?.orientation ?? 'any'
    if (orient !== 'any') {
      const lockType = orient === 'landscape' ? 'landscape' : 'portrait'
      screen.orientation?.lock(lockType).catch(() => {})
    }
  }

  start(states: GameState[], startStateId: string) {
    this.stop()
    this.lockOrientation(states, startStateId)

    const allStates = states
    const startId = startStateId

    class PlayScene extends Phaser.Scene {
      private states: Map<string, GameState> = new Map()
      private activeStateId = ''
      private stateStack: string[] = []

      // Runtime per active state
      private sprites: Map<string, Phaser.GameObjects.GameObject> = new Map()
      private stateGraph: GraphData | null = null
      private objectGraphs: Map<string, GraphData> = new Map()
      private variables: Map<string, number | string> = new Map()

      // Pending state transition (deferred to avoid mid-frame switches)
      private pendingTransition: { id: string; push: boolean } | null = null
      private pendingPop = false

      constructor() { super({ key: 'PlayScene' }) }

      preload() {
        for (const asset of getAllAssets()) {
          this.load.image(asset.key, asset.dataUrl)
        }
      }

      create() {
        for (const s of allStates) this.states.set(s.name, s)

        const startState = allStates.find(s => s.id === startId) ?? allStates[0]
        if (startState) this.enterState(startState.name)

        this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
          this.runStateEvent('on-input', { x: p.worldX, y: p.worldY })
          this.runAllObjectsEvent('on-input', { x: p.worldX, y: p.worldY })
        })
      }

      update() {
        this.handlePendingTransition()
        this.runStateEvent('on-update', {})
        this.runAllObjectsEvent('on-update', {})
      }

      // ── State machine ──────────────────────────────────────

      private enterState(name: string) {
        // Exit current state
        if (this.activeStateId) {
          this.runStateEvent('on-exit', {})
          this.destroyStateObjects()
        }

        this.activeStateId = name
        const state = this.states.get(name)
        if (!state) return

        // Parse graphs once (not every frame)
        this.stateGraph = parseGraph(state.graph)
        this.objectGraphs.clear()
        for (const obj of state.objects) {
          const g = parseGraph(obj.graph)
          if (g) this.objectGraphs.set(obj.label, g)
        }

        this.createStateObjects(state)
        this.runStateEvent('on-enter', {})
        this.runAllObjectsEvent('on-start', {})

        // Camera follow
        for (const obj of state.objects) {
          if (obj.cameraFollow) {
            const go = this.sprites.get(obj.label)
            if (go) this.cameras.main.startFollow(go as Phaser.GameObjects.Image)
          }
        }
      }

      private destroyStateObjects() {
        this.sprites.forEach(go => go.destroy())
        this.sprites.clear()
      }

      private createStateObjects(state: GameState) {
        const dynamicBodies: Phaser.GameObjects.GameObject[] = []
        const staticBodies: Phaser.GameObjects.GameObject[] = []

        for (const obj of state.objects) {
          const go = this.spawnObject(obj)
          this.sprites.set(obj.label, go)

          if (obj.physicsEnabled) {
            this.physics.add.existing(go, obj.isStatic ?? false)
            const body = getBody(go)
            if (body instanceof Phaser.Physics.Arcade.Body) {
              body.setBounce(obj.bounce ?? 0)
              body.setAllowGravity(obj.allowGravity !== false)
              body.setCollideWorldBounds(obj.collideWorldBounds ?? false)
              dynamicBodies.push(go)
            } else {
              staticBodies.push(go)
            }
          }
        }

        for (const dyn of dynamicBodies) {
          for (const stat of staticBodies) this.physics.add.collider(dyn, stat)
          for (const dyn2 of dynamicBodies) {
            if (dyn !== dyn2) this.physics.add.collider(dyn, dyn2)
          }
        }
      }

      private spawnObject(obj: SceneObjectDef): Phaser.GameObjects.GameObject {
        if (obj.type === 'text') {
          const t = this.add.text(obj.x, obj.y, obj.text ?? 'Hello', { fontSize: '18px', color: '#fff' })
          t.setOrigin(0.5)
          return t
        }
        if (obj.assetKey && this.textures.exists(obj.assetKey)) {
          const img = this.add.image(obj.x, obj.y, obj.assetKey)
          img.setDisplaySize(obj.width ?? 64, obj.height ?? 64)
          return img
        }
        return this.add.rectangle(obj.x, obj.y, obj.width ?? 64, obj.height ?? 64, obj.color ?? 0x4ade80)
      }

      private handlePendingTransition() {
        if (this.pendingPop) {
          this.pendingPop = false
          const prev = this.stateStack.pop()
          if (prev) this.enterState(prev)
          return
        }
        if (this.pendingTransition) {
          const { id, push } = this.pendingTransition
          this.pendingTransition = null
          if (push) this.stateStack.push(this.activeStateId)
          this.enterState(id)
        }
      }

      // ── Graph event runners ────────────────────────────────

      private runStateEvent(eventType: string, params: ExecCtx) {
        if (!this.stateGraph) return
        this.runEventInGraph(this.stateGraph, eventType, { ...params, __self: '' })
      }

      private runAllObjectsEvent(eventType: string, params: ExecCtx) {
        for (const [label, graph] of this.objectGraphs) {
          this.runEventInGraph(graph, eventType, { ...params, __self: label })
        }
      }

      private runEventInGraph(graph: GraphData, eventType: string, ctx: ExecCtx) {
        for (const node of graph.nodes) {
          if (node.type === eventType) {
            this.executeNode(node.id, graph, { ...ctx })
          }
        }
      }

      // ── Per-node execution ─────────────────────────────────

      private resolveTarget(nodeId: string, graph: GraphData, ctx: ExecCtx): string {
        const raw = String(this.resolvePort(nodeId, 'target', graph, ctx))
        return (raw === 'self' || raw === '') ? String(ctx.__self ?? '') : raw
      }

      private resolvePort(nodeId: string, portId: string, graph: GraphData, ctx: ExecCtx): number | string {
        const node = graph.nodes.find(n => n.id === nodeId)
        if (!node) return 0
        const conn = graph.connections.find(c => c.toNode === nodeId && c.toPort === portId)
        if (conn) return this.resolveOutput(conn.fromNode, conn.fromPort, graph, ctx)
        return node.props[portId] ?? 0
      }

      private resolveOutput(nodeId: string, portId: string, graph: GraphData, ctx: ExecCtx): number | string {
        const node = graph.nodes.find(n => n.id === nodeId)
        if (!node) return 0

        switch (node.type) {
          case 'number': return Number(node.props.value ?? 0)
          case 'string': return String(node.props.value ?? '')
          case 'on-input': return ctx[portId] ?? 0
          case 'get-object': return String(node.props.label ?? '')
          case 'math': {
            const a = Number(this.resolvePort(nodeId, 'a', graph, ctx))
            const b = Number(this.resolvePort(nodeId, 'b', graph, ctx))
            const op = String(node.props.operator ?? '+')
            if (op === '+') return a + b
            if (op === '-') return a - b
            if (op === '*') return a * b
            if (op === '/') return b !== 0 ? a / b : 0
            if (op === '%') return b !== 0 ? a % b : 0
            return 0
          }
          case 'random': {
            const min = Number(this.resolvePort(nodeId, 'min', graph, ctx))
            const max = Number(this.resolvePort(nodeId, 'max', graph, ctx))
            return Math.random() * (max - min) + min
          }
          case 'get-variable': {
            return this.variables.get(String(node.props.name ?? '')) ?? 0
          }
          case 'get-property': {
            const target = (() => {
              const raw = String(node.props.target ?? 'self')
              return (raw === 'self' || raw === '') ? String(ctx.__self ?? '') : raw
            })()
            const prop = String(node.props.prop ?? 'x')
            const s = this.sprites.get(target)
            if (!s) return 0
            const go = s as Phaser.GameObjects.Image
            if (prop === 'x') return go.x
            if (prop === 'y') return go.y
            if (prop === 'width') return go.width
            if (prop === 'height') return go.height
            if (prop === 'vx' || prop === 'vy') {
              const body = getBody(s)
              if (body instanceof Phaser.Physics.Arcade.Body)
                return prop === 'vx' ? body.velocity.x : body.velocity.y
            }
            return 0
          }
          default: return node.props[portId] ?? 0
        }
      }

      private executeNode(nodeId: string, graph: GraphData, ctx: ExecCtx) {
        const node = graph.nodes.find(n => n.id === nodeId)
        if (!node) return

        switch (node.type) {
          case 'move-sprite': {
            const target = this.resolveTarget(nodeId, graph, ctx)
            const dx = Number(this.resolvePort(nodeId, 'dx', graph, ctx))
            const dy = Number(this.resolvePort(nodeId, 'dy', graph, ctx))
            const s = this.sprites.get(target)
            if (s) {
              (s as Phaser.GameObjects.Image).x += dx;
              (s as Phaser.GameObjects.Image).y += dy
            }
            break
          }
          case 'set-velocity': {
            const target = this.resolveTarget(nodeId, graph, ctx)
            const vx = Number(this.resolvePort(nodeId, 'vx', graph, ctx))
            const vy = Number(this.resolvePort(nodeId, 'vy', graph, ctx))
            const s = this.sprites.get(target)
            if (s) {
              const body = getBody(s)
              if (body instanceof Phaser.Physics.Arcade.Body) body.setVelocity(vx, vy)
            }
            break
          }
          case 'jump': {
            const target = this.resolveTarget(nodeId, graph, ctx)
            const force = Number(this.resolvePort(nodeId, 'force', graph, ctx))
            const s = this.sprites.get(target)
            if (s) {
              const body = getBody(s)
              if (body instanceof Phaser.Physics.Arcade.Body && body.blocked.down)
                body.setVelocityY(-Math.abs(force))
            }
            break
          }
          case 'log': {
            console.log('[Game]', this.resolvePort(nodeId, 'msg', graph, ctx))
            break
          }
          case 'set-variable': {
            const name = String(node.props.name ?? '')
            const value = this.resolvePort(nodeId, 'value', graph, ctx)
            this.variables.set(name, value)
            break
          }
          case 'show-text': {
            const target = this.resolveTarget(nodeId, graph, ctx)
            const text = String(this.resolvePort(nodeId, 'text', graph, ctx))
            const s = this.sprites.get(target)
            if (s instanceof Phaser.GameObjects.Text) s.setText(text)
            break
          }
          case 'set-position': {
            const target = this.resolveTarget(nodeId, graph, ctx)
            const x = Number(this.resolvePort(nodeId, 'x', graph, ctx))
            const y = Number(this.resolvePort(nodeId, 'y', graph, ctx))
            const s = this.sprites.get(target)
            if (s) {
              const body = getBody(s)
              if (body instanceof Phaser.Physics.Arcade.Body) body.reset(x, y)
              else (s as Phaser.GameObjects.Image).setPosition(x, y)
            }
            break
          }
          case 'set-visible': {
            const target = this.resolveTarget(nodeId, graph, ctx)
            const mode = String(node.props.visible ?? 'pokaz')
            const s = this.sprites.get(target)
            if (s) {
              const go = s as Phaser.GameObjects.Image
              if (mode === 'pokaz') go.setVisible(true)
              else if (mode === 'ukryj') go.setVisible(false)
              else go.setVisible(!go.visible)
            }
            break
          }
          case 'if-condition': {
            const a = Number(this.resolvePort(nodeId, 'a', graph, ctx))
            const b = Number(this.resolvePort(nodeId, 'b', graph, ctx))
            const op = String(node.props.operator ?? '>')
            let result = false
            if (op === '>') result = a > b
            else if (op === '<') result = a < b
            else if (op === '>=') result = a >= b
            else if (op === '<=') result = a <= b
            else if (op === '==') result = a === b
            else if (op === '!=') result = a !== b
            const branch = result ? 'exec-true' : 'exec-false'
            const conn = graph.connections.find(c => c.fromNode === nodeId && c.fromPort === branch)
            if (conn) this.executeNode(conn.toNode, graph, ctx)
            return
          }
          case 'wait': {
            const seconds = Number(this.resolvePort(nodeId, 'seconds', graph, ctx))
            const next = graph.connections.find(c => c.fromNode === nodeId && c.fromPort === 'exec')
            if (next) this.time.delayedCall(seconds * 1000, () => this.executeNode(next.toNode, graph, ctx))
            return
          }
          case 'change-state': {
            const name = String(node.props.state ?? '')
            this.pendingTransition = { id: name, push: false }
            return
          }
          case 'push-state': {
            const name = String(node.props.state ?? '')
            this.pendingTransition = { id: name, push: true }
            return
          }
          case 'pop-state': {
            this.pendingPop = true
            return
          }
        }

        // Follow exec chain
        const execOut = graph.connections.find(c => c.fromNode === nodeId && c.fromPort === 'exec')
        if (execOut) this.executeNode(execOut.toNode, graph, ctx)
      }
    }

    const w = this.container.clientWidth || window.innerWidth
    const h = this.container.clientHeight || window.innerHeight

    this.game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: this.container,
      width: w,
      height: h,
      backgroundColor: '#0a0a18',
      scene: PlayScene,
      physics: {
        default: 'arcade',
        arcade: { gravity: { x: 0, y: 500 }, debug: false }
      },
      scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH }
    })
  }

  refresh() {
    this.game?.scale.refresh()
  }

  stop() {
    try { screen.orientation?.unlock() } catch { /* desktop doesn't support this */ }
    if (this.game) {
      this.game.destroy(true)
      this.game = null
    }
    while (this.container.firstChild) this.container.firstChild.remove()
  }
}
