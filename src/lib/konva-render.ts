import Konva from 'konva'
import type {
  TemplateLayout,
  TemplateElement,
  TextElement,
  ImageElement,
  RectElement,
  CarouselSlide,
  TextRole,
} from '@/types/database'

export async function renderSlideToDataUrl(
  layout: TemplateLayout,
  slide: CarouselSlide,
  backgroundUrl?: string
): Promise<string> {
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

  // Only elements belonging to THIS slide type
  const visible = layout.elements
    .filter((el) => el.slideType === slide.slide_type)
    .sort((a, b) => a.zIndex - b.zIndex)

  for (const el of visible) {
    await addElement(layer, el, slide, backgroundUrl)
  }

  layer.draw()

  const dataUrl = stage.toDataURL({
    pixelRatio: 1,
    mimeType: 'image/jpeg',
    quality: 0.92,
  })

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
    opacity: el.opacity ?? 1,
    listening: false,
  }

  if (el.type === 'text') {
    const t = el as TextElement
    const text = slide.text_fields?.[t.role] ?? t.placeholder ?? ''
    if (!text) return

    const padding = t.padding || 0
    const availableWidth = t.width - padding * 2
    const bgMode = t.bgMode || 'block'

    // Draw background FIRST
    if (t.backgroundColor) {
      if (bgMode === 'block') {
        layer.add(
          new Konva.Rect({
            ...common,
            width: t.width,
            height: t.height,
            fill: t.backgroundColor,
          })
        )
      } else {
        // Inline: per-line rects tight around each wrapped line
        const lines = wrapText(text, availableWidth, t.fontSize, t.fontFamily, t.fontWeight)
        const lineHeight = (t.lineHeight || 1) * t.fontSize
        lines.forEach((line, i) => {
          if (!line.trim()) return
          const w = measureTextWidth(line, t.fontSize, t.fontFamily, t.fontWeight)
          let xOffset = padding
          if (t.align === 'center') xOffset = padding + (availableWidth - w) / 2
          else if (t.align === 'right') xOffset = padding + (availableWidth - w)
          layer.add(
            new Konva.Rect({
              x: t.x + xOffset - 6,
              y: t.y + padding + i * lineHeight - 2,
              width: w + 12,
              height: lineHeight + 4,
              fill: t.backgroundColor,
              cornerRadius: 4,
              opacity: t.opacity ?? 1,
              listening: false,
            })
          )
        })
      }
    }

    // Draw text
    layer.add(
      new Konva.Text({
        ...common,
        x: t.x + padding,
        y: t.y + padding,
        width: availableWidth,
        height: t.height - padding * 2,
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
    // ignore
  }
}

// ── Text measurement / wrap helpers (shared with the builder canvas) ──────

let measureCtx: CanvasRenderingContext2D | null = null
function measureTextWidth(
  text: string,
  fontSize: number,
  fontFamily: string,
  fontWeight: number | string | undefined
): number {
  if (typeof document === 'undefined') return 0
  if (!measureCtx) {
    const canvas = document.createElement('canvas')
    measureCtx = canvas.getContext('2d')
  }
  if (!measureCtx) return 0
  const isBold = String(fontWeight || 400).includes('7')
  measureCtx.font = `${isBold ? 'bold ' : ''}${fontSize}px "${fontFamily}", sans-serif`
  return measureCtx.measureText(text).width
}

function wrapText(
  text: string,
  maxWidth: number,
  fontSize: number,
  fontFamily: string,
  fontWeight: number | string | undefined
): string[] {
  const lines: string[] = []
  const paragraphs = text.split('\n')
  for (const para of paragraphs) {
    const words = para.split(' ')
    let current = ''
    for (const word of words) {
      const candidate = current ? current + ' ' + word : word
      const w = measureTextWidth(candidate, fontSize, fontFamily, fontWeight)
      if (w <= maxWidth || !current) {
        current = candidate
      } else {
        lines.push(current)
        current = word
      }
    }
    lines.push(current)
  }
  return lines
}

// Re-export for consumers that might want it
export type { TextRole }
