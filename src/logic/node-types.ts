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

  // ── Zdarzenia ─────────────────────────────────────────────

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
  'on-enter': {
    type: 'on-enter', label: 'Na Wejście (Stan)', icon: '🟣', category: 'event',
    inputs: [],
    outputs: [{ id: 'exec', label: '', type: 'exec' }]
  },
  'on-exit': {
    type: 'on-exit', label: 'Na Wyjście (Stan)', icon: '🔴', category: 'event',
    inputs: [],
    outputs: [{ id: 'exec', label: '', type: 'exec' }]
  },

  // ── Akcje ─────────────────────────────────────────────────

  'move-sprite': {
    type: 'move-sprite', label: 'Rusz Obiekt', icon: '➡', category: 'action',
    inputs: [
      { id: 'exec', label: '', type: 'exec' },
      { id: 'target', label: 'Cel', type: 'string' },
      { id: 'dx', label: 'dX', type: 'number' },
      { id: 'dy', label: 'dY', type: 'number' }
    ],
    outputs: [{ id: 'exec', label: '', type: 'exec' }],
    props: {
      target: { label: 'Cel (self = ten obiekt)', defaultValue: 'self' },
      dx: { label: 'dX', defaultValue: 5 },
      dy: { label: 'dY', defaultValue: 0 }
    }
  },
  'set-velocity': {
    type: 'set-velocity', label: 'Ustaw Prędkość', icon: '💨', category: 'action',
    inputs: [
      { id: 'exec', label: '', type: 'exec' },
      { id: 'target', label: 'Cel', type: 'string' },
      { id: 'vx', label: 'VX', type: 'number' },
      { id: 'vy', label: 'VY', type: 'number' }
    ],
    outputs: [{ id: 'exec', label: '', type: 'exec' }],
    props: {
      target: { label: 'Cel (self = ten obiekt)', defaultValue: 'self' },
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
  'show-text': {
    type: 'show-text', label: 'Wyświetl Tekst', icon: '💬', category: 'action',
    inputs: [
      { id: 'exec', label: '', type: 'exec' },
      { id: 'text', label: 'Tekst', type: 'string' }
    ],
    outputs: [{ id: 'exec', label: '', type: 'exec' }],
    props: {
      target: { label: 'Cel (self = ten obiekt)', defaultValue: 'self' },
      text: { label: 'Treść', defaultValue: 'Wynik: 0' }
    }
  },
  'set-position': {
    type: 'set-position', label: 'Ustaw pozycję', icon: '📍', category: 'action',
    inputs: [
      { id: 'exec', label: '', type: 'exec' },
      { id: 'target', label: 'Cel', type: 'string' },
      { id: 'x', label: 'X', type: 'number' },
      { id: 'y', label: 'Y', type: 'number' }
    ],
    outputs: [{ id: 'exec', label: '', type: 'exec' }],
    props: {
      target: { label: 'Cel (self = ten obiekt)', defaultValue: 'self' },
      x: { label: 'X', defaultValue: 0 },
      y: { label: 'Y', defaultValue: 0 }
    }
  },
  'set-visible': {
    type: 'set-visible', label: 'Pokaż / Ukryj', icon: '👁', category: 'action',
    inputs: [
      { id: 'exec', label: '', type: 'exec' },
      { id: 'target', label: 'Cel', type: 'string' }
    ],
    outputs: [{ id: 'exec', label: '', type: 'exec' }],
    props: {
      target: { label: 'Cel (self = ten obiekt)', defaultValue: 'self' },
      visible: { label: 'Tryb', defaultValue: 'pokaz', options: ['pokaz', 'ukryj', 'przelacz'] }
    }
  },
  'jump': {
    type: 'jump', label: 'Skocz', icon: '🦘', category: 'action',
    inputs: [
      { id: 'exec', label: '', type: 'exec' },
      { id: 'target', label: 'Cel', type: 'string' },
      { id: 'force', label: 'Siła', type: 'number' }
    ],
    outputs: [{ id: 'exec', label: '', type: 'exec' }],
    props: {
      target: { label: 'Cel (self = ten obiekt)', defaultValue: 'self' },
      force: { label: 'Siła', defaultValue: 400 }
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
  'wait': {
    type: 'wait', label: 'Czekaj', icon: '⏳', category: 'action',
    inputs: [
      { id: 'exec', label: '', type: 'exec' },
      { id: 'seconds', label: 'Sekundy', type: 'number' }
    ],
    outputs: [{ id: 'exec', label: 'Po', type: 'exec' }],
    props: { seconds: { label: 'Sekundy', defaultValue: 1 } }
  },
  'change-state': {
    type: 'change-state', label: 'Zmień Stan', icon: '🔀', category: 'action',
    inputs: [{ id: 'exec', label: '', type: 'exec' }],
    outputs: [],
    props: { state: { label: 'Nazwa stanu', defaultValue: 'Menu' } }
  },
  'push-state': {
    type: 'push-state', label: 'Wciśnij Stan (stack)', icon: '📥', category: 'action',
    inputs: [{ id: 'exec', label: '', type: 'exec' }],
    outputs: [],
    props: { state: { label: 'Nazwa stanu', defaultValue: 'Pauza' } }
  },
  'pop-state': {
    type: 'pop-state', label: 'Wyskocz ze Stanu (stack)', icon: '📤', category: 'action',
    inputs: [{ id: 'exec', label: '', type: 'exec' }],
    outputs: []
  },

  // ── Wartości ──────────────────────────────────────────────

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
  'get-variable': {
    type: 'get-variable', label: 'Pobierz Zmienną', icon: '📤', category: 'value',
    inputs: [],
    outputs: [{ id: 'value', label: 'Wartość', type: 'number' }],
    props: { name: { label: 'Nazwa', defaultValue: 'punkty' } }
  },
  'get-property': {
    type: 'get-property', label: 'Pobierz właściwość', icon: '🎯', category: 'value',
    inputs: [],
    outputs: [{ id: 'value', label: 'Wartość', type: 'number' }],
    props: {
      target: { label: 'Cel (self = ten obiekt)', defaultValue: 'self' },
      prop: { label: 'Właściwość', defaultValue: 'x', options: ['x', 'y', 'vx', 'vy', 'width', 'height'] }
    }
  },
  'get-object': {
    type: 'get-object', label: 'Pobierz Obiekt', icon: '🔗', category: 'value',
    inputs: [],
    outputs: [{ id: 'target', label: 'Referencja', type: 'string' }],
    props: { label: { label: 'Nazwa obiektu', defaultValue: 'Sprite1' } }
  }
}
