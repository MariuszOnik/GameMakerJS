import Phaser from 'phaser'
import type { SceneObject } from '../editor/scene-editor'
import { getAllAssets } from '../assets-store'
import { GraphCompiler } from '../logic/graph-compiler'

interface GraphData {
  nodes: Array<{ id: string; type: string; x: number; y: number; props: Record<string, string | number> }>
  connections: Array<{ fromNode: string; fromPort: string; toNode: string; toPort: string }>
}

type ArcadeBody = Phaser.Physics.Arcade.Body | Phaser.Physics.Arcade.StaticBody

function getBody(go: Phaser.GameObjects.GameObject): ArcadeBody | null {
  return (go as unknown as { body?: ArcadeBody }).body ?? null
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
      public sprites: Map<string, Phaser.GameObjects.GameObject> = new Map()
      public variables: Map<string, number | string> = new Map()

      // Sloty na skompilowane, ultra-szybkie natywne funkcje maszynowe V8
      private compiledOnStart: Function | null = null
      private compiledOnUpdate: Function | null = null
      private compiledOnInput: Function | null = null

      constructor() { super({ key: 'PlayScene' }) }

      preload() {
        for (const asset of getAllAssets()) {
          this.load.image(asset.key, asset.dataUrl)
        }
      }

      create() {
        // 1. KOMPILACJA GRAFU PRZED STARTEM SCENY
        if (graphData) {
          const compiler = new GraphCompiler(graphData)
          try {
            const startJS = compiler.compileEvent('on-start')
            const updateJS = compiler.compileEvent('on-update')
            const inputJS = compiler.compileEvent('on-input')

            // --- TUTAJ WRZUCAMY LOGI PODGLĄDU ---
            console.log("%c=== WYGENEROWANY KOD JS Z GRAFU ===", "color: #00ffcc; font-weight: bold; font-size: 12px;");
            console.log("%c[on-start]:", "color: #ff007f;", "\n" + (startJS.trim() || "// brak kodu"));
            console.log("%c[on-update]:", "color: #ffaa00;", "\n" + (updateJS.trim() || "// brak kodu"));
            console.log("%c[on-input]:", "color: #00aaff;", "\n" + (inputJS.trim() || "// brak kodu"));
            console.log("%c===================================", "color: #00ffcc; font-weight: bold;");

            // Dynamicznie tworzymy natywne funkcje ze stringów wygenerowanych przez AST
            if (startJS.trim()) this.compiledOnStart = new Function(startJS)
            if (updateJS.trim()) this.compiledOnUpdate = new Function(updateJS)
            if (inputJS.trim()) this.compiledOnInput = new Function('x', 'y', inputJS)
          } catch (err) {
            console.error("Błąd kompilacji lub parsowania kodu grafu AST:", err)
          }
        }

        // 2. INICJALIZACJA I BUDOWANIE OBIEKTÓW SCENY (Twój sprawdzony kod)
        const dynamicBodies: Phaser.GameObjects.GameObject[] = []
        const staticBodies: Phaser.GameObjects.GameObject[] = []

        for (const obj of objects) {
          let go: Phaser.GameObjects.GameObject

          if (obj.type === 'text') {
            const t = this.add.text(obj.x, obj.y, obj.text ?? 'Hello', { fontSize: '18px', color: '#fff' })
            t.setOrigin(0.5)
            go = t
          } else if (obj.assetKey && this.textures.exists(obj.assetKey)) {
            const img = this.add.image(obj.x, obj.y, obj.assetKey)
            img.setDisplaySize(obj.width ?? 64, obj.height ?? 64)
            go = img
          } else {
            const r = this.add.rectangle(obj.x, obj.y, obj.width ?? 64, obj.height ?? 64, obj.color ?? 0x4ade80)
            go = r
          }

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
            if (obj.cameraFollow) {
              this.cameras.main.startFollow(go as Phaser.GameObjects.Image)
            }
          }
        }

        // Dodawanie colliderów fizycznych
        for (const dyn of dynamicBodies) {
          for (const stat of staticBodies) this.physics.add.collider(dyn, stat)
          for (const dyn2 of dynamicBodies) {
            if (dyn !== dyn2) this.physics.add.collider(dyn, dyn2)
          }
        }

        // 3. PODPIĘCIE EVENTÓW POD WYGENEROWANE FUNKCJE
        this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
          if (this.compiledOnInput) {
            // .call(this) przekazuje kontekst sceny tak, by wygenerowany kod widział mapy sprites/variables
            this.compiledOnInput.call(this, p.worldX, p.worldY)
          }
        })

        if (this.compiledOnStart) {
          this.compiledOnStart.call(this)
        }
      }

      update() {
        // Wykonuje się co klatkę (60 FPS) bezpośrednio jako natywny JS bez pętli i warunków runtime silnika
        if (this.compiledOnUpdate) {
          this.compiledOnUpdate.call(this)
        }
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