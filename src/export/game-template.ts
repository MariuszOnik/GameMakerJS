import type { GameState } from '../types'
import type { CustomNodeDef } from '../logic/custom-nodes'
// @ts-ignore — Vite raw import: file is embedded as string at build time
import gameRunnerCode from './game-runner.standalone.js?raw'

const PHASER_CDN = 'https://cdn.jsdelivr.net/npm/phaser@4.1.0/dist/phaser-arcade-physics.min.js'

export function buildGameHTML(
  states: GameState[],
  assetsMap: Record<string, string>,
  startStateId: string,
  customNodes: CustomNodeDef[] = []
): string {
  const statesJson = JSON.stringify(states)
  const assetsJson = JSON.stringify(assetsMap)
  const customNodesJson = JSON.stringify(customNodes)

  return `<!DOCTYPE html>
<html lang="pl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <title>Gra</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #000; overflow: hidden; }
    #game-container { width: 100vw; height: 100vh; }
    #btn-fs {
      position: fixed; top: 12px; right: 12px; z-index: 100;
      background: rgba(30,41,59,0.85); color: #e2e8f0;
      border: 1px solid #334155; border-radius: 8px;
      padding: 6px 12px; font-size: 18px; cursor: pointer;
      backdrop-filter: blur(4px);
    }
    #btn-fs:hover { background: rgba(74,222,128,0.25); color: #4ade80; }
    #fps-counter {
      position: fixed; top: 14px; left: 12px; z-index: 100;
      font: 12px/1 monospace; color: #4ade80;
      background: rgba(0,0,0,0.45); padding: 3px 7px;
      border-radius: 5px; pointer-events: none;
    }
  </style>
</head>
<body>
  <div id="game-container"></div>
  <button id="btn-fs" title="Pełny ekran">⛶</button>
  <div id="fps-counter">-- fps</div>

  <script src="${PHASER_CDN}"></script>
  <script>
    const STATES_DATA  = ${statesJson};
    const ASSETS_DATA  = ${assetsJson};
    const START_ID     = ${JSON.stringify(startStateId)};
    const CUSTOM_NODES = ${customNodesJson};
  </script>
  <script>${gameRunnerCode}</script>
  <script>
    document.getElementById('btn-fs').addEventListener('click', function () {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(function () {});
      } else {
        document.exitFullscreen();
      }
    });
    document.addEventListener('fullscreenchange', function () {
      var btn = document.getElementById('btn-fs');
      btn.textContent = document.fullscreenElement ? '✕' : '⛶';
    });
  </script>
</body>
</html>`
}
