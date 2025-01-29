import { useEffect, useState } from 'react'
import { InferenceSession } from 'onnxruntime-web'

export const useOnnxSession = (
  uri: string,
  options?: InferenceSession.SessionOptions,
) => {
  const [session, setSession] = useState<InferenceSession | null>(null)

  useEffect(() => {
    InferenceSession.create(uri, options).then((session) => setSession(session))
  }, [uri])

  return session
}
