import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatError(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

export function preventDefault(callback: () => void) {
  return (e: { preventDefault: () => void }) => {
    e.preventDefault()
    callback()
  }
}

export function assertNonNull<T>(value: T | null | undefined, message?: string): T {
  if (value === null || value === undefined) {
    throw new Error(message ?? 'Value is null or undefined')
  }
  return value
}

export function range(start: number, end: number): number[] {
  return Array.from({ length: end - start }, (_, i) => start + i)
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
