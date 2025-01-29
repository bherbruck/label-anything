export type MaskPixel = {
  x: number
  y: number
}

export type Label = {
  id: string
  name: string
}

export type Point = {
  x: number
  y: number
  type: 'positive' | 'negative'
}

export type Mask = {
  id: number
  color: [number, number, number]
  pixels: MaskPixel[]
  labelId?: string
  points?: Point[] // Add points array to store edit points
}

export type ImageSize = {
  width: number
  height: number
}

export type SavedMaskData = {
  masks: Mask[]
}

export type SavedLabelData = {
  labels: Label[]
}

export const MODEL_WIDTH = 1024
export const MODEL_HEIGHT = 684

export function isSavedMaskData(data: unknown): data is SavedMaskData {
  if (!data || typeof data !== 'object') return false

  const candidate = data as SavedMaskData

  if (!Array.isArray(candidate.masks)) {
    return false
  }

  return candidate.masks.every(
    (mask) =>
      typeof mask === 'object' &&
      typeof mask.id === 'number' &&
      Array.isArray(mask.color) &&
      mask.color.length === 3 &&
      mask.color.every((n) => typeof n === 'number' && n >= 0 && n <= 255) &&
      Array.isArray(mask.pixels) &&
      mask.pixels.every(
        (p) =>
          typeof p === 'object' &&
          typeof p.x === 'number' &&
          typeof p.y === 'number' &&
          p.x >= 0 &&
          p.x < MODEL_WIDTH &&
          p.y >= 0 &&
          p.y < MODEL_HEIGHT
      ) &&
      (mask.labelId === undefined || typeof mask.labelId === 'string')
  )
}

export function isSavedLabelData(data: unknown): data is SavedLabelData {
  if (!data || typeof data !== 'object') return false

  const candidate = data as SavedLabelData

  if (!Array.isArray(candidate.labels)) {
    return false
  }

  return candidate.labels.every(
    (label) =>
      typeof label === 'object' &&
      typeof label.id === 'string' &&
      typeof label.name === 'string'
  )
}