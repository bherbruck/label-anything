import * as ort from 'onnxruntime-web'
import * as tf from '@tensorflow/tfjs'
import { MODEL_WIDTH, MODEL_HEIGHT } from './types'

export async function generateImageEmbedding(
  encoderSession: ort.InferenceSession,
  fileData: File,
): Promise<ort.Tensor | null> {
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

export function calculateImageDimensions(
  imageWidth: number,
  imageHeight: number,
  containerWidth: number,
  containerHeight: number,
): { width: number; height: number } {
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