import { useEffect } from 'react'

/**
 * Lock body scroll while a modal is open. Restores the previous overflow value
 * on unmount or when `locked` flips back to false. Multiple simultaneous locks
 * are coordinated via a shared counter so the body doesn't unlock prematurely
 * when one modal closes while another is still open.
 */
let lockCount = 0
let savedOverflow = ''

export function useBodyScrollLock(locked: boolean) {
  useEffect(() => {
    if (!locked) return
    if (lockCount === 0) {
      savedOverflow = document.body.style.overflow
      document.body.style.overflow = 'hidden'
    }
    lockCount += 1
    return () => {
      lockCount -= 1
      if (lockCount === 0) {
        document.body.style.overflow = savedOverflow
      }
    }
  }, [locked])
}
