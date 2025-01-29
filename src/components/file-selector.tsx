import React, { useState, useRef, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { FolderOpen, Circle } from 'lucide-react'
import { useVirtualizer } from '@tanstack/react-virtual'

export interface FileEntry {
  handle: FileSystemFileHandle
  name: string
  thumbnail?: ImageBitmap
  hasMasks: boolean
}

interface FileSelectorProps {
  onFileSelect: (file: FileEntry) => void
  onDirectorySelect: (handle: FileSystemDirectoryHandle) => void
  selectedFileName?: string
  accept?: string[]
}

const ITEM_SIZE = 40 // Height of each item in pixels

export const FileSelector: React.FC<FileSelectorProps> = ({
  onFileSelect,
  onDirectorySelect,
  selectedFileName,
  accept = ['.jpg', '.jpeg', '.png', '.gif', '.webp'],
}) => {
  const [files, setFiles] = useState<(FileEntry | null)[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isProcessingFiles, setIsProcessingFiles] = useState(false)
  const [processedCount, setProcessedCount] = useState(0)
  const [totalFiles, setTotalFiles] = useState(0)

  const parentRef = useRef<HTMLDivElement>(null)
  const fileEntriesRef = useRef<FileSystemFileHandle[]>([])
  const dirHandleRef = useRef<FileSystemDirectoryHandle | null>(null)
  const processingChunksRef = useRef<Set<number>>(new Set())

  const rowVirtualizer = useVirtualizer({
    count: files.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ITEM_SIZE,
    overscan: 5,
  })

  const generateThumbnail = async (file: File): Promise<ImageBitmap> => {
    return createImageBitmap(file, {
      resizeWidth: 32,
      resizeHeight: 32,
    })
  }

  const checkForMasks = async (dirHandle: FileSystemDirectoryHandle, fileName: string) => {
    try {
      await dirHandle.getFileHandle(`${fileName}.masks.json`)
      return true
    } catch {
      return false
    }
  }

  const processFileChunk = async (startIdx: number, endIdx: number) => {
    if (!dirHandleRef.current || fileEntriesRef.current.length === 0) return

    // Skip if this chunk is already being processed
    const chunkId = Math.floor(startIdx / 20)
    if (processingChunksRef.current.has(chunkId)) return
    processingChunksRef.current.add(chunkId)

    const chunk = fileEntriesRef.current.slice(startIdx, endIdx)
    const processedEntries: (FileEntry | null)[] = []

    for (const entry of chunk) {
      try {
        const file = await entry.getFile()
        const thumbnail = await generateThumbnail(file)
        const hasMasks = await checkForMasks(dirHandleRef.current, entry.name)

        processedEntries.push({
          handle: entry,
          name: entry.name,
          thumbnail,
          hasMasks,
        })

        setProcessedCount((prev) => prev + 1)
      } catch (error) {
        console.error(`Error processing file ${entry.name}:`, error)
        processedEntries.push(null)
      }
    }

    setFiles((prevFiles) => {
      const newFiles = [...prevFiles]
      processedEntries.forEach((entry, index) => {
        newFiles[startIdx + index] = entry
      })
      return newFiles
    })

    processingChunksRef.current.delete(chunkId)
  }

  // Handle visible range changes
  useEffect(() => {
    if (!isProcessingFiles) return

    const { range } = rowVirtualizer
    if (!range) return
    const startChunk = Math.floor(range.startIndex / 20) * 20
    const endChunk = Math.min(Math.ceil(range.endIndex / 20) * 20, fileEntriesRef.current.length)

    // Process any unloaded chunks in the visible range
    for (let i = startChunk; i < endChunk; i += 20) {
      if (!files[i]) {
        processFileChunk(i, i + 20)
      }
    }
  }, [rowVirtualizer.range, isProcessingFiles, files])

  const handleSelectDirectory = async () => {
    try {
      setIsLoading(true)
      const dirHandle = await window.showDirectoryPicker({
        mode: 'readwrite',
      })

      dirHandleRef.current = dirHandle
      onDirectorySelect(dirHandle)

      // Reset state
      processingChunksRef.current.clear()

      // Collect all file entries
      const imageEntries: FileSystemFileHandle[] = []
      for await (const entry of dirHandle.values()) {
        if (entry.kind === 'file' && entry.name.match(new RegExp(`(${accept.join('|')})$`, 'i'))) {
          imageEntries.push(entry)
        }
      }

      // Sort entries by name
      imageEntries.sort((a, b) => a.name.localeCompare(b.name))
      fileEntriesRef.current = imageEntries
      setTotalFiles(imageEntries.length)

      // Create placeholder entries
      setFiles(new Array(imageEntries.length).fill(null))
      setProcessedCount(0)
      setIsProcessingFiles(true)

      // Process first chunk immediately
      await processFileChunk(0, 20)
    } catch (err) {
      console.error('Error accessing directory:', err)
    } finally {
      setIsLoading(false)
    }
  }

  // Calculate total list height
  const totalHeight = rowVirtualizer.getTotalSize()

  // Get items to render
  const virtualItems = rowVirtualizer.getVirtualItems()

  return (
    <Card className="w-[200px] flex-none overflow-hidden">
      <CardContent className="flex h-full flex-col gap-2 p-4">
        <Button
          variant="outline"
          size="sm"
          onClick={handleSelectDirectory}
          className="w-full"
          disabled={isLoading}
        >
          {isLoading ? (
            <>
              <Circle className="mr-2 h-4 w-4 animate-spin" />
              Loading...
            </>
          ) : (
            <>
              <FolderOpen className="mr-2 h-4 w-4" />
              Select Folder
            </>
          )}
        </Button>

        {isProcessingFiles && (
          <div className="text-muted-foreground px-2 text-xs">
            Processing: {processedCount}/{totalFiles} files
          </div>
        )}

        <div ref={parentRef} className="flex-1 overflow-y-auto">
          <div
            style={{
              height: totalHeight,
              width: '100%',
              position: 'relative',
            }}
          >
            {virtualItems.map((virtualItem) => {
              const file = files[virtualItem.index]
              return (
                <div
                  key={virtualItem.key}
                  data-index={virtualItem.index}
                  ref={rowVirtualizer.measureElement}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    transform: `translateY(${virtualItem.start}px)`,
                  }}
                >
                  {file ? (
                    <button
                      onClick={() => onFileSelect(file)}
                      className={`group hover:bg-accent hover:text-accent-foreground flex w-full cursor-pointer items-center gap-2 rounded-md p-1 text-left text-sm transition-colors ${
                        selectedFileName === file.name ? 'bg-accent text-accent-foreground' : ''
                      }`}
                    >
                      {file.thumbnail && (
                        <div className="relative">
                          <canvas
                            width={32}
                            height={32}
                            className="rounded"
                            ref={(canvas) => {
                              if (canvas) {
                                const ctx = canvas.getContext('2d')
                                if (ctx && file.thumbnail) {
                                  ctx.drawImage(file.thumbnail, 0, 0, 32, 32)
                                }
                              }
                            }}
                          />
                          {file.hasMasks && (
                            <div className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-blue-500" />
                          )}
                        </div>
                      )}
                      <span className="truncate">{file.name}</span>
                    </button>
                  ) : (
                    <div className="flex h-full items-center gap-2 p-1">
                      <div className="bg-muted h-8 w-8 animate-pulse rounded" />
                      <div className="bg-muted h-4 w-24 animate-pulse rounded" />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
