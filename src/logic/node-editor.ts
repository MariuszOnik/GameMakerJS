import { type NodeDef, type PortType } from './node-types'
import { getAllNodeDefs } from './node-registry'

export interface NodeInstance {
  id: string
  type: string
  x: number
  y: number
  props: Record<string, string | number>
  el?: HTMLElement
}

export interface Connection {
  id: string
  fromNode: string
  fromPort: string
  toNode: string
  toPort: string
  type: PortType
}

export class NodeEditor {
  private container: HTMLElement
  private canvas!: HTMLElement
  private transform!: HTMLElement
  private svg!: SVGSVGElement

  private nodes: Map<string, NodeInstance> = new Map()
  private connections: Connection[] = []

  private scale = 1
  private panX = 0
  private panY = 0


  private idCounter = 0

  constructor(container: HTMLElement) {
    this.container = container
    this.buildDOM()
    this.bindPanZoom()
  }

  // ── DOM setup ──────────────────────────────────────────

  private buildDOM() {
    this.canvas = document.createElement('div')
    this.canvas.id = 'rete-canvas'

    this.transform = document.createElement('div')
    this.transform.id = 'rete-transform'

    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg') as SVGSVGElement
    this.svg.id = 'connections-svg'

    this.transform.appendChild(this.svg)
    this.canvas.appendChild(this.transform)
    this.container.appendChild(this.canvas)

    this.applyTransform()
  }

