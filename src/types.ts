export interface SceneObjectDef {
  id: string
  type: 'sprite' | 'text' | 'rect' | 'empty'
  x: number
  y: number
  width?: number
  height?: number
  label: string
  color?: number
  text?: string
  assetKey?: string
  physicsEnabled?: boolean
  isStatic?: boolean
  bounce?: number
  allowGravity?: boolean
  collideWorldBounds?: boolean
  cameraFollow?: boolean
  graph: string
}

export interface GameState {
  id: string
  name: string
  objects: SceneObjectDef[]
  graph: string
  orientation?: 'any' | 'landscape' | 'portrait'
}
