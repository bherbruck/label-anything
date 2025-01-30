import React, { useState, useCallback, useRef, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { FileSelector, type FileEntry } from '@/components/file-selector'
import { Segmenter } from '@/components/segmenter'
import { MaskList } from '@/components/mask-list'
import { Toolbar } from '@/components/toolbar'
import LabelManager from './components/label-manager'
import { UnsavedChangesDialog } from '@/components/unsaved-changes-dialog'
import type { Mask, Label } from '@/lib/types'
import { isSavedMaskData, isSavedLabelData } from '@/lib/types'

const App: React.FC = () => {
  const [selectedFile, setSelectedFile] = useState<FileEntry | null>(null)
  const [directoryHandle, setDirectoryHandle] = useState<FileSystemDirectoryHandle | null>(null)
  const [masks, setMasks] = useState<Mask[]>([])
  const [labels, setLabels] = useState<Label[]>([])
  const [selectedMaskId, setSelectedMaskId] = useState<number | null>(null)
  const [selectedLabelId, setSelectedLabelId] = useState<string | null>(null)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false)
  const nextMaskId = useRef(1)
  const pendingFileSelection = useRef<FileEntry | null>(null)

  const clearMaskState = () => {
    setMasks([])
    setSelectedMaskId(null)
    nextMaskId.current = 1
    setHasUnsavedChanges(false)
  }

  // Load global labels
  const loadLabels = async () => {
    if (!directoryHandle) return

    try {
      const labelsHandle = await directoryHandle.getFileHandle('labels.json', {
        create: true,
      })
      const fileData = await labelsHandle.getFile()
      const data = await fileData.text()

      if (data) {
        const parsedData = JSON.parse(data)
        if (isSavedLabelData(parsedData)) {
          setLabels(parsedData.labels)
        }
      }
    } catch (err) {
      console.error('Error loading labels:', err)
    }
  }

  // Save global labels
  const saveLabels = async (labelsToSave: Label[] = labels) => {
    if (!directoryHandle) return

    try {
      const labelsHandle = await directoryHandle.getFileHandle('labels.json', {
        create: true,
      })
      const writable = await labelsHandle.createWritable()
      await writable.write(JSON.stringify({ labels: labelsToSave }))
      await writable.close()
    } catch (err) {
      console.error('Error saving labels:', err)
    }
  }

  // Load masks for selected file
  const loadMasksForFile = async (file: FileEntry) => {
    if (!directoryHandle) return

    clearMaskState()

    try {
      const maskFileHandle = await directoryHandle.getFileHandle(`${file.name}.masks.json`, {
        create: false,
      })
      const fileData = await maskFileHandle.getFile()
      const data = await fileData.text()
      const parsedData = JSON.parse(data)

      if (!isSavedMaskData(parsedData)) {
        console.error('Invalid mask data format')
        return
      }

      const { masks: savedMasks } = parsedData

      // Update nextMaskId to be higher than any existing mask ID
      const maxId = Math.max(...savedMasks.map((m) => m.id), 0)
      nextMaskId.current = maxId + 1

      setMasks(savedMasks)
    } catch (err) {
      // No masks file exists yet, or invalid data
      console.log('No existing masks found for', file.name)
    }
  }

  useEffect(() => {
    if (directoryHandle) {
      loadLabels()
    }
  }, [directoryHandle])

  const handleFileSelect = async (file: FileEntry) => {
    if (hasUnsavedChanges) {
      pendingFileSelection.current = file
      setShowUnsavedDialog(true)
      return
    }

    setSelectedFile(file)
    await loadMasksForFile(file)
  }

  const handleDirectorySelect = async (handle: FileSystemDirectoryHandle) => {
    setDirectoryHandle(handle)
  }

  const handleConfirmSwitch = async () => {
    setShowUnsavedDialog(false)
    if (pendingFileSelection.current) {
      setSelectedFile(pendingFileSelection.current)
      await loadMasksForFile(pendingFileSelection.current)
      pendingFileSelection.current = null
    }
  }

  const handleCancelSwitch = () => {
    setShowUnsavedDialog(false)
    pendingFileSelection.current = null
  }

  const handleMaskCreate = (maskWithoutId: Mask) => {
    // Extract all existing mask pixels
    const existingPixels = new Set<string>(
      masks.flatMap((mask) => mask.pixels.map((pixel) => `${pixel.x},${pixel.y}`)),
    )

    // Filter out overlapping pixels
    const uniquePixels = maskWithoutId.pixels.filter(
      (pixel) => !existingPixels.has(`${pixel.x},${pixel.y}`),
    )

    if (uniquePixels.length === 0) {
      // No unique pixels to add
      return
    }

    const maskWithId = {
      ...maskWithoutId,
      pixels: uniquePixels,
      id: nextMaskId.current,
      labelId: selectedLabelId ?? undefined, // Add the currently selected label
    }
    nextMaskId.current += 1

    setMasks((prev) => [...prev, maskWithId])
    setHasUnsavedChanges(true)
  }

  const handleMaskRemove = (maskId: number) => {
    setMasks((prev) => prev.filter((mask) => mask.id !== maskId))
    if (selectedMaskId === maskId) {
      setSelectedMaskId(null)
    }
    setHasUnsavedChanges(true)
  }

  const handleLabelAdd = async (name: string) => {
    const newLabel: Label = {
      id: crypto.randomUUID(),
      name,
    }
    const updatedLabels = [...labels, newLabel]
    await saveLabels(updatedLabels) // Save first
    setLabels(updatedLabels) // Then update state
    setSelectedLabelId(newLabel.id)
  }

  const handleLabelRemove = async (id: string) => {
    const updatedLabels = labels.filter((label) => label.id !== id)
    await saveLabels(updatedLabels) // Save first
    setLabels(updatedLabels) // Then update state
    if (selectedLabelId === id) {
      setSelectedLabelId(null)
    }
    // Remove label from masks that use it
    setMasks((prev) =>
      prev.map((mask) => (mask.labelId === id ? { ...mask, labelId: undefined } : mask)),
    )
    setHasUnsavedChanges(true)
  }

  const handleSaveMasks = useCallback(async () => {
    if (!selectedFile || !directoryHandle) return

    try {
      const maskFileHandle = await directoryHandle.getFileHandle(
        `${selectedFile.name}.masks.json`,
        { create: true },
      )
      const writable = await maskFileHandle.createWritable()
      await writable.write(
        JSON.stringify({
          masks,
        }),
      )
      await writable.close()
      setHasUnsavedChanges(false)

      // Update file list to show this file has masks
      selectedFile.hasMasks = true
    } catch (err) {
      console.error('Error saving masks:', err)
    }
  }, [selectedFile, masks, directoryHandle])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Delete' && selectedMaskId !== null) {
        handleMaskRemove(selectedMaskId)
      } else if (e.key === 's' && e.ctrlKey) {
        e.preventDefault()
        handleSaveMasks()
      }
    },
    [selectedMaskId, handleMaskRemove, handleSaveMasks],
  )

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden">
      <Card className="flex h-full w-full flex-col rounded-none">
        <CardHeader className="px-6 py-4">
          <CardTitle>Label Anything</CardTitle>
        </CardHeader>

        <Toolbar
          onSave={handleSaveMasks}
          hasChanges={hasUnsavedChanges}
          hasMasks={masks.length > 0}
        />

        <CardContent className="flex flex-1 flex-row gap-4 overflow-hidden p-6">
          <FileSelector
            onFileSelect={handleFileSelect}
            onDirectorySelect={handleDirectorySelect}
            selectedFileName={selectedFile?.name}
          />

          <Segmenter
            file={selectedFile?.handle ?? null}
            onMaskCreate={handleMaskCreate}
            masks={masks}
            selectedMaskId={selectedMaskId}
            onMaskSelect={setSelectedMaskId}
            selectedLabelId={selectedLabelId} // Ensure this prop is a string
          />

          <div className="flex flex-none flex-col gap-4">
            <LabelManager
              labels={labels}
              selectedLabelId={selectedLabelId}
              onLabelSelect={setSelectedLabelId}
              onLabelAdd={handleLabelAdd}
              onLabelRemove={handleLabelRemove}
            />

            <MaskList
              masks={masks}
              labels={labels}
              selectedMaskId={selectedMaskId}
              onMaskSelect={setSelectedMaskId}
              onMaskRemove={handleMaskRemove}
            />
          </div>
        </CardContent>
      </Card>

      <UnsavedChangesDialog
        isOpen={showUnsavedDialog}
        onContinue={handleConfirmSwitch}
        onCancel={handleCancelSwitch}
      />
    </div>
  )
}

export default App