  private applyTransform() {
    this.transform.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.scale})`
  }

  // ── Pan & Zoom ─────────────────────────────────────────

  private bindPanZoom() {
    let lastX = 0, lastY = 0, isPanning = false
    let pinchDist = 0

    const startPan = (x: number, y: number) => {
      isPanning = true; lastX = x; lastY = y
    }
    const movePan = (x: number, y: number) => {
      if (!isPanning) return
      this.panX += x - lastX
      this.panY += y - lastY
      lastX = x; lastY = y
      this.applyTransform()
    }
    const endPan = () => { isPanning = false }

    const isBackground = (t: EventTarget | null) => {
      if (!t || !(t instanceof Element)) return true
      return !t.closest('.rete-node') && !t.closest('.port')
    }

    this.canvas.addEventListener('mousedown', e => {
      if (isBackground(e.target)) startPan(e.clientX, e.clientY)
    })
    window.addEventListener('mousemove', e => movePan(e.clientX, e.clientY))
    window.addEventListener('mouseup', endPan)

    this.canvas.addEventListener('touchstart', e => {
      if (e.touches.length === 1) {
        const t = e.touches[0]
        if (isBackground(e.target)) startPan(t.clientX, t.clientY)
      } else if (e.touches.length === 2) {
        isPanning = false
        const dx = e.touches[0].clientX - e.touches[1].clientX
        const dy = e.touches[0].clientY - e.touches[1].clientY
        pinchDist = Math.hypot(dx, dy)
      }
    }, { passive: false })

    this.canvas.addEventListener('touchmove', e => {
      e.preventDefault()
      if (e.touches.length === 1) {
        movePan(e.touches[0].clientX, e.touches[0].clientY)
      } else if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX
        const dy = e.touches[0].clientY - e.touches[1].clientY
        const dist = Math.hypot(dx, dy)
        const delta = dist / pinchDist
        this.scale = Math.min(2, Math.max(0.3, this.scale * delta))
        pinchDist = dist
        this.applyTransform()
      }
    }, { passive: false })

    this.canvas.addEventListener('touchend', () => endPan())

    this.canvas.addEventListener('wheel', e => {
      e.preventDefault()
      const factor = e.deltaY < 0 ? 1.1 : 0.9
      this.scale = Math.min(2, Math.max(0.3, this.scale * factor))
      this.applyTransform()
    }, { passive: false })
  }

  // ── Node creation ──────────────────────────────────────

  addNode(type: string, x?: number, y?: number): NodeInstance | null {
    const def = getAllNodeDefs()[type]
    if (!def) return null

    const cx = x ?? (this.container.clientWidth / 2 - this.panX) / this.scale
    const cy = y ?? (this.container.clientHeight / 2 - this.panY) / this.scale

    const defaultProps: Record<string, string | number> = {}
    if (def.props) {
      for (const [k, v] of Object.entries(def.props)) {
        defaultProps[k] = (v as { defaultValue: string | number }).defaultValue
      }
    }

    const node: NodeInstance = {
      id: `n${++this.idCounter}`,
      type,
      x: Math.round(cx - 80),
      y: Math.round(cy - 40),
      props: defaultProps
    }

    this.nodes.set(node.id, node)
    this.renderNode(node, def)
    return node
  }

  private renderNode(node: NodeInstance, def: NodeDef) {
    const el = document.createElement('div')
    el.className = `rete-node ${def.category}-node`
    el.dataset.nodeId = node.id
    el.style.left = `${node.x}px`
    el.style.top = `${node.y}px`

    // Header
    const header = document.createElement('div')
    header.className = 'node-header'
    header.innerHTML = `<span>${def.icon}</span><span class="node-title">${def.label}</span>`
    const btnDel = document.createElement('button')
    btnDel.className = 'node-delete-btn'
    btnDel.textContent = '✕'
    btnDel.title = 'Usuń węzeł'
    btnDel.addEventListener('click', e => { e.stopPropagation(); this.removeNode(node.id) })
    btnDel.addEventListener('touchend', e => { e.stopPropagation(); this.removeNode(node.id) })
    header.appendChild(btnDel)
    el.appendChild(header)

    // Body: inputs + props + outputs
    const body = document.createElement('div')
    body.className = 'node-body'

    for (const port of def.inputs) {
      const row = document.createElement('div')
      row.className = 'node-port-row input'
      const portEl = this.createPort(node.id, port.id, port.type, false)
      const label = document.createElement('span')
      label.className = 'port-label'
      label.textContent = port.label
      row.appendChild(portEl)
      row.appendChild(label)
      body.appendChild(row)
    }

    if (def.props) {
      for (const [key, meta] of Object.entries(def.props)) {
        const row = document.createElement('div')
        row.className = 'node-port-row input'
        const label = document.createElement('span')
        label.className = 'port-label'
        label.textContent = meta.label

        if (meta.options) {
          const sel = document.createElement('select')
          sel.className = 'node-input-field'
          for (const opt of meta.options) {
            const o = document.createElement('option')
            o.value = opt; o.textContent = opt
            if (String(node.props[key] ?? meta.defaultValue) === opt) o.selected = true
            sel.appendChild(o)
          }
          sel.addEventListener('mousedown', e => e.stopPropagation())
          sel.addEventListener('touchstart', e => e.stopPropagation(), { passive: true })
          sel.addEventListener('change', () => { node.props[key] = sel.value })
          row.appendChild(label)
          row.appendChild(sel)
        } else {
          const inp = document.createElement('input')
          inp.className = 'node-input-field'
          inp.type = typeof meta.defaultValue === 'number' ? 'number' : 'text'
          inp.value = String(node.props[key] ?? meta.defaultValue)
          inp.addEventListener('mousedown', e => e.stopPropagation())
          inp.addEventListener('touchstart', e => e.stopPropagation(), { passive: true })
          inp.addEventListener('input', () => {
            node.props[key] = inp.type === 'number' ? parseFloat(inp.value) || 0 : inp.value
          })
          row.appendChild(label)
          row.appendChild(inp)
        }

        body.appendChild(row)
      }
    }

    for (const port of def.outputs) {
      const row = document.createElement('div')
      row.className = 'node-port-row output'
      const label = document.createElement('span')
      label.className = 'port-label'
      label.textContent = port.label
      const portEl = this.createPort(node.id, port.id, port.type, true)
      row.appendChild(label)
      row.appendChild(portEl)
      body.appendChild(row)
    }

    el.appendChild(body)
    this.transform.appendChild(el)
    node.el = el

    this.bindNodeDrag(node, header)
  }

  // ── Port element + connection dragging ─────────────────

  private createPort(nodeId: string, portId: string, type: PortType, isOutput: boolean): HTMLElement {
    const el = document.createElement('div')
    el.className = 'port'
    el.dataset.type = type
    el.dataset.nodeId = nodeId
    el.dataset.portId = portId
    el.dataset.isOutput = String(isOutput)

    const startConn = (clientX: number, clientY: number) => {
      const rect = el.getBoundingClientRect()
      const cx = (rect.left + rect.width / 2 - this.container.getBoundingClientRect().left - this.panX) / this.scale
      const cy = (rect.top + rect.height / 2 - this.container.getBoundingClientRect().top - this.panY) / this.scale

      const preview = document.createElementNS('http://www.w3.org/2000/svg', 'path') as SVGPathElement
      preview.classList.add('connection-path', 'preview')
      preview.dataset.type = type
      this.svg.appendChild(preview)

      const moveHandler = (mx: number, my: number) => {
        const ex = (mx - this.container.getBoundingClientRect().left - this.panX) / this.scale
        const ey = (my - this.container.getBoundingClientRect().top - this.panY) / this.scale
        const [ax, bx] = isOutput ? [cx, ex] : [ex, cx]
        const [ay, by] = isOutput ? [cy, ey] : [ey, cy]
        preview.setAttribute('d', this.bezierPath(ax, ay, bx, by))
      }

      const endHandler = (target: Element | null) => {
        preview.remove()
        if (target) {
          const portEl = target.closest('.port') as HTMLElement | null
          if (portEl && portEl !== el) {
            const tnId = portEl.dataset.nodeId!
            const tpId = portEl.dataset.portId!
            const tIsOutput = portEl.dataset.isOutput === 'true'
            if (tIsOutput !== isOutput) {
              const [fn, fp, tn, tp] = isOutput
                ? [nodeId, portId, tnId, tpId]
                : [tnId, tpId, nodeId, portId]
              this.connect(fn, fp, tn, tp, type)
            }
          }
        }
        window.removeEventListener('mousemove', mmHandler)
        window.removeEventListener('mouseup', muHandler)
        window.removeEventListener('touchmove', tmHandler)
        window.removeEventListener('touchend', teHandler)
      }

      const mmHandler = (e: MouseEvent) => moveHandler(e.clientX, e.clientY)
      const muHandler = (e: MouseEvent) => endHandler(document.elementFromPoint(e.clientX, e.clientY))
      const tmHandler = (e: TouchEvent) => { e.preventDefault(); moveHandler(e.touches[0].clientX, e.touches[0].clientY) }
      const teHandler = (e: TouchEvent) => endHandler(document.elementFromPoint(e.changedTouches[0].clientX, e.changedTouches[0].clientY))

      window.addEventListener('mousemove', mmHandler)
      window.addEventListener('mouseup', muHandler)
      window.addEventListener('touchmove', tmHandler, { passive: false })
      window.addEventListener('touchend', teHandler)

      void clientX; void clientY
    }

    el.addEventListener('mousedown', e => { e.stopPropagation(); startConn(e.clientX, e.clientY) })
    el.addEventListener('touchstart', e => { e.stopPropagation(); startConn(e.touches[0].clientX, e.touches[0].clientY) }, { passive: true })

    return el
  }

  // ── Connections ────────────────────────────────────────

  connect(fromNode: string, fromPort: string, toNode: string, toPort: string, type: PortType) {
    const exists = this.connections.find(c =>
      c.fromNode === fromNode && c.fromPort === fromPort &&
      c.toNode === toNode && c.toPort === toPort
    )
    if (exists) return

    const conn: Connection = {
      id: `c${++this.idCounter}`,
      fromNode, fromPort, toNode, toPort, type
    }
    this.connections.push(conn)
    this.renderConnection(conn)
  }

  private renderConnection(conn: Connection) {
    const [ax, ay] = this.getPortCenter(conn.fromNode, conn.fromPort, true)
    const [bx, by] = this.getPortCenter(conn.toNode, conn.toPort, false)
    const d = this.bezierPath(ax, ay, bx, by)

    // Invisible wide path for easy click/touch target
    const hit = document.createElementNS('http://www.w3.org/2000/svg', 'path') as SVGPathElement
    hit.classList.add('connection-hit')
    hit.dataset.connId = conn.id
    hit.setAttribute('d', d)

    // Visible styled path
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path') as SVGPathElement
    path.classList.add('connection-path')
    path.dataset.type = conn.type
    path.dataset.connId = conn.id
    path.setAttribute('d', d)

    this.svg.appendChild(path)
    this.svg.appendChild(hit)

    const remove = () => this.removeConnection(conn.id)
    hit.addEventListener('click', remove)
    hit.addEventListener('touchend', (e) => { e.preventDefault(); remove() })

    // Hover: highlight the visible path
    hit.addEventListener('mouseenter', () => path.classList.add('hovered'))
    hit.addEventListener('mouseleave', () => path.classList.remove('hovered'))
  }

  private getPortCenter(nodeId: string, portId: string, isOutput: boolean): [number, number] {
    const node = this.nodes.get(nodeId)
    if (!node?.el) return [0, 0]

    const portEl = node.el.querySelector(`.port[data-port-id="${portId}"][data-is-output="${isOutput}"]`) as HTMLElement | null
    if (!portEl) return [node.x + 80, node.y + 40]

    const nodeRect = this.transform.getBoundingClientRect()
    const portRect = portEl.getBoundingClientRect()
    const x = (portRect.left + portRect.width / 2 - nodeRect.left) / this.scale
    const y = (portRect.top + portRect.height / 2 - nodeRect.top) / this.scale
    return [x, y]
  }

  private bezierPath(x1: number, y1: number, x2: number, y2: number): string {
    const dx = Math.abs(x2 - x1) * 0.5 + 40
    return `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`
  }

  removeNode(id: string) {
    const node = this.nodes.get(id)
    if (!node) return
    // Remove all connections involving this node
    const toRemove = this.connections.filter(c => c.fromNode === id || c.toNode === id)
    toRemove.forEach(c => this.removeConnection(c.id))
    // Remove DOM element
    node.el?.remove()
    this.nodes.delete(id)
  }

  removeConnection(id: string) {
    this.connections = this.connections.filter(c => c.id !== id)
    this.svg.querySelectorAll(`[data-conn-id="${id}"]`).forEach(el => el.remove())
  }

  refreshConnections() {
    for (const conn of this.connections) {
      const [ax, ay] = this.getPortCenter(conn.fromNode, conn.fromPort, true)
      const [bx, by] = this.getPortCenter(conn.toNode, conn.toPort, false)
      const d = this.bezierPath(ax, ay, bx, by)
      this.svg.querySelectorAll<SVGPathElement>(`[data-conn-id="${conn.id}"]`)
        .forEach(el => el.setAttribute('d', d))
    }
  }

  // ── Node drag ──────────────────────────────────────────

  private bindNodeDrag(node: NodeInstance, handle: HTMLElement) {
    let startX = 0, startY = 0, startNX = 0, startNY = 0, dragging = false

    const start = (cx: number, cy: number) => {
      dragging = true
      startX = cx; startY = cy
      startNX = node.x; startNY = node.y
    }
    const move = (cx: number, cy: number) => {
      if (!dragging) return
      node.x = startNX + (cx - startX) / this.scale
      node.y = startNY + (cy - startY) / this.scale
      if (node.el) {
        node.el.style.left = `${node.x}px`
        node.el.style.top = `${node.y}px`
      }
      this.refreshConnections()
    }
    const end = () => { dragging = false }

    handle.addEventListener('mousedown', e => { e.stopPropagation(); start(e.clientX, e.clientY) })
    window.addEventListener('mousemove', e => move(e.clientX, e.clientY))
    window.addEventListener('mouseup', end)

    handle.addEventListener('touchstart', e => { e.stopPropagation(); start(e.touches[0].clientX, e.touches[0].clientY) }, { passive: true })
    window.addEventListener('touchmove', e => { if (dragging) { e.preventDefault(); move(e.touches[0].clientX, e.touches[0].clientY) } }, { passive: false })
    window.addEventListener('touchend', end)
  }

  // ── Serialization ──────────────────────────────────────

  serialize(): string {
    const data = {
      nodes: Array.from(this.nodes.values()).map(n => ({ id: n.id, type: n.type, x: n.x, y: n.y, props: n.props })),
      connections: this.connections
    }
    return JSON.stringify(data, null, 2)
  }

  load(json: string) {
    this.clear()
    try {
      const data = JSON.parse(json)
      // First pass: create all nodes
      for (const n of data.nodes ?? []) {
        const def = getAllNodeDefs()[n.type]
        if (!def) continue
        const node: NodeInstance = { id: n.id, type: n.type, x: n.x, y: n.y, props: { ...n.props } }
        this.nodes.set(node.id, node)
        this.renderNode(node, def)
        const num = parseInt(n.id.replace('n', '')) || 0
        if (num > this.idCounter) this.idCounter = num
      }
      // Second pass: connections (after DOM nodes are rendered)
      requestAnimationFrame(() => {
        for (const c of data.connections ?? []) {
          this.connect(c.fromNode, c.fromPort, c.toNode, c.toPort, c.type)
        }
      })
    } catch (e) {
      console.error('NodeEditor load failed', e)
    }
  }

  clear() {
    this.nodes.forEach(n => n.el?.remove())
    this.nodes.clear()
    this.connections = []
    while (this.svg.firstChild) this.svg.firstChild.remove()
  }
}
