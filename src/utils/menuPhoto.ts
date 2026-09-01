import { supabase } from '../config/supabase'

const BUCKET = 'menu-photos'
const MAX_EDGE = 1200
const JPEG_QUALITY = 0.82

/**
 * Phone cameras hand us 4000px, 5MB files. Menu photos render at ~520px wide
 * in the customizer, so we downscale before upload — otherwise every order
 * page pull drags multi-megabyte images over cell service.
 */
async function downscale(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(MAX_EDGE / bitmap.width, MAX_EDGE / bitmap.height, 1)
  const w = Math.round(bitmap.width * scale)
  const h = Math.round(bitmap.height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas not available')
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close?.()

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      b => (b ? resolve(b) : reject(new Error('Could not process that image'))),
      'image/jpeg',
      JPEG_QUALITY
    )
  })
}

export async function uploadMenuPhoto(menuItemId: string, file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('That file is not an image')

  const blob = await downscale(file)
  // Cache-busting path so a replaced photo shows up immediately instead of
  // serving the CDN's copy of the old one.
  const path = `${menuItemId}/${Date.now()}.jpg`

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, { contentType: 'image/jpeg', upsert: true })
  if (error) throw error

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return data.publicUrl
}

export async function removeMenuPhoto(imageUrl: string): Promise<void> {
  const marker = `/${BUCKET}/`
  const idx = imageUrl.indexOf(marker)
  if (idx === -1) return
  const path = imageUrl.slice(idx + marker.length)
  await supabase.storage.from(BUCKET).remove([path])
}
