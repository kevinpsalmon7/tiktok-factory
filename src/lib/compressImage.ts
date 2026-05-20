/**
 * Compresses an image file in the browser using the Canvas API.
 * Converts to WebP at the given quality (0–1). Falls back to the original
 * file if WebP is not supported or if compression yields a larger file.
 *
 * @param file     The original image File (JPEG, PNG, WebP)
 * @param quality  WebP quality, 0–1. Defaults to 0.88 (good balance)
 * @param skipIfSmallerThanKB  Skip compression if the file is already smaller
 *                             than this threshold (default 200 KB)
 */
export async function compressImage(
  file: File,
  quality = 0.88,
  skipIfSmallerThanKB = 200,
): Promise<File> {
  // Skip tiny files — not worth the CPU
  if (file.size < skipIfSmallerThanKB * 1024) return file

  return new Promise((resolve) => {
    const img = new Image()
    const objectUrl = URL.createObjectURL(file)

    img.onload = () => {
      URL.revokeObjectURL(objectUrl)

      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight

      const ctx = canvas.getContext('2d')
      if (!ctx) {
        resolve(file)
        return
      }

      ctx.drawImage(img, 0, 0)

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve(file)
            return
          }
          // Only use the compressed version if it's actually smaller
          if (blob.size >= file.size) {
            resolve(file)
            return
          }
          const ext = file.name.replace(/\.[^.]+$/, '')
          resolve(new File([blob], `${ext}.webp`, { type: 'image/webp' }))
        },
        'image/webp',
        quality,
      )
    }

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      resolve(file) // fall back silently
    }

    img.src = objectUrl
  })
}
