import type { PortDef } from './node-types'

export interface CustomNodeDef {
  type: string
  label: string
  icon: string
  category: 'event' | 'action' | 'value'
  inputs: PortDef[]
  outputs: PortDef[]
  props: Record<string, { label: string; defaultValue: string | number; options?: string[] }>
  runSource: string
  helpers?: Record<string, string>  // top-level this.Fn = function(){} captured at registration
}

const KEY = 'gmjs_custom_nodes'

export function getCustomNodes(): CustomNodeDef[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '[]') } catch { return [] }
}

export function saveCustomNode(def: CustomNodeDef) {
  const all = getCustomNodes().filter(n => n.type !== def.type)
  all.push(def)
  localStorage.setItem(KEY, JSON.stringify(all))
}

export function deleteCustomNode(type: string) {
  localStorage.setItem(KEY, JSON.stringify(getCustomNodes().filter(n => n.type !== type)))
}
