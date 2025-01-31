import { InferenceSession, Tensor } from 'onnxruntime-web'
import { MODEL_WIDTH, MODEL_HEIGHT, MaskPixel, Point } from './types'

export function getPixelSet(pixels: MaskPixel[]): Set<string> {
  const pixelSet = new Set<string>()
  pixels.forEach(({ x, y }) => {
    pixelSet.add(`${x},${y}`)
  })
  return pixelSet
}

export function getBoundaryPixels(pixels: MaskPixel[]): MaskPixel[] {
  // Create a binary image array
  const bounds = getBoundingBox(pixels)
  const width = bounds.maxX - bounds.minX + 3 // Add padding
  const height = bounds.maxY - bounds.minY + 3
  const image = new Uint8Array(width * height)

  // Fill the image
  for (const { x, y } of pixels) {
    const ix = x - bounds.minX + 1
    const iy = y - bounds.minY + 1
    image[iy * width + ix] = 1
  }

  // Kernel for boundary detection
  const kernel = [
    [0, 1, 0],
    [1, 1, 1],
    [0, 1, 0],
  ]

  const boundary: MaskPixel[] = []

  // Apply convolution
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      if (image[y * width + x] === 1) {
        let sum = 0
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            sum += image[(y + ky) * width + (x + kx)] * kernel[ky + 1][kx + 1]
          }
        }
        // If sum < 5, it means at least one neighbor is missing
        if (sum < 5) {
          boundary.push({
            x: x + bounds.minX - 1,
            y: y + bounds.minY - 1,
          })
        }
      }
    }
  }

  return boundary
}

function getBoundingBox(pixels: MaskPixel[]) {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  for (const { x, y } of pixels) {
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
  }

  return { minX, minY, maxX, maxY }
}

export function generateRandomColor(): [number, number, number] {
  return [
    Math.floor(Math.random() * 256),
    Math.floor(Math.random() * 256),
    Math.floor(Math.random() * 256),
  ]
}

export async function generateMaskFromPoints(
  inferenceSession: InferenceSession,
  imageEmbedding: Tensor,
  points: Point[],
  previousMask?: Tensor | null | undefined,
  threshold = 0.5,
): Promise<{ maskTensor: Tensor; maskPixels: MaskPixel[] }> {
  const flatCoords = points.flatMap((point) => [point.x, point.y])
  const pointCoords = new Tensor(new Float32Array([...flatCoords]), [1, points.length, 2])
  const pointLabels = new Tensor(
    new Float32Array([...points.map((point) => (point.type === 'positive' ? 1 : 0))]),
    [1, points.length],
  )

  try {
    const result = await inferenceSession.run({
      image_embeddings: imageEmbedding,
      point_coords: pointCoords,
      point_labels: pointLabels,
      mask_input: previousMask ?? new Tensor(new Float32Array(256 * 256), [1, 1, 256, 256]),
      has_mask_input: new Tensor(new Float32Array([previousMask ? 1 : 0]), [1]),
      orig_im_size: new Tensor(new Float32Array([MODEL_HEIGHT, MODEL_WIDTH]), [2]),
    })

    const maskImageData = result.masks.toImageData()
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

    return { maskTensor: result.low_res_masks, maskPixels }
  } finally {
    pointCoords.dispose()
    pointLabels.dispose()
  }
}
