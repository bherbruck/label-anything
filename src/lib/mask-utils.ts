import * as ort from 'onnxruntime-web'
import { MODEL_WIDTH, MODEL_HEIGHT, MaskPixel, Point } from './types'

export function getPixelSet(pixels: MaskPixel[]): Set<string> {
  const pixelSet = new Set<string>()
  pixels.forEach(({ x, y }) => {
    pixelSet.add(`${x},${y}`)
  })
  return pixelSet
}

export function getBoundaryPixels(pixels: MaskPixel[]): MaskPixel[] {
  const pixelSet = getPixelSet(pixels)
  const boundary: MaskPixel[] = []
  const directions = [
    { dx: -1, dy: 0 },
    { dx: 1, dy: 0 },
    { dx: 0, dy: -1 },
    { dx: 0, dy: 1 },
  ]

  pixels.forEach(({ x, y }) => {
    for (const { dx, dy } of directions) {
      const nx = x + dx
      const ny = y + dy
      if (!pixelSet.has(`${nx},${ny}`)) {
        boundary.push({ x, y })
        break
      }
    }
  })

  return boundary
}

export function generateRandomColor(): [number, number, number] {
  return [
    Math.floor(Math.random() * 256),
    Math.floor(Math.random() * 256),
    Math.floor(Math.random() * 256),
  ]
}

export async function generateMaskFromPoints(
  decoderSession: ort.InferenceSession,
  imageEmbedding: ort.Tensor,
  points: Point[],
  threshold = 0.5,
): Promise<MaskPixel[]> {
  const flatCoords = points.flatMap((point) => [point.x, point.y])
  const pointCoords = new ort.Tensor(new Float32Array([...flatCoords]), [1, points.length, 2])
  const pointLabels = new ort.Tensor(
    new Float32Array([...points.map((point) => (point.type === 'positive' ? 1 : 0))]),
    [1, points.length],
  )

  try {
    const results = await decoderSession.run({
      image_embeddings: imageEmbedding,
      point_coords: pointCoords,
      point_labels: pointLabels,
      mask_input: new ort.Tensor(new Float32Array(256 * 256), [1, 1, 256, 256]),
      has_mask_input: new ort.Tensor(new Float32Array([0]), [1]),
      orig_im_size: new ort.Tensor(new Float32Array([MODEL_HEIGHT, MODEL_WIDTH]), [2]),
    })

    const maskImageData = results.masks.toImageData()
    const data = maskImageData.data
    const maskPixels: MaskPixel[] = []

    // Convert binary mask to pixel coordinates
    for (let i = 0; i < MODEL_WIDTH * MODEL_HEIGHT; i++) {
      if (data[i * 4] / 255 > threshold) {
        maskPixels.push({
          x: i % MODEL_WIDTH,
          y: Math.floor(i / MODEL_WIDTH),
        })
      }
    }

    return maskPixels
  } finally {
    pointCoords.dispose()
    pointLabels.dispose()
  }
}