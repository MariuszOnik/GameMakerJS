export type PortType = 'exec' | 'number' | 'string' | 'bool'

export interface PortDef {
  id: string
  label: string
  type: PortType
}

export interface NodeDef {
  type: string
  label: string
  icon: string
  category: 'event' | 'action' | 'value'
  inputs: PortDef[]
  outputs: PortDef[]
  /** Default property values editable in node body */
  props?: Record<string, { label: string; defaultValue: string | number }>
}

export const NODE_DEFS: Record<string, NodeDef> = {
  'on-start': {
    type: 'on-start',
    label: 'Na Start',
    icon: '🟢',
    category: 'event',
    inputs: [],
    outputs: [{ id: 'exec', label: '', type: 'exec' }]
  },
  'on-update': {
    type: 'on-update',
    label: 'Na Update',
    icon: '🔄',
    category: 'event',
    inputs: [],
    outputs: [{ id: 'exec', label: '', type: 'exec' }]
  },
  'on-input': {
    type: 'on-input',
    label: 'Na Dotyk/Klik',
    icon: '👆',
    category: 'event',
    inputs: [],
    outputs: [
      { id: 'exec', label: '', type: 'exec' },
      { id: 'x', label: 'X', type: 'number' },
      { id: 'y', label: 'Y', type: 'number' }
    ]
  },
  'move-sprite': {
    type: 'move-sprite',
    label: 'Rusz Sprite',
    icon: '➡',
    category: 'action',
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
    type: 'set-velocity',
    label: 'Ustaw Prędkość',
    icon: '💨',
    category: 'action',
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
    type: 'log',
    label: 'Log',
    icon: '📋',
    category: 'action',
    inputs: [
      { id: 'exec', label: '', type: 'exec' },
      { id: 'msg', label: 'Wiadomość', type: 'string' }
    ],
    outputs: [{ id: 'exec', label: '', type: 'exec' }],
    props: {
      msg: { label: 'Tekst', defaultValue: 'Hello!' }
    }
  },
  'number': {
    type: 'number',
    label: 'Liczba',
    icon: '🔢',
    category: 'value',
    inputs: [],
    outputs: [{ id: 'value', label: 'Wartość', type: 'number' }],
    props: {
      value: { label: 'Liczba', defaultValue: 0 }
    }
  },
  'string': {
    type: 'string',
    label: 'Tekst',
    icon: '📝',
    category: 'value',
    inputs: [],
    outputs: [{ id: 'value', label: 'Wartość', type: 'string' }],
    props: {
      value: { label: 'Tekst', defaultValue: '' }
    }
  }
}
