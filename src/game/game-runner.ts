import Phaser from 'phaser'
import type { SceneObject } from '../editor/scene-editor'
import { getAllAssets } from '../assets-store'

interface GraphData {
  nodes: Array<{ id: string; type: string; x: number; y: number; props: Record<string, string | number> }>
  connections: Array<{ fromNode: string; fromPort: string; toNode: string; toPort: string }>
}

export class GameRunner {
  private game: Phaser.Game | null = null
  private container: HTMLElement

  constructor(container: HTMLElement) {
    this.container = container
  }

  start(sceneObjects: SceneObject[], graphJson: string) {
    this.stop()

    let graph: GraphData | null = null
    try { graph = JSON.parse(graphJson) } catch { /* no graph */ }

    const objects = sceneObjects
    const graphData = graph

    class PlayScene extends Phaser.Scene {
      private sprites: Map<string, Phaser.GameObjects.GameObject> = new Map()
      private graph: GraphData | null = null
      private variables: Map<string, number | string> = new Map()

      constructor() { super({ key: 'PlayScene' }) }

      preload() {
        for (const asset of getAllAssets()) {
          this.load.image(asset.key, asset.dataUrl)
        }
      }

      create() {
        this.graph = graphData

        for (const obj of objects) {
          if (obj.type === 'text') {
            const t = this.add.text(obj.x, obj.y, obj.text ?? 'Hello', { fontSize: '18px', color: '#fff' })
            t.setOrigin(0.5)
            this.sprites.set(obj.label, t)
          } else if (obj.assetKey && this.textures.exists(obj.assetKey)) {
            const img = this.add.image(obj.x, obj.y, obj.assetKey)
            img.setDisplaySize(obj.width ?? 64, obj.height ?? 64)
            this.sprites.set(obj.label, img)
          } else {
            const r = this.add.rectangle(obj.x, obj.y, obj.width ?? 64, obj.height ?? 64, obj.color ?? 0x4ade80)
            this.sprites.set(obj.label, r)
          }
        }

        this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
          this.runEvent('on-input', { x: p.worldX, y: p.worldY })
        })

        this.runEvent('on-start', {})
      }

      update() {
        this.runEvent('on-update', {})
      }

      private runEvent(eventType: string, params: Record<string, number>) {
        if (!this.graph) return
        const eventNodes = this.graph.nodes.filter(n => n.type === eventType)
        for (const eventNode of eventNodes) {
          this.executeNode(eventNode.id, { ...params })
        }
      }

      private resolvePort(nodeId: string, portId: string, ctx: Record<string, number | string>): number | string {
        const node = this.graph!.nodes.find(n => n.id === nodeId)
        if (!node) return 0
        const conn = this.graph!.connections.find(c => c.toNode === nodeId && c.toPort === portId)
        if (conn) return this.resolveOutput(conn.fromNode, conn.fromPort, ctx)
        return node.props[portId] ?? 0
      }

      private resolveOutput(nodeId: string, portId: string, ctx: Record<string, number | string>): number | string {
        const node = this.graph!.nodes.find(n => n.id === nodeId)
        if (!node) return 0
        switch (node.type) {
          case 'number': return Number(node.props.value ?? 0)
          case 'string': return String(node.props.value ?? '')
          case 'on-input': return ctx[portId] ?? 0
          case 'math': {
            const a = Number(this.resolvePort(nodeId, 'a', ctx))
            const b = Number(this.resolvePort(nodeId, 'b', ctx))
            const op = String(node.props.operator ?? '+')
            if (op === '+') return a + b
            if (op === '-') return a - b
            if (op === '*') return a * b
            if (op === '/') return b !== 0 ? a / b : 0
            if (op === '%') return b !== 0 ? a % b : 0
            return 0
          }
          case 'random': {
            const min = Number(this.resolvePort(nodeId, 'min', ctx))
            const max = Number(this.resolvePort(nodeId, 'max', ctx))
            return Math.random() * (max - min) + min
          }
          case 'get-variable': {
            const name = String(node.props.name ?? '')
            return this.variables.get(name) ?? 0
          }
          default: return node.props[portId] ?? 0
        }
      }

      private executeNode(nodeId: string, ctx: Record<string, number | string>) {
        if (!this.graph) return
        const node = this.graph.nodes.find(n => n.id === nodeId)
        if (!node) return

        switch (node.type) {
          case 'move-sprite': {
            const target = String(this.resolvePort(nodeId, 'target', ctx))
            const dx = Number(this.resolvePort(nodeId, 'dx', ctx))
            const dy = Number(this.resolvePort(nodeId, 'dy', ctx))
            const s = this.sprites.get(target)
            if (s instanceof Phaser.GameObjects.Rectangle || s instanceof Phaser.GameObjects.Text) {
              s.x += dx; s.y += dy
            }
            break
          }
          case 'set-velocity': {
            const target = String(this.resolvePort(nodeId, 'target', ctx))
            const vx = Number(this.resolvePort(nodeId, 'vx', ctx))
            const vy = Number(this.resolvePort(nodeId, 'vy', ctx))
            const s = this.sprites.get(target)
            if (s) { s.setData('vx', vx); s.setData('vy', vy) }
            break
          }
          case 'log': {
            console.log('[Game]', this.resolvePort(nodeId, 'msg', ctx))
            break
          }
          case 'set-variable': {
            const name = String(this.resolvePort(nodeId, 'name', ctx))
            const value = this.resolvePort(nodeId, 'value', ctx)
            this.variables.set(name, value)
            break
          }
          case 'show-text': {
            const target = String(node.props.target ?? '')
            const text = String(this.resolvePort(nodeId, 'text', ctx))
            const s = this.sprites.get(target)
            if (s instanceof Phaser.GameObjects.Text) s.setText(text)
            break
          }
          case 'if-condition': {
            const a = Number(this.resolvePort(nodeId, 'a', ctx))
            const b = Number(this.resolvePort(nodeId, 'b', ctx))
            const op = String(node.props.operator ?? '>')
            let result = false
            if (op === '>') result = a > b
            else if (op === '<') result = a < b
            else if (op === '>=') result = a >= b
            else if (op === '<=') result = a <= b
            else if (op === '==') result = a === b
            else if (op === '!=') result = a !== b
            const branch = result ? 'exec-true' : 'exec-false'
            const branchConn = this.graph.connections.find(c => c.fromNode === nodeId && c.fromPort === branch)
            if (branchConn) this.executeNode(branchConn.toNode, ctx)
            return
          }
          case 'wait': {
            const seconds = Number(this.resolvePort(nodeId, 'seconds', ctx))
            const next = this.graph.connections.find(c => c.fromNode === nodeId && c.fromPort === 'exec')
            if (next) this.time.delayedCall(seconds * 1000, () => this.executeNode(next.toNode, ctx))
            return
          }
        }

        // Follow exec chain
        const execOut = this.graph.connections.find(c => c.fromNode === nodeId && c.fromPort === 'exec')
        if (execOut) this.executeNode(execOut.toNode, ctx)
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
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH }
    })
  }

  stop() {
    if (this.game) {
      this.game.destroy(true)
      this.game = null
    }
    while (this.container.firstChild) this.container.firstChild.remove()
  }
}
