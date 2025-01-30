import { tensor } from '@tensorflow/tfjs'
import { type InferenceSession, Tensor } from 'onnxruntime-web/webgpu'
import { MODEL_HEIGHT, MODEL_WIDTH } from './types'

export async function generateImageEmbedding(
  inferenceSession: InferenceSession,
  fileData: File,
): Promise<Tensor | null> {
  try {
    const inputImage = await createImageBitmap(fileData, {
      resizeWidth: MODEL_WIDTH,
      resizeHeight: MODEL_HEIGHT,
    })
    const resizedTensor = await Tensor.fromImage(inputImage, {
      resizedWidth: MODEL_WIDTH,
      resizedHeight: MODEL_HEIGHT,
    })
    const resizeImage = resizedTensor.toImageData()
    let imageDataTensor = await Tensor.fromImage(resizeImage)

    const tfTensor = tensor(imageDataTensor.data, imageDataTensor.dims as [number, number, number])
      .reshape([3, MODEL_HEIGHT, MODEL_WIDTH])
      .transpose([1, 2, 0])
      .mul(255)

    imageDataTensor = new Tensor(tfTensor.dataSync() as Float32Array, tfTensor.shape)

    const results = await inferenceSession.run({
      input_image: imageDataTensor,
    })

    resizedTensor.dispose()
    tfTensor.dispose()

    console.log('Embedding results:', results)

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
