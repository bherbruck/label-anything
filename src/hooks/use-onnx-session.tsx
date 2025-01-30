import { useEffect, useState } from 'react'
import * as ort from 'onnxruntime-web'

export const useOnnxSession = (modelPath: string) => {
  const [session, setSession] = useState<ort.InferenceSession | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const initSession = async () => {
      try {
        setIsLoading(true)
        // Dynamic import of the model
        const modelModule = await import(modelPath)
        const session = await ort.InferenceSession.create(modelModule.default)
        setSession(session)
        setError(null)
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to load ONNX session'))
        setSession(null)
      } finally {
        setIsLoading(false)
      }
    }

    initSession()

    return () => {
      if (session) {
        session.release()
      }
    }
  }, [modelPath])

  return { session, error, isLoading }
}
