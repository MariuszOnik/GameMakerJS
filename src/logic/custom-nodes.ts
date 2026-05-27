export interface CustomNodeDef {
  type: string
  label: string
  icon: string
  category: 'event' | 'action' | 'value'
  props: Record<string, { label: string; defaultValue: string | number; options?: string[] }>
  runSource: string // def.run.toString() – odtwarzany przez new Function
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

export function getCustomRunFn(def: CustomNodeDef): (inputs: Record<string, string>) => string {
  return new Function('return (' + def.runSource + ')')() as (inputs: Record<string, string>) => string
}
