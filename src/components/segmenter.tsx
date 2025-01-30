import React, { useEffect, useRef, useState, useCallback } from 'react'
import { Card } from '@/components/ui/card'
import * as ort from 'onnxruntime-web'
import * as tf from '@tensorflow/tfjs'
import { ImageSize, Mask, MaskPixel, MODEL_WIDTH, MODEL_HEIGHT, Point } from '@/lib/types'
import { useOnnxSession } from '@/hooks/use-onnx-session'
import SegmentationCanvas from './segmentation-canvas'
import { Loader2 } from 'lucide-react'

interface SegmenterProps {
  file: FileSystemFileHandle | null
  onMaskCreate: (mask: Mask) => void
  masks: Mask[]
  selectedMaskId: number | null
  onMaskSelect: (id: number | null) => void
  selectedLabelId: string | null
}

const useSegmenterSessions = () => {
  const encoder = useOnnxSession('../assets/models/mobilesam.encoder.onnx')
  const decoder = useOnnxSession('../assets/models/mobilesam.decoder.quant.onnx')

  return {
    encoderSession: encoder.session,
    decoderSession: decoder.session,
    isLoading: encoder.isLoading || decoder.isLoading,
    error: encoder.error || decoder.error,
  }
}

export const Segmenter: React.FC<SegmenterProps> = ({
  file,
  onMaskCreate,
  masks,
  selectedMaskId,
  onMaskSelect,
}) => {
  const {
    encoderSession,
    decoderSession,
    isLoading: modelsLoading,
    error: modelsError,
  } = useSegmenterSessions()
  const [image, setImage] = useState<ImageBitmap | null>(null)
  const [imageEmbedding, setImageEmbedding] = useState<ort.Tensor | null>(null)
  const [dimensions, setDimensions] = useState<ImageSize | null>(null)
  const [isGeneratingEmbedding, setIsGeneratingEmbedding] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [currentPoints, setCurrentPoints] = useState<Point[]>([])
  const [previewMask, setPreviewMask] = useState<Mask | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const previousFileRef = useRef<FileSystemFileHandle | null>(null)

  const clearCurrentPoints = () => {
    setCurrentPoints([])
    setPreviewMask(null)
  }

  const calculateDimensions = (imageWidth: number, imageHeight: number): ImageSize | null => {
    if (!containerRef.current) return null

    const containerRect = containerRef.current.getBoundingClientRect()
    const containerWidth = containerRect.width
    const containerHeight = containerRect.height

    const aspectRatio = imageWidth / imageHeight
    let finalWidth = containerWidth
    let finalHeight = containerWidth / aspectRatio

    if (finalHeight > containerHeight) {
      finalHeight = containerHeight
      finalWidth = containerHeight * aspectRatio
    }

    return {
      width: Math.floor(finalWidth),
      height: Math.floor(finalHeight),
    }
  }

  const generateEmbedding = async (fileData: File): Promise<ort.Tensor | null> => {
    if (!encoderSession) return null

    try {
      const inputImage = await createImageBitmap(fileData, {
        resizeWidth: MODEL_WIDTH,
        resizeHeight: MODEL_HEIGHT,
      })
      const resizedTensor = await ort.Tensor.fromImage(inputImage, {
        resizedWidth: MODEL_WIDTH,
        resizedHeight: MODEL_HEIGHT,
      })
      const resizeImage = resizedTensor.toImageData()
      let imageDataTensor = await ort.Tensor.fromImage(resizeImage)
      const tfTensor = tf
        .tensor(imageDataTensor.data, imageDataTensor.dims as [number, number, number])
        .reshape([3, MODEL_HEIGHT, MODEL_WIDTH])
        .transpose([1, 2, 0])
        .mul(255)

      // @ts-expect-error
      imageDataTensor = new ort.Tensor(tfTensor.dataSync(), tfTensor.shape)

      ort.env.wasm.numThreads = 1
      const results = await encoderSession.run({
        input_image: imageDataTensor,
      })

      resizedTensor.dispose()
      tfTensor.dispose()

      return results.image_embeddings
    } catch (error) {
      console.error('Error generating embedding:', error)
      return null
    }
  }

  useEffect(() => {
    clearCurrentPoints()
    const loadImage = async () => {
      if (!file || !encoderSession || file === previousFileRef.current) return

      setIsLoading(true)
      try {
        const fileData = await file.getFile()
        const loadedImage = await createImageBitmap(fileData)
        setImage(loadedImage)

        const dims = calculateDimensions(loadedImage.width, loadedImage.height)
        if (!dims) return
        setDimensions(dims)

        setIsGeneratingEmbedding(true)
        const embedding = await generateEmbedding(fileData)
        if (embedding) {
          setImageEmbedding(embedding)
        }
      } catch (error) {
        console.error('Error loading image:', error)
      } finally {
        setIsGeneratingEmbedding(false)
        setIsLoading(false)
        previousFileRef.current = file
      }
    }

    loadImage()

    return () => {
      previousFileRef.current = null
    }
  }, [file, encoderSession])

  const handleCanvasClick = async (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (
      !decoderSession ||
      !imageEmbedding ||
      !dimensions ||
      !image ||
      !file ||
      isGeneratingEmbedding ||
      isLoading
    )
      return

    const canvas = e.currentTarget
    const rect = canvas.getBoundingClientRect()
    const percentX = (e.clientX - rect.left) / rect.width
    const percentY = (e.clientY - rect.top) / rect.height

    const x = Math.floor(percentX * MODEL_WIDTH)
    const y = Math.floor(percentY * MODEL_HEIGHT)

    if (!isEditing) {
      const clickedMasks = masks.filter((mask) => mask.pixels.some((p) => p.x === x && p.y === y))
      if (clickedMasks.length > 0) {
        onMaskSelect(clickedMasks[0].id)
        return
      }

      onMaskSelect(null)
      setIsEditing(true)
    }

    const isShiftPressed = e.shiftKey
    const type = isShiftPressed ? 'negative' : 'positive'

    const newPoint: Point = { x, y, type }
    const updatedPoints = [...currentPoints, newPoint]
    setCurrentPoints(updatedPoints)

    await handlePointsSend(updatedPoints)
  }

  const handlePointsSend = async (points: Point[]) => {
    if (!decoderSession || !imageEmbedding || !dimensions || !image || !file) return

    try {
      const flatCoords = points.flatMap((point) => [point.x, point.y])
      const pointCoords = new ort.Tensor(new Float32Array([...flatCoords, 0, 0]), [
        1,
        points.length + 1,
        2,
      ])
      const pointLabels = new ort.Tensor(
        new Float32Array([...points.map((point) => (point.type === 'positive' ? 1 : 0)), -1]),
        [1, points.length + 1],
      )

      const results = await decoderSession.run({
        image_embeddings: imageEmbedding,
        point_coords: pointCoords,
        point_labels: pointLabels,
        mask_input: new ort.Tensor(new Float32Array(256 * 256), [1, 1, 256, 256]),
        has_mask_input: new ort.Tensor(new Float32Array([0]), [1]),
        orig_im_size: new ort.Tensor(new Float32Array([MODEL_HEIGHT, MODEL_WIDTH]), [2]),
      })

      const maskImageData = results.masks.toImageData()
      const threshold = 0.5
      const data = maskImageData.data
      const maskPixels: MaskPixel[] = []

      for (let i = 0; i < MODEL_WIDTH * MODEL_HEIGHT; i++) {
        if (data[i * 4] / 255 > threshold) {
          maskPixels.push({
            x: i % MODEL_WIDTH,
            y: Math.floor(i / MODEL_WIDTH),
          })
        }
      }

      if (maskPixels.length > 0) {
        setPreviewMask({
          id: -1,
          color: [
            Math.floor(Math.random() * 256),
            Math.floor(Math.random() * 256),
            Math.floor(Math.random() * 256),
          ],
          pixels: maskPixels,
        })
      } else {
        setPreviewMask(null)
      }

      pointCoords.dispose()
      pointLabels.dispose()
    } catch (error) {
      console.error('Error processing points:', error)
    }
  }

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Enter' && isEditing) {
        setIsEditing(false)
        if (currentPoints.length > 0 && previewMask) {
          onMaskCreate({
            id: -1,
            color: previewMask.color,
            pixels: previewMask.pixels,
          })
          setCurrentPoints([])
          setPreviewMask(null)
        }
      } else if (e.key === 'Escape' && isEditing) {
        setIsEditing(false)
        clearCurrentPoints()
      }
    },
    [currentPoints, isEditing, onMaskCreate, previewMask],
  )

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  return (
    <Card
      ref={containerRef}
      className="relative flex h-full w-full flex-1 items-center justify-center overflow-hidden"
    >
      {modelsError ? (
        <p className="text-destructive text-sm">Error loading models: {modelsError.message}</p>
      ) : image ? (
        <>
          <SegmentationCanvas
            image={image}
            dimensions={dimensions}
            masks={masks}
            selectedMaskId={selectedMaskId}
            isEditing={isEditing}
            onCanvasClick={handleCanvasClick}
            previewMask={previewMask}
            points={currentPoints}
          />
          {(isGeneratingEmbedding || isLoading || modelsLoading) && (
            <div className="bg-background/50 absolute inset-0 flex items-center justify-center backdrop-blur-sm">
              <div className="bg-background flex flex-col items-center gap-2 rounded-lg p-4 shadow-lg">
                <Loader2 className="h-6 w-6 animate-spin" />
                <span className="text-sm">
                  {modelsLoading
                    ? 'Loading models...'
                    : isGeneratingEmbedding
                      ? 'Generating embedding...'
                      : 'Loading image...'}
                </span>
              </div>
            </div>
          )}
        </>
      ) : (
        <p className="text-muted-foreground text-sm">Select an image to begin</p>
      )}
    </Card>
  )
}

export default Segmenter
