import Konva from 'konva'
import type {
  TemplateLayout,
  TemplateElement,
  TextElement,
  ImageElement,
  RectElement,
  CarouselSlide,
} from '@/types/database'

/**
 * Render a single slide off-screen using Konva and return a base64 JPEG data URL.
 * Runs in the browser. Inspired by the template builder's canvas but produces
 * a full-resolution (1080x1920) image ready to upload.
 */
export async function renderSlideToDataUrl(
  layout: TemplateLayout,
  slide: CarouselSlide,
  backgroundUrl?: string
): Promise<string> {
  // Create an off-screen container
  const container = document.createElement('div')
  container.style.position = 'absolute'
  container.style.left = '-99999px'
  container.style.top = '0'
  document.body.appendChild(container)

  const stage = new Konva.Stage({
    container,
    width: layout.width,
    height: layout.height,
  })

  const layer = new Konva.Layer({ listening: false })
  stage.add(layer)

  // Background color
  if (layout.backgroundColor) {
    layer.add(
      new Konva.Rect({
        x: 0,
        y: 0,
        width: layout.width,
        height: layout.height,
        fill: layout.backgroundColor,
        listening: false,
      })
    )
  }

  // Filter elements for this slide type
  const visible = layout.elements
    .filter(
      (el) =>
        !el.slideTypes ||
        el.slideTypes.length === 0 ||
        el.slideTypes.includes(slide.slide_type)
    )
    .sort((a, b) => a.zIndex - b.zIndex)

  // Add each element (awaiting images)
  for (const el of visible) {
    await addElement(layer, el, slide, backgroundUrl)
  }

  layer.draw()

  // Export
  const dataUrl = stage.toDataURL({
    pixelRatio: 1,
    mimeType: 'image/jpeg',
    quality: 0.92,
  })

  // Cleanup
  stage.destroy()
  document.body.removeChild(container)

  return dataUrl
}

async function addElement(
  layer: Konva.Layer,
  el: TemplateElement,
  slide: CarouselSlide,
  backgroundUrl?: string
) {
  const common = {
    x: el.x,
    y: el.y,
    rotation: el.rotation || 0,
    opacity: el.opacity ?? 1,
    listening: false,
  }

  if (el.type === 'text') {
    const t = el as TextElement
    const text =
      slide.text_fields?.[t.field] ??
      (t.placeholder || '')
    if (!text) return

    if (t.backgroundColor) {
      layer.add(
        new Konva.Rect({
          ...common,
          width: t.width,
          height: t.height,
          fill: t.backgroundColor,
        })
      )
    }
    layer.add(
      new Konva.Text({
        ...common,
        x: t.x + (t.padding || 0),
        y: t.y + (t.padding || 0),
        width: t.width - (t.padding || 0) * 2,
        height: t.height - (t.padding || 0) * 2,
        text,
        fontSize: t.fontSize,
        fontFamily: t.fontFamily,
        fontStyle: String(t.fontWeight || 400).includes('7') ? 'bold' : 'normal',
        fill: t.color,
        align: t.align || 'left',
        lineHeight: t.lineHeight || 1,
        verticalAlign: 'top',
      })
    )
    return
  }

  if (el.type === 'image') {
    const i = el as ImageElement
    const src = i.source === 'generated' ? backgroundUrl : i.assetUrl
    if (!src) return

    const img = await loadImage(src)
    layer.add(
      new Konva.Image({
        ...common,
        image: img,
        width: i.width,
        height: i.height,
      })
    )
    return
  }

  if (el.type === 'rect') {
    const r = el as RectElement
    layer.add(
      new Konva.Rect({
        ...common,
        width: r.width,
        height: r.height,
        fill: r.fill,
        stroke: r.stroke,
        strokeWidth: r.strokeWidth || 0,
        cornerRadius: r.cornerRadius || 0,
      })
    )
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

/**
 * Wait for all fonts referenced by the layout to load before rendering.
 * Without this, Konva renders with fallback fonts.
 */
export async function ensureFontsLoaded(layout: TemplateLayout): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return
  const fonts = new Set<string>()
  for (const el of layout.elements) {
    if (el.type === 'text') {
      const t = el as TextElement
      fonts.add(`${t.fontSize}px ${t.fontFamily}`)
      fonts.add(`bold ${t.fontSize}px ${t.fontFamily}`)
    }
  }
  try {
    await Promise.all([...fonts].map((f) => document.fonts.load(f)))
    await document.fonts.ready
  } catch {
    // Ignore font loading errors — Konva falls back to system fonts
  }
}
