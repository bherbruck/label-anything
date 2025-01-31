import React, { useEffect, useRef, useState, useCallback } from 'react'
import { Card } from '@/components/ui/card'
import { useOnnxSession } from '@/hooks/use-onnx-session'
import { useUndoRedo } from '@/hooks/use-undo-redo'
import { ImageSize, Mask, MODEL_WIDTH, MODEL_HEIGHT, Point } from '@/lib/types'
import { calculateImageDimensions, generateImageEmbedding } from '@/lib/image-utils'
import { generateMaskFromPoints, generateRandomColor } from '@/lib/mask-utils'
import { formatError } from '@/lib/utils'
import SegmentationCanvas from './segmentation-canvas'
import { Loader2 } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import * as ort from 'onnxruntime-web/webgpu'

interface SegmenterProps {
  file: FileSystemFileHandle | null
  onMaskCreate: (mask: Mask) => void
  masks: Mask[]
  selectedMaskId: number | null
  onMaskSelect: (id: number | null) => void
  selectedLabelId: string | null
}

const encoderUrl = `${import.meta.env.BASE_URL}models/mobilesam.encoder.onnx`
const decoderUrl = `${import.meta.env.BASE_URL}models/mobilesam.decoder.quant.onnx`

export const Segmenter: React.FC<SegmenterProps> = ({
  file,
  onMaskCreate,
  masks,
  selectedMaskId,
  onMaskSelect,
}) => {
  const [image, setImage] = useState<ImageBitmap | null>(null)
  const [imageEmbedding, setImageEmbedding] = useState<ort.Tensor | null>(null)
  const [dimensions, setDimensions] = useState<ImageSize | null>(null)
  const [isGeneratingEmbedding, setIsGeneratingEmbedding] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const {
    state: currentPoints,
    set: setCurrentPoints,
    undo,
    redo,
    clear: clearPointHistory,
    canUndo,
    canRedo,
  } = useUndoRedo<Point>([])
  const [previewMask, setPreviewMask] = useState<Mask | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const previousFileRef = useRef<FileSystemFileHandle | null>(null)
  const [previousMaskTensor, setPreviousMaskTensor] = useState<ort.Tensor | null>(null)

  const decoderSession = useOnnxSession(decoderUrl)
  const { toast } = useToast()

  const clearCurrentPoints = () => {
    clearPointHistory()
    setPreviewMask(null)
    setPreviousMaskTensor(null)
  }

  useEffect(() => {
    const loadImage = async () => {
      if (!file || file === previousFileRef.current) return

      setIsLoading(true)
      try {
        const fileData = await file.getFile()
        const loadedImage = await createImageBitmap(fileData)
        setImage(loadedImage)

        if (!containerRef.current) return
        const containerRect = containerRef.current.getBoundingClientRect()
        const dims = calculateImageDimensions(
          loadedImage.width,
          loadedImage.height,
          containerRect.width,
          containerRect.height,
        )
        setDimensions(dims)

        // Generate embedding
        setIsGeneratingEmbedding(true)
        const inferenceSession = await ort.InferenceSession.create(encoderUrl, {
          executionProviders: ['webgpu'],
        })
        const embedding = await generateImageEmbedding(inferenceSession, fileData)
        if (embedding) {
          setImageEmbedding(embedding)
        }
      } catch (error) {
        console.error('Error loading image:', error)
        toast({
          title: 'Error',
          description: formatError(error),
          variant: 'destructive',
        })
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
  }, [file])

  const handleCanvasClick = async (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!imageEmbedding || !dimensions || !image || !file || isGeneratingEmbedding || isLoading)
      return

    const canvas = e.currentTarget
    const rect = canvas.getBoundingClientRect()
    const percentX = (e.clientX - rect.left) / rect.width
    const percentY = (e.clientY - rect.top) / rect.height

    const x = Math.floor(percentX * MODEL_WIDTH)
    const y = Math.floor(percentY * MODEL_HEIGHT)

    if (!isEditing) {
      // Handle mask selection when not in edit mode
      const clickedMasks = masks.filter((mask) => mask.pixels.some((p) => p.x === x && p.y === y))
      if (clickedMasks.length > 0) {
        onMaskSelect(clickedMasks[0].id)
        return
      }

      onMaskSelect(null)
      setIsEditing(true)
    }

    // Handle adding points when in edit mode
    const isShiftPressed = e.shiftKey
    const type = isShiftPressed ? 'negative' : 'positive'

    const newPoint: Point = { x, y, type }
    setCurrentPoints([...currentPoints, newPoint])

    // Update preview mask
    await handlePointsSend([...currentPoints, newPoint])
  }

  const handlePointsSend = async (points: Point[]) => {
    if (!decoderSession || !imageEmbedding || !dimensions || !image || !file) return

    try {
      const { maskTensor, maskPixels } = await generateMaskFromPoints(
        decoderSession,
        imageEmbedding,
        points,
        previousMaskTensor,
      )

      setPreviousMaskTensor(maskTensor)

      // Update preview mask
      if (maskPixels.length > 0) {
        setPreviewMask((prev) => ({
          id: -1, // Temporary ID
          // Keep the same color if we already have a preview mask
          color: prev?.color || generateRandomColor(),
          pixels: maskPixels,
        }))
      } else {
        setPreviewMask(null)
      }
    } catch (error) {
      console.error('Error processing points:', error)
      toast({
        title: 'Error',
        description: formatError(error),
        variant: 'destructive',
      })
    }
  }

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Enter' && isEditing) {
        setIsEditing(false)
        if (currentPoints.length > 0 && previewMask) {
          onMaskCreate({
            id: -1, // Will be assigned by App
            color: previewMask.color,
            pixels: previewMask.pixels,
          })
          clearCurrentPoints()
        }
      } else if (e.key === 'Escape') {
        if (isEditing) {
          setIsEditing(false)
          clearCurrentPoints()
        } else {
          onMaskSelect(null)
        }
      } else if (e.key === 'z' && (e.ctrlKey || e.metaKey) && !e.shiftKey && isEditing) {
        e.preventDefault()
        if (canUndo) {
          undo()
        }
      } else if (
        (e.key === 'y' && (e.ctrlKey || e.metaKey)) ||
        (e.key === 'z' && (e.ctrlKey || e.metaKey) && e.shiftKey)
      ) {
        e.preventDefault()
        if (canRedo) {
          redo()
        }
      }
    },
    [currentPoints, isEditing, onMaskCreate, previewMask, canUndo, canRedo, undo, redo],
  )

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  // Update preview mask when points change due to undo/redo
  useEffect(() => {
    if (isEditing && currentPoints.length > 0) {
      handlePointsSend(currentPoints)
    }
  }, [currentPoints])

  return (
    <Card
      ref={containerRef}
      className="relative flex h-full w-full flex-1 items-center justify-center overflow-hidden p-4"
    >
      {image ? (
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
          {(isGeneratingEmbedding || isLoading) && (
            <div className="bg-background/50 absolute inset-0 flex items-center justify-center backdrop-blur-sm">
              <div className="bg-background flex flex-col items-center gap-2 rounded-lg p-4 shadow-lg">
                {isGeneratingEmbedding || isLoading ? (
                  <>
                    <Loader2 className="h-6 w-6 animate-spin" />
                    <span className="text-sm">
                      {isGeneratingEmbedding ? 'Generating embedding...' : 'Loading image...'}
                    </span>
                  </>
                ) : null}
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
