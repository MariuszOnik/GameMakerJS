import { NODE_DEFS, type NodeDef } from './node-types'
import { getCustomNodes } from './custom-nodes'

export function getAllNodeDefs(): Record<string, NodeDef> {
  const result: Record<string, NodeDef> = { ...NODE_DEFS }
  for (const c of getCustomNodes()) {
    result[c.type] = {
      type: c.type,
      label: c.label,
      icon: c.icon,
      category: c.category,
      inputs:  [{ id: 'exec', label: '', type: 'exec' }],
      outputs: [{ id: 'exec', label: '', type: 'exec' }],
      props: c.props
    }
  }
  return result
}
