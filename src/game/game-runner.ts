import type { GameState } from '../types'
import type { Asset } from '../assets-store'
import type { CustomNodeDef } from '../logic/custom-nodes'
import { buildGameHTML } from '../export/game-template'

export class GameRunner {
  private iframe: HTMLIFrameElement
  private blobUrl: string | null = null

  constructor(iframe: HTMLIFrameElement) {
    this.iframe = iframe
  }

  start(states: GameState[], startStateId: string, assets: Asset[], customNodes: CustomNodeDef[] = []) {
    this.stop()
    const assetsMap = Object.fromEntries(assets.map(a => [a.key, a.dataUrl]))
    const html = buildGameHTML(states, assetsMap, startStateId, customNodes)
    this.blobUrl = URL.createObjectURL(new Blob([html], { type: 'text/html' }))
    this.iframe.src = this.blobUrl
  }

  stop() {
    this.iframe.src = 'about:blank'
    if (this.blobUrl) {
      URL.revokeObjectURL(this.blobUrl)
      this.blobUrl = null
    }
  }
}
