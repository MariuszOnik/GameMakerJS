// Standalone game runner — embedded inside exported game.html
// Globals expected: STATES_DATA (GameState[]), ASSETS_DATA ({key:dataUrl}), START_ID (string)
;(function () {
  'use strict';

  function getBody(go) {
    return go.body || null;
  }

  function parseGraph(json) {
    if (!json) return null;
    try { return JSON.parse(json); } catch (e) { return null; }
  }

  // ── PlayScene ──────────────────────────────────────────────────────────────
  class PlayScene extends Phaser.Scene {
    constructor() { super({ key: 'PlayScene' }); }

    preload() {
      for (const [key, url] of Object.entries(ASSETS_DATA)) {
        this.load.image(key, url);
      }
    }

    create() {
      this.stateMap = new Map();
      for (const s of STATES_DATA) this.stateMap.set(s.name, s);

      this.sprites       = new Map();
      this.objectGraphs  = new Map();
      this.variables     = new Map();
      this.activeStateName = '';
      this.stateStack    = [];
      this.stateGraph    = null;
      this.pendingTransition = null;
      this.pendingPop    = false;

      const startState = STATES_DATA.find(s => s.id === START_ID) || STATES_DATA[0];

      // Orientation lock
      const orient = startState && startState.orientation ? startState.orientation : 'any';
      if (orient !== 'any' && screen.orientation && screen.orientation.lock) {
        screen.orientation.lock(orient === 'landscape' ? 'landscape' : 'portrait').catch(function () {});
      }

      if (startState) this.enterState(startState.name);

      this.input.on('pointerdown', (p) => {
        this.runStateEvent('on-input', { x: p.worldX, y: p.worldY });
        this.runAllObjectsEvent('on-input', { x: p.worldX, y: p.worldY });
      });

      this._fpsEl = document.getElementById('fps-counter');
      this._fpsFrame = 0;
    }

    update() {
      this.handlePendingTransition();
      this.runStateEvent('on-update', {});
      this.runAllObjectsEvent('on-update', {});

      if (this._fpsEl) {
        this._fpsFrame++;
        if (this._fpsFrame % 30 === 0) {
          this._fpsEl.textContent = Math.round(this.game.loop.actualFps) + ' fps';
        }
      }
    }

    // ── State machine ────────────────────────────────────────────────────────

    enterState(name) {
      if (this.activeStateName) {
        this.runStateEvent('on-exit', {});
        this.destroyStateObjects();
      }
      this.activeStateName = name;
      const state = this.stateMap.get(name);
      if (!state) return;

      this.stateGraph = parseGraph(state.graph);
      this.objectGraphs.clear();
      for (const obj of state.objects) {
        const g = parseGraph(obj.graph);
        if (g) this.objectGraphs.set(obj.label, g);
      }

      this.createStateObjects(state);
      this.runStateEvent('on-enter', {});
      this.runAllObjectsEvent('on-start', {});

      for (const obj of state.objects) {
        if (obj.cameraFollow) {
          const go = this.sprites.get(obj.label);
          if (go) this.cameras.main.startFollow(go);
        }
      }
    }

    destroyStateObjects() {
      this.sprites.forEach(go => go.destroy());
      this.sprites.clear();
    }

    createStateObjects(state) {
      const dynamicBodies = [];
      const staticBodies  = [];

      for (const obj of state.objects) {
        const go = this.spawnObject(obj);
        this.sprites.set(obj.label, go);

        if (obj.physicsEnabled) {
          this.physics.add.existing(go, obj.isStatic || false);
          const body = getBody(go);
          if (body instanceof Phaser.Physics.Arcade.Body) {
            body.setBounce(obj.bounce || 0);
            body.setAllowGravity(obj.allowGravity !== false);
            body.setCollideWorldBounds(obj.collideWorldBounds || false);
            dynamicBodies.push(go);
          } else {
            staticBodies.push(go);
          }
        }
      }

      for (const dyn of dynamicBodies) {
        for (const stat of staticBodies)  this.physics.add.collider(dyn, stat);
        for (const dyn2 of dynamicBodies) { if (dyn !== dyn2) this.physics.add.collider(dyn, dyn2); }
      }
    }

    spawnObject(obj) {
      if (obj.type === 'text') {
        const t = this.add.text(obj.x, obj.y, obj.text || 'Hello', { fontSize: '18px', color: '#fff' });
        t.setOrigin(0.5);
        return t;
      }
      if (obj.assetKey && this.textures.exists(obj.assetKey)) {
        const img = this.add.image(obj.x, obj.y, obj.assetKey);
        img.setDisplaySize(obj.width || 64, obj.height || 64);
        return img;
      }
      return this.add.rectangle(obj.x, obj.y, obj.width || 64, obj.height || 64, obj.color || 0x4ade80);
    }

    handlePendingTransition() {
      if (this.pendingPop) {
        this.pendingPop = false;
        const prev = this.stateStack.pop();
        if (prev) this.enterState(prev);
        return;
      }
      if (this.pendingTransition) {
        const { id, push } = this.pendingTransition;
        this.pendingTransition = null;
        if (push) this.stateStack.push(this.activeStateName);
        this.enterState(id);
      }
    }

    // ── Event runners ────────────────────────────────────────────────────────

    runStateEvent(eventType, params) {
      if (!this.stateGraph) return;
      this.runEventInGraph(this.stateGraph, eventType, Object.assign({}, params, { __self: '' }));
    }

    runAllObjectsEvent(eventType, params) {
      for (const [label, graph] of this.objectGraphs) {
        this.runEventInGraph(graph, eventType, Object.assign({}, params, { __self: label }));
      }
    }

    runEventInGraph(graph, eventType, ctx) {
      for (const node of graph.nodes) {
        if (node.type === eventType) this.executeNode(node.id, graph, Object.assign({}, ctx));
      }
    }

    // ── Node execution ───────────────────────────────────────────────────────

    resolveTarget(nodeId, graph, ctx) {
      const raw = String(this.resolvePort(nodeId, 'target', graph, ctx));
      return (raw === 'self' || raw === '') ? String(ctx.__self || '') : raw;
    }

    resolvePort(nodeId, portId, graph, ctx) {
      const node = graph.nodes.find(n => n.id === nodeId);
      if (!node) return 0;
      const conn = graph.connections.find(c => c.toNode === nodeId && c.toPort === portId);
      if (conn) return this.resolveOutput(conn.fromNode, conn.fromPort, graph, ctx);
      return node.props[portId] !== undefined ? node.props[portId] : 0;
    }

    resolveOutput(nodeId, portId, graph, ctx) {
      const node = graph.nodes.find(n => n.id === nodeId);
      if (!node) return 0;

      switch (node.type) {
        case 'number':       return Number(node.props.value || 0);
        case 'string':       return String(node.props.value || '');
        case 'on-input':     return ctx[portId] !== undefined ? ctx[portId] : 0;
        case 'get-object':   return String(node.props.label || '');
        case 'math': {
          const a  = Number(this.resolvePort(nodeId, 'a', graph, ctx));
          const b  = Number(this.resolvePort(nodeId, 'b', graph, ctx));
          const op = String(node.props.operator || '+');
          if (op === '+') return a + b;
          if (op === '-') return a - b;
          if (op === '*') return a * b;
          if (op === '/') return b !== 0 ? a / b : 0;
          if (op === '%') return b !== 0 ? a % b : 0;
          return 0;
        }
        case 'random': {
          const min = Number(this.resolvePort(nodeId, 'min', graph, ctx));
          const max = Number(this.resolvePort(nodeId, 'max', graph, ctx));
          return Math.random() * (max - min) + min;
        }
        case 'get-variable':
          return this.variables.get(String(node.props.name || '')) || 0;
        case 'get-property': {
          const raw = String(node.props.target || 'self');
          const tgt = (raw === 'self' || raw === '') ? String(ctx.__self || '') : raw;
          const prop = String(node.props.prop || 'x');
          const s = this.sprites.get(tgt);
          if (!s) return 0;
          if (prop === 'x') return s.x;
          if (prop === 'y') return s.y;
          if (prop === 'width') return s.width;
          if (prop === 'height') return s.height;
          if (prop === 'vx' || prop === 'vy') {
            const body = getBody(s);
            if (body instanceof Phaser.Physics.Arcade.Body)
              return prop === 'vx' ? body.velocity.x : body.velocity.y;
          }
          return 0;
        }
        default:
          return node.props[portId] !== undefined ? node.props[portId] : 0;
      }
    }

    executeNode(nodeId, graph, ctx) {
      const node = graph.nodes.find(n => n.id === nodeId);
      if (!node) return;

      switch (node.type) {
        case 'move-sprite': {
          const target = this.resolveTarget(nodeId, graph, ctx);
          const dx = Number(this.resolvePort(nodeId, 'dx', graph, ctx));
          const dy = Number(this.resolvePort(nodeId, 'dy', graph, ctx));
          const s = this.sprites.get(target);
          if (s) { s.x += dx; s.y += dy; }
          break;
        }
        case 'set-velocity': {
          const target = this.resolveTarget(nodeId, graph, ctx);
          const vx = Number(this.resolvePort(nodeId, 'vx', graph, ctx));
          const vy = Number(this.resolvePort(nodeId, 'vy', graph, ctx));
          const s = this.sprites.get(target);
          if (s) { const b = getBody(s); if (b instanceof Phaser.Physics.Arcade.Body) b.setVelocity(vx, vy); }
          break;
        }
        case 'jump': {
          const target = this.resolveTarget(nodeId, graph, ctx);
          const force = Number(this.resolvePort(nodeId, 'force', graph, ctx));
          const s = this.sprites.get(target);
          if (s) { const b = getBody(s); if (b instanceof Phaser.Physics.Arcade.Body && b.blocked.down) b.setVelocityY(-Math.abs(force)); }
          break;
        }
        case 'log':
          console.log('[Game]', this.resolvePort(nodeId, 'msg', graph, ctx));
          break;
        case 'set-variable': {
          const name  = String(node.props.name || '');
          const value = this.resolvePort(nodeId, 'value', graph, ctx);
          this.variables.set(name, value);
          break;
        }
        case 'show-text': {
          const target = this.resolveTarget(nodeId, graph, ctx);
          const text = String(this.resolvePort(nodeId, 'text', graph, ctx));
          const s = this.sprites.get(target);
          if (s instanceof Phaser.GameObjects.Text) s.setText(text);
          break;
        }
        case 'set-position': {
          const target = this.resolveTarget(nodeId, graph, ctx);
          const x = Number(this.resolvePort(nodeId, 'x', graph, ctx));
          const y = Number(this.resolvePort(nodeId, 'y', graph, ctx));
          const s = this.sprites.get(target);
          if (s) { const b = getBody(s); if (b instanceof Phaser.Physics.Arcade.Body) b.reset(x, y); else s.setPosition(x, y); }
          break;
        }
        case 'set-visible': {
          const target = this.resolveTarget(nodeId, graph, ctx);
          const mode = String(node.props.visible || 'pokaz');
          const s = this.sprites.get(target);
          if (s) {
            if (mode === 'pokaz') s.setVisible(true);
            else if (mode === 'ukryj') s.setVisible(false);
            else s.setVisible(!s.visible);
          }
          break;
        }
        case 'if-condition': {
          const a  = Number(this.resolvePort(nodeId, 'a', graph, ctx));
          const b  = Number(this.resolvePort(nodeId, 'b', graph, ctx));
          const op = String(node.props.operator || '>');
          let result = false;
          if (op === '>')  result = a > b;
          else if (op === '<')  result = a < b;
          else if (op === '>=') result = a >= b;
          else if (op === '<=') result = a <= b;
          else if (op === '==') result = a === b;
          else if (op === '!=') result = a !== b;
          const branch = result ? 'exec-true' : 'exec-false';
          const conn = graph.connections.find(c => c.fromNode === nodeId && c.fromPort === branch);
          if (conn) this.executeNode(conn.toNode, graph, ctx);
          return;
        }
        case 'wait': {
          const seconds = Number(this.resolvePort(nodeId, 'seconds', graph, ctx));
          const next = graph.connections.find(c => c.fromNode === nodeId && c.fromPort === 'exec');
          if (next) this.time.delayedCall(seconds * 1000, () => this.executeNode(next.toNode, graph, ctx));
          return;
        }
        case 'change-state':
          this.pendingTransition = { id: String(node.props.state || ''), push: false };
          return;
        case 'push-state':
          this.pendingTransition = { id: String(node.props.state || ''), push: true };
          return;
        case 'pop-state':
          this.pendingPop = true;
          return;
      }

      // Follow exec chain
      const execOut = graph.connections.find(c => c.fromNode === nodeId && c.fromPort === 'exec');
      if (execOut) this.executeNode(execOut.toNode, graph, ctx);
    }
  }

  // ── Boot ──────────────────────────────────────────────────────────────────
  new Phaser.Game({
    type: Phaser.AUTO,
    parent: document.getElementById('game-container'),
    width: window.innerWidth,
    height: window.innerHeight,
    backgroundColor: '#0a0a18',
    scene: PlayScene,
    physics: {
      default: 'arcade',
      arcade: { gravity: { x: 0, y: 500 }, debug: false }
    },
    scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH }
  });
})();
