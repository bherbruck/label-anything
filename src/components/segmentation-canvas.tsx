import React, { useCallback, useEffect, useRef } from 'react'
import { ImageSize, Mask, MODEL_WIDTH, MODEL_HEIGHT, Point } from '@/lib/types'
import { getBoundaryPixels } from '@/lib/mask-utils'

interface SegmentationCanvasProps {
  image: ImageBitmap | null
  dimensions: ImageSize | null
  masks: Mask[]
  selectedMaskId: number | null
  onCanvasClick: (e: React.MouseEvent<HTMLCanvasElement>) => void
  previewMask: Mask | null
  points: Point[]
  isEditing?: boolean
}

const SegmentationCanvas: React.FC<SegmentationCanvasProps> = ({
  image,
  dimensions,
  masks,
  selectedMaskId,
  onCanvasClick,
  previewMask,
  points,
  isEditing = false,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Create ImageData for rendering masks
  const createColoredMaskImageData = (masks: Mask[], width: number, height: number): ImageData => {
    const imageData = new ImageData(width, height)
    const data = imageData.data

    // Draw masks in order, allowing later masks to overlap earlier ones
    masks.forEach((mask) => {
      const [r, g, b] = mask.color
      mask.pixels.forEach(({ x, y }) => {
        const pixelIndex = (y * width + x) * 4
        data[pixelIndex] = r
        data[pixelIndex + 1] = g
        data[pixelIndex + 2] = b
        data[pixelIndex + 3] = 192 // Alpha
      })
    })

    return imageData
  }

  // Function to draw outlines around masks
  const drawOutlines = (
    context: CanvasRenderingContext2D,
    masks: Mask[],
    width: number,
    height: number,
  ) => {
    masks.forEach((mask) => {
      const boundaryPixels = getBoundaryPixels(mask.pixels)
      context.fillStyle = 'black' // Outline color
      boundaryPixels.forEach(({ x, y }) => {
        const scaledX = (x / MODEL_WIDTH) * width
        const scaledY = (y / MODEL_HEIGHT) * height
        context.fillRect(scaledX, scaledY, 1, 1)
      })
    })
  }

  const updateCanvasSize = useCallback(() => {
    if (!canvasRef.current || !containerRef.current || !image) return

    const containerRect = containerRef.current.getBoundingClientRect()
    const containerWidth = containerRect.width
    const containerHeight = containerRect.height

    // Calculate the scaling factors for width and height
    const scaleWidth = containerWidth / image.width
    const scaleHeight = containerHeight / image.height

    // Use the smaller scale to ensure the image fits both dimensions
    const scale = Math.min(scaleWidth, scaleHeight)

    // Calculate the final dimensions
    const width = Math.floor(image.width * scale)
    const height = Math.floor(image.height * scale)

    // Update dimensions state if needed
    if (dimensions?.width !== width || dimensions?.height !== height) {
      dimensions = { width, height }
    }

    return { width, height }
  }, [image, dimensions])

  // Draw canvas content
  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context || !image) return

    const newDimensions = updateCanvasSize()
    if (!newDimensions) return

    const { width, height } = newDimensions

    // Set canvas size
    canvas.width = width
    canvas.height = height

    // Clear and draw image
    context.clearRect(0, 0, width, height)
    context.drawImage(image, 0, 0, width, height)

    // Draw masks if any exist
    if (masks.length > 0) {
      // Create temporary canvas for mask rendering
      const tempCanvas = document.createElement('canvas')
      tempCanvas.width = MODEL_WIDTH
      tempCanvas.height = MODEL_HEIGHT
      const tempContext = tempCanvas.getContext('2d')
      if (!tempContext) return

      // Create and draw mask data
      const maskImageData = createColoredMaskImageData(masks, MODEL_WIDTH, MODEL_HEIGHT)
      tempContext.putImageData(maskImageData, 0, 0)

      // Draw masks with transparency
      context.save()
      context.globalAlpha = 0.5
      context.drawImage(tempCanvas, 0, 0, width, height)
      context.restore()

      // Draw outlines on top of masks
      context.save()
      context.globalAlpha = 1.0
      drawOutlines(context, masks, width, height)
      context.restore()
    }

    // Draw preview mask if exists
    if (previewMask) {
      const tempCanvas = document.createElement('canvas')
      tempCanvas.width = MODEL_WIDTH
      tempCanvas.height = MODEL_HEIGHT
      const tempContext = tempCanvas.getContext('2d')
      if (!tempContext) return

      const previewImageData = createColoredMaskImageData([previewMask], MODEL_WIDTH, MODEL_HEIGHT)
      tempContext.putImageData(previewImageData, 0, 0)

      context.save()
      context.globalAlpha = 0.5
      context.drawImage(tempCanvas, 0, 0, width, height)
      context.restore()

      if (isEditing) {
        context.save()
        context.globalAlpha = 1.0
        drawOutlines(context, [previewMask], width, height)
        context.restore()
      }
    }

    // Draw selection highlight
    if (selectedMaskId !== null) {
      const selectedMask = masks.find((m) => m.id === selectedMaskId)
      if (selectedMask) {
        context.strokeStyle = 'yellow'
        context.lineWidth = 2

        const pixels = selectedMask.pixels
        if (pixels.length > 0) {
          const minX = pixels.reduce((min, p) => (p.x < min ? p.x : min), Infinity)
          const minY = pixels.reduce((min, p) => (p.y < min ? p.y : min), Infinity)
          const maxX = pixels.reduce((max, p) => (p.x > max ? p.x : max), -Infinity)
          const maxY = pixels.reduce((max, p) => (p.y > max ? p.y : max), -Infinity)

          const scaleX = width / MODEL_WIDTH
          const scaleY = height / MODEL_HEIGHT

          context.strokeRect(
            minX * scaleX,
            minY * scaleY,
            (maxX - minX + 1) * scaleX,
            (maxY - minY + 1) * scaleY,
          )
        }
      }
    }

    // Draw points
    points.forEach((point) => {
      const scaledX = (point.x / MODEL_WIDTH) * width
      const scaledY = (point.y / MODEL_HEIGHT) * height
      context.beginPath()
      context.arc(scaledX, scaledY, 5, 0, 2 * Math.PI)
      context.fillStyle = point.type === 'positive' ? 'green' : 'red'
      context.fill()
    })
  }, [image, dimensions, masks, selectedMaskId, previewMask, points, isEditing, updateCanvasSize])

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!canvasRef.current || !dimensions) return

      const rect = canvasRef.current.getBoundingClientRect()
      const percentX = (e.clientX - rect.left) / rect.width
      const percentY = (e.clientY - rect.top) / rect.height

      const x = Math.floor(percentX * MODEL_WIDTH)
      const y = Math.floor(percentY * MODEL_HEIGHT)

      if (!isEditing) {
        const isOverMask = masks.some((mask) => mask.pixels.some((p) => p.x === x && p.y === y))
        canvasRef.current.style.cursor = isOverMask ? 'pointer' : 'crosshair'
      }
    },
    [masks, dimensions, isEditing],
  )

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      drawCanvas()
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [drawCanvas])

  useEffect(() => {
    drawCanvas()
  }, [drawCanvas])

  return (
    <div ref={containerRef} className="flex h-full w-full items-center justify-center">
      <canvas
        ref={canvasRef}
        onClick={onCanvasClick}
        onMouseMove={handleMouseMove}
        className="max-h-full max-w-full"
      />
    </div>
  )
}

export default SegmentationCanvas
