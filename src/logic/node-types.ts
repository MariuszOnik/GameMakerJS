export type PortType = 'exec' | 'number' | 'string' | 'bool'

export interface PortDef {
  id: string
  label: string
  type: PortType
}

export interface PropDef {
  label: string
  defaultValue: string | number
  options?: string[]
}

export interface NodeDef {
  type: string
  label: string
  icon: string
  category: 'event' | 'action' | 'value'
  inputs: PortDef[]
  outputs: PortDef[]
  props?: Record<string, PropDef>
}

export const NODE_DEFS: Record<string, NodeDef> = {
  'on-start': {
    type: 'on-start', label: 'Na Start', icon: '🟢', category: 'event',
    inputs: [],
    outputs: [{ id: 'exec', label: '', type: 'exec' }]
  },
  'on-update': {
    type: 'on-update', label: 'Na Update', icon: '🔄', category: 'event',
    inputs: [],
    outputs: [{ id: 'exec', label: '', type: 'exec' }]
  },
  'on-input': {
    type: 'on-input', label: 'Na Dotyk/Klik', icon: '👆', category: 'event',
    inputs: [],
    outputs: [
      { id: 'exec', label: '', type: 'exec' },
      { id: 'x', label: 'X', type: 'number' },
      { id: 'y', label: 'Y', type: 'number' }
    ]
  },
  'move-sprite': {
    type: 'move-sprite', label: 'Rusz Sprite', icon: '➡', category: 'action',
    inputs: [
      { id: 'exec', label: '', type: 'exec' },
      { id: 'target', label: 'ID', type: 'string' },
      { id: 'dx', label: 'dX', type: 'number' },
      { id: 'dy', label: 'dY', type: 'number' }
    ],
    outputs: [{ id: 'exec', label: '', type: 'exec' }],
    props: {
      target: { label: 'Sprite ID', defaultValue: 'Sprite1' },
      dx: { label: 'dX', defaultValue: 5 },
      dy: { label: 'dY', defaultValue: 0 }
    }
  },
  'set-velocity': {
    type: 'set-velocity', label: 'Ustaw Prędkość', icon: '💨', category: 'action',
    inputs: [
      { id: 'exec', label: '', type: 'exec' },
      { id: 'target', label: 'ID', type: 'string' },
      { id: 'vx', label: 'VX', type: 'number' },
      { id: 'vy', label: 'VY', type: 'number' }
    ],
    outputs: [{ id: 'exec', label: '', type: 'exec' }],
    props: {
      vx: { label: 'VX', defaultValue: 200 },
      vy: { label: 'VY', defaultValue: 0 }
    }
  },
  'log': {
    type: 'log', label: 'Log', icon: '📋', category: 'action',
    inputs: [
      { id: 'exec', label: '', type: 'exec' },
      { id: 'msg', label: 'Wiadomość', type: 'string' }
    ],
    outputs: [{ id: 'exec', label: '', type: 'exec' }],
    props: { msg: { label: 'Tekst', defaultValue: 'Hello!' } }
  },
  'number': {
    type: 'number', label: 'Liczba', icon: '🔢', category: 'value',
    inputs: [],
    outputs: [{ id: 'value', label: 'Wartość', type: 'number' }],
    props: { value: { label: 'Liczba', defaultValue: 0 } }
  },
  'string': {
    type: 'string', label: 'Tekst', icon: '📝', category: 'value',
    inputs: [],
    outputs: [{ id: 'value', label: 'Wartość', type: 'string' }],
    props: { value: { label: 'Tekst', defaultValue: '' } }
  },

  // ── Faza 2 ─────────────────────────────────────────────

  'math': {
    type: 'math', label: 'Matematyka', icon: '➗', category: 'value',
    inputs: [
      { id: 'a', label: 'A', type: 'number' },
      { id: 'b', label: 'B', type: 'number' }
    ],
    outputs: [{ id: 'result', label: 'Wynik', type: 'number' }],
    props: {
      operator: { label: 'Operator', defaultValue: '+', options: ['+', '-', '*', '/', '%'] },
      a: { label: 'A', defaultValue: 0 },
      b: { label: 'B', defaultValue: 0 }
    }
  },
  'random': {
    type: 'random', label: 'Losowa liczba', icon: '🎲', category: 'value',
    inputs: [],
    outputs: [{ id: 'value', label: 'Wartość', type: 'number' }],
    props: {
      min: { label: 'Min', defaultValue: 0 },
      max: { label: 'Max', defaultValue: 100 }
    }
  },
  'if-condition': {
    type: 'if-condition', label: 'Warunek', icon: '🔀', category: 'action',
    inputs: [
      { id: 'exec', label: '', type: 'exec' },
      { id: 'a', label: 'A', type: 'number' },
      { id: 'b', label: 'B', type: 'number' }
    ],
    outputs: [
      { id: 'exec-true', label: 'Prawda', type: 'exec' },
      { id: 'exec-false', label: 'Fałsz', type: 'exec' }
    ],
    props: {
      operator: { label: 'Operator', defaultValue: '>', options: ['>', '<', '>=', '<=', '==', '!='] },
      a: { label: 'A', defaultValue: 0 },
      b: { label: 'B', defaultValue: 0 }
    }
  },
  'set-variable': {
    type: 'set-variable', label: 'Ustaw Zmienną', icon: '📦', category: 'action',
    inputs: [
      { id: 'exec', label: '', type: 'exec' },
      { id: 'value', label: 'Wartość', type: 'number' }
    ],
    outputs: [{ id: 'exec', label: '', type: 'exec' }],
    props: {
      name: { label: 'Nazwa', defaultValue: 'punkty' },
      value: { label: 'Wartość', defaultValue: 0 }
    }
  },
  'get-variable': {
    type: 'get-variable', label: 'Pobierz Zmienną', icon: '📤', category: 'value',
    inputs: [],
    outputs: [{ id: 'value', label: 'Wartość', type: 'number' }],
    props: { name: { label: 'Nazwa', defaultValue: 'punkty' } }
  },
  'wait': {
    type: 'wait', label: 'Czekaj', icon: '⏳', category: 'action',
    inputs: [
      { id: 'exec', label: '', type: 'exec' },
      { id: 'seconds', label: 'Sekundy', type: 'number' }
    ],
    outputs: [{ id: 'exec', label: 'Po', type: 'exec' }],
    props: { seconds: { label: 'Sekundy', defaultValue: 1 } }
  },
  'show-text': {
    type: 'show-text', label: 'Wyświetl Tekst', icon: '💬', category: 'action',
    inputs: [
      { id: 'exec', label: '', type: 'exec' },
      { id: 'text', label: 'Tekst', type: 'string' }
    ],
    outputs: [{ id: 'exec', label: '', type: 'exec' }],
    props: {
      target: { label: 'ID Tekstu', defaultValue: 'Tekst1' },
      text: { label: 'Treść', defaultValue: 'Wynik: 0' }
    }
  },

  // ── Faza 4 ─────────────────────────────────────────────

  'jump': {
    type: 'jump', label: 'Skocz', icon: '🦘', category: 'action',
    inputs: [
      { id: 'exec', label: '', type: 'exec' },
      { id: 'target', label: 'ID', type: 'string' },
      { id: 'force', label: 'Siła', type: 'number' }
    ],
    outputs: [{ id: 'exec', label: '', type: 'exec' }],
    props: {
      target: { label: 'Sprite ID', defaultValue: 'Sprite1' },
      force: { label: 'Siła', defaultValue: 400 }
    }
  }
}
