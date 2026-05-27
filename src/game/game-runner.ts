import Phaser from 'phaser'
import type { SceneObject } from '../editor/scene-editor'

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

      constructor() { super({ key: 'PlayScene' }) }

      create() {
        this.graph = graphData

        for (const obj of objects) {
          if (obj.type === 'text') {
            const t = this.add.text(obj.x, obj.y, obj.text ?? 'Hello', { fontSize: '18px', color: '#fff' })
            t.setOrigin(0.5)
            this.sprites.set(obj.label, t)
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

      private executeNode(nodeId: string, _ctx: Record<string, number | string>) {
        if (!this.graph) return
        const node = this.graph.nodes.find(n => n.id === nodeId)
        if (!node) return

        switch (node.type) {
          case 'move-sprite': {
            const target = String(node.props.target ?? '')
            const dx = Number(node.props.dx ?? 0)
            const dy = Number(node.props.dy ?? 0)
            const s = this.sprites.get(target)
            if (s instanceof Phaser.GameObjects.Rectangle) {
              s.x += dx; s.y += dy
            } else if (s instanceof Phaser.GameObjects.Text) {
              s.x += dx; s.y += dy
            }
            break
          }
          case 'set-velocity': {
            const target = String(node.props.target ?? '')
            const vx = Number(node.props.vx ?? 0)
            const vy = Number(node.props.vy ?? 0)
            const s = this.sprites.get(target) as Phaser.GameObjects.Rectangle | null
            if (s) { s.setData('vx', vx); s.setData('vy', vy) }
            break
          }
          case 'log': {
            console.log('[Game]', node.props.msg)
            break
          }
        }

        // Follow exec chain
        const execOut = this.graph.connections.find(c => c.fromNode === nodeId && c.fromPort === 'exec')
        if (execOut) this.executeNode(execOut.toNode, _ctx)
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
    // Clear any leftover canvas
    while (this.container.firstChild) this.container.firstChild.remove()
  }
}
