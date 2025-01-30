import { Label, Mask, isSavedLabelData, isSavedMaskData } from './types'

export async function loadLabelsFromDirectory(
  directoryHandle: FileSystemDirectoryHandle,
): Promise<Label[]> {
  try {
    const labelsHandle = await directoryHandle.getFileHandle('labels.json', {
      create: true,
    })
    const fileData = await labelsHandle.getFile()
    const data = await fileData.text()

    if (data) {
      const parsedData = JSON.parse(data)
      if (isSavedLabelData(parsedData)) {
        return parsedData.labels
      }
    }
  } catch (err) {
    console.error('Error loading labels:', err)
  }
  return []
}

export async function saveLabelsToDirectory(
  directoryHandle: FileSystemDirectoryHandle,
  labels: Label[],
): Promise<void> {
  try {
    const labelsHandle = await directoryHandle.getFileHandle('labels.json', {
      create: true,
    })
    const writable = await labelsHandle.createWritable()
    await writable.write(JSON.stringify({ labels }))
    await writable.close()
  } catch (err) {
    console.error('Error saving labels:', err)
    throw err
  }
}

export async function loadMasksFromFile(
  directoryHandle: FileSystemDirectoryHandle,
  fileName: string,
): Promise<Mask[]> {
  try {
    const maskFileHandle = await directoryHandle.getFileHandle(`${fileName}.masks.json`, {
      create: false,
    })
    const fileData = await maskFileHandle.getFile()
    const data = await fileData.text()
    const parsedData = JSON.parse(data)

    if (!isSavedMaskData(parsedData)) {
      console.error('Invalid mask data format')
      return []
    }

    return parsedData.masks
  } catch (err) {
    // No masks file exists yet, or invalid data
    console.log('No existing masks found for', fileName)
    return []
  }
}

export async function saveMasksToFile(
  directoryHandle: FileSystemDirectoryHandle,
  fileName: string,
  masks: Mask[],
): Promise<void> {
  try {
    const maskFileHandle = await directoryHandle.getFileHandle(`${fileName}.masks.json`, {
      create: true,
    })
    const writable = await maskFileHandle.createWritable()
    await writable.write(JSON.stringify({ masks }))
    await writable.close()
  } catch (err) {
    console.error('Error saving masks:', err)
    throw err
  }
}
