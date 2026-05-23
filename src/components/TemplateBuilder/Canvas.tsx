'use client'

import { Stage, Layer, Rect, Text, Image as KonvaImage, Transformer, Group, Line, Shape } from 'react-konva'
import type Konva from 'konva'
import { Fragment, useEffect, useRef, useState } from 'react'
import useImage from 'use-image'
import rough from 'roughjs'
import type {
  TemplateLayout,
  TemplateElement,
  TextElement,
  ImageElement,
  RectElement,
  TextParagraph,
  TextShadow,
} from '@/types/database'
import { computeHighlightRects } from '@/lib/highlight-utils'

type SnapLine = { type: 'v' | 'h'; pos: number }

const PARA_GAP = 6 // px gap between consecutive paragraphs

type Props = {
  layout: TemplateLayout
  selectedId: string | null
  onSelect: (id: string | null) => void
  /** Committed update — creates a new undo history entry. Use for drag/transform END. */
  onUpdate: (id: string, patch: Partial<TemplateElement>) => void
  /** Live update — overwrites the current history entry without creating a new one. Use during drag/transform. */
  onUpdateLive: (id: string, patch: Partial<TemplateElement>) => void
  activeSlideType: string
  stageWidth: number
  stageHeight: number
  snapEnabled?: boolean
  showGuides?: boolean
}

const RULER_SIZE = 22

export function BuilderCanvas({
  layout,
  selectedId,
  onSelect,
  onUpdate,
  onUpdateLive,
  activeSlideType,
  stageWidth,
  stageHeight,
  snapEnabled = false,
  showGuides = true,
}: Props) {
  const [snapLines, setSnapLines] = useState<SnapLine[]>([])
  // The stage displays rulers around the actual canvas. Compute the scale so
  // the canvas fits inside stageWidth - RULER_SIZE (the area available to the
  // design surface itself).
  const scale = (stageWidth - RULER_SIZE) / layout.width
  const canvasPxWidth = layout.width * scale
  const canvasPxHeight = layout.height * scale

  const stageRef = useRef<Konva.Stage>(null)
  const transformerRef = useRef<Konva.Transformer>(null)

  useEffect(() => {
    if (!transformerRef.current || !stageRef.current) return
    const selectedEl = layout.elements.find((e) => e.id === selectedId)
    if (selectedId && selectedEl && !selectedEl.locked) {
      const node = stageRef.current.findOne('#' + selectedId)
      if (node) {
        transformerRef.current.nodes([node])
        transformerRef.current.getLayer()?.batchDraw()
      } else {
        transformerRef.current.nodes([])
      }
    } else {
      transformerRef.current.nodes([])
    }
  }, [selectedId, layout, activeSlideType])

  // Array order IS the z-order (Photoshop-style): first = behind, last = front.
  // We no longer sort by zIndex — the layout.elements array position is truth.
  const visibleElements = layout.elements.filter(
    (el) => el.slideType === activeSlideType
  )

  // Safety net: force Konva's internal children order to match our array order.
  // react-konva is not always reliable when reordering children with the same key.
  useEffect(() => {
    if (!stageRef.current) return
    for (const el of visibleElements) {
      const node = stageRef.current.findOne('#' + el.id)
      if (node) node.moveToTop()
    }
    transformerRef.current?.moveToTop()
    stageRef.current.batchDraw()
  })

  return (
    <Stage
      ref={stageRef}
      width={stageWidth}
      height={stageHeight}
      onMouseDown={(e) => {
        if (e.target === e.target.getStage()) onSelect(null)
      }}
    >
      {/* Rulers layer — stays in stage (unscaled) coordinates */}
      <Layer listening={false}>
        <Rulers
          canvasPxWidth={canvasPxWidth}
          canvasPxHeight={canvasPxHeight}
          logicalWidth={layout.width}
          logicalHeight={layout.height}
        />
      </Layer>

      {/* Design layer — offset by ruler size, scaled to logical coordinates */}
      <Layer x={RULER_SIZE} y={RULER_SIZE} scaleX={scale} scaleY={scale}>
        <Rect
          x={0}
          y={0}
          width={layout.width}
          height={layout.height}
          fill={layout.backgroundColor || '#ffffff'}
          listening={false}
        />
        {visibleElements.map((el) => (
          <ElementNode
            key={el.id}
            element={el}
            isSelected={el.id === selectedId}
            onSelect={() => onSelect(el.id)}
            onUpdate={(patch) => onUpdate(el.id, patch)}
            onUpdateLive={(patch) => onUpdateLive(el.id, patch)}
            layout={layout}
            snapEnabled={snapEnabled}
            onSnapChange={setSnapLines}
          />
        ))}

        {/* Snap guide lines */}
        {snapLines.map((line, i) => (
          <Line
            key={i}
            points={
              line.type === 'v'
                ? [line.pos, 0, line.pos, layout.height]
                : [0, line.pos, layout.width, line.pos]
            }
            stroke="#ff3366"
            strokeWidth={1.5 / scale}
            dash={[8 / scale, 4 / scale]}
            listening={false}
          />
        ))}

        <Transformer
          ref={transformerRef}
          rotateEnabled={false}
          anchorSize={12}
          borderStroke="#0f0f0f"
          anchorStroke="#0f0f0f"
          anchorFill="#ffffff"
          enabledAnchors={[
            'top-left',
            'top-right',
            'bottom-left',
            'bottom-right',
            'middle-left',
            'middle-right',
            'top-center',
            'bottom-center',
          ]}
          boundBoxFunc={(oldBox, newBox) => {
            // No canvas clamps — boxes may extend beyond the canvas (Affinity-style).
            // Only enforce a minimum size so handles stay grabbable.
            if (newBox.width < 20 || newBox.height < 20) return oldBox
            return newBox
          }}
          onTransformEnd={() => setSnapLines([])}
        />
      </Layer>

      {/* Overlay layer — safe-area guides always on top of everything,
          regardless of element z-order or background images. */}
      {showGuides && (
        <Layer x={RULER_SIZE} y={RULER_SIZE} scaleX={scale} scaleY={scale} listening={false}>
          <SafeAreaGuides layout={layout} />
        </Layer>
      )}
    </Stage>
  )
}

function Rulers({
  canvasPxWidth,
  canvasPxHeight,
  logicalWidth,
  logicalHeight,
}: {
  canvasPxWidth: number
  canvasPxHeight: number
  logicalWidth: number
  logicalHeight: number
}) {
  // Choose a tick step in logical px so we have ~20 major ticks max.
  const stepX = tickStep(logicalWidth)
  const stepY = tickStep(logicalHeight)

  const xTicks: number[] = []
  for (let x = 0; x <= logicalWidth; x += stepX) xTicks.push(x)
  const yTicks: number[] = []
  for (let y = 0; y <= logicalHeight; y += stepY) yTicks.push(y)

  const scaleX = canvasPxWidth / logicalWidth
  const scaleY = canvasPxHeight / logicalHeight

  return (
    <>
      {/* Corner */}
      <Rect x={0} y={0} width={RULER_SIZE} height={RULER_SIZE} fill="#f5f1e8" />
      {/* Top ruler bg */}
      <Rect x={RULER_SIZE} y={0} width={canvasPxWidth} height={RULER_SIZE} fill="#f5f1e8" />
      {/* Left ruler bg */}
      <Rect x={0} y={RULER_SIZE} width={RULER_SIZE} height={canvasPxHeight} fill="#f5f1e8" />

      {/* X ticks + labels */}
      {xTicks.map((tx) => {
        const px = RULER_SIZE + tx * scaleX
        return (
          <Group key={`x_${tx}`}>
            <Line
              points={[px, RULER_SIZE - 6, px, RULER_SIZE]}
              stroke="#8a8a8a"
              strokeWidth={1}
            />
            <Text
              x={px + 2}
              y={4}
              text={String(tx)}
              fontSize={9}
              fontFamily="Inter"
              fill="#6a6a6a"
            />
          </Group>
        )
      })}

      {/* Y ticks + labels */}
      {yTicks.map((ty) => {
        const py = RULER_SIZE + ty * scaleY
        return (
          <Group key={`y_${ty}`}>
            <Line
              points={[RULER_SIZE - 6, py, RULER_SIZE, py]}
              stroke="#8a8a8a"
              strokeWidth={1}
            />
            <Text
              x={2}
              y={py + 2}
              text={String(ty)}
              fontSize={9}
              fontFamily="Inter"
              fill="#6a6a6a"
            />
          </Group>
        )
      })}
    </>
  )
}

function tickStep(total: number): number {
  // Aim for ~10-15 ticks
  const target = total / 12
  const steps = [10, 20, 50, 100, 200, 500, 1000]
  for (const s of steps) {
    if (target <= s) return s
  }
  return 1000
}

function SafeAreaGuides({ layout }: { layout: TemplateLayout }) {
  const p = layout.padding
  if (!p) return null
  const hasAny = p.top || p.right || p.bottom || p.left
  if (!hasAny) return null

  const x = p.left
  const y = p.top
  const w = layout.width - p.left - p.right
  const h = layout.height - p.top - p.bottom

  return (
    <Rect
      x={x}
      y={y}
      width={w}
      height={h}
      stroke="#a060ff"
      strokeWidth={3}
      dash={[18, 12]}
      listening={false}
    />
  )
}

function ElementNode({
  element,
  isSelected,
  onSelect,
  onUpdate,
  onUpdateLive,
  layout,
  snapEnabled,
  onSnapChange,
}: {
  element: TemplateElement
  isSelected: boolean
  onSelect: () => void
  onUpdate: (patch: Partial<TemplateElement>) => void
  onUpdateLive: (patch: Partial<TemplateElement>) => void
  layout: TemplateLayout
  snapEnabled: boolean
  onSnapChange: (lines: SnapLine[]) => void
}) {
  const locked = !!element.locked
  const common = {
    id: element.id,
    x: element.x,
    y: element.y,
    opacity: element.opacity ?? 1,
    draggable: !locked,
    listening: true,
    onMouseDown: (e: Konva.KonvaEventObject<MouseEvent>) => {
      if (locked) return
      e.cancelBubble = true
      onSelect()
    },
    onTap: locked ? undefined : onSelect,
    onDragMove: (e: Konva.KonvaEventObject<DragEvent>) => {
      const node = e.target
      // No canvas clamps — elements may extend beyond the canvas (Affinity-style).
      // The final render clips at canvas bounds naturally.
      let nx = node.x()
      let ny = node.y()
      if (snapEnabled) {
        const result = computeSnap(nx, ny, element.width, element.height, layout, element.id)
        nx = result.x
        ny = result.y
        onSnapChange(result.lines)
      }
      node.x(nx)
      node.y(ny)
      // Live update: no new history entry while dragging
      onUpdateLive({ x: Math.round(nx), y: Math.round(ny) })
    },
    onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => {
      onSnapChange([])
      const x = Math.round(e.target.x())
      const y = Math.round(e.target.y())
      // Committed update: creates one undo history entry for the whole drag
      onUpdate({ x, y })
    },
    // Reset scale every frame during transform so the element re-renders at the
    // correct logical size. Fixes text wrapping and the "two-box" visual glitch.
    onTransform: (e: Konva.KonvaEventObject<Event>) => {
      const node = e.target
      const scaleX = node.scaleX()
      const scaleY = node.scaleY()
      node.scaleX(1)
      node.scaleY(1)
      let newWidth = Math.max(20, Math.round(node.width() * scaleX))
      let newHeight = Math.max(20, Math.round(node.height() * scaleY))
      // Enforce locked aspect ratio for image elements
      if (element.type === 'image' && (element as ImageElement).aspectRatio) {
        const parts = (element as ImageElement).aspectRatio!.split(':').map(Number)
        newHeight = Math.max(20, Math.round(newWidth * parts[1] / parts[0]))
      }
      // Live update: no new history entry while resizing
      onUpdateLive({
        x: Math.round(node.x()),
        y: Math.round(node.y()),
        width: newWidth,
        height: newHeight,
      })
    },
    onTransformEnd: (e: Konva.KonvaEventObject<Event>) => {
      const node = e.target
      // Scale is already 1 after onTransform; just persist the final position.
      let newWidth = Math.max(20, Math.round(node.width()))
      let newHeight = Math.max(20, Math.round(node.height()))
      if (element.type === 'image' && (element as ImageElement).aspectRatio) {
        const parts = (element as ImageElement).aspectRatio!.split(':').map(Number)
        newHeight = Math.max(20, Math.round(newWidth * parts[1] / parts[0]))
      }
      // Committed update: creates one undo history entry for the whole resize
      onUpdate({
        x: Math.round(node.x()),
        y: Math.round(node.y()),
        width: newWidth,
        height: newHeight,
      })
    },
  }

  if (element.type === 'text') return <TextNode element={element as TextElement} common={common} isSelected={isSelected} />
  if (element.type === 'image') return <ImageNode element={element as ImageElement} common={common} isSelected={isSelected} />
  if (element.type === 'rect') return <RectNode element={element as RectElement} common={common} isSelected={isSelected} />
  return null
}

type ResolvedParagraph =
  | {
      isSeparator: true
      spacerH: number
      text: string; fontFamily: string; fontSize: number; fontWeight: number | string
      color: string; align: 'left' | 'center' | 'right'; lineHeight: number
      highlight: boolean; highlightColor: string
      shadow?: TextShadow
      strokeColor?: string
      strokeWidth?: number
    }
  | {
      isSeparator: false
      spacerH: 0
      text: string; fontFamily: string; fontSize: number; fontWeight: number | string
      color: string; align: 'left' | 'center' | 'right'; lineHeight: number
      highlight: boolean; highlightColor: string
      shadow?: TextShadow
      strokeColor?: string
      strokeWidth?: number
    }

// Resolve element.paragraphs (rich) or fall back to a single legacy paragraph.
function resolveParagraphs(element: TextElement): ResolvedParagraph[] {
  const def = {
    fontFamily: element.fontFamily,
    fontSize: element.fontSize,
    fontWeight: element.fontWeight || 400,
    color: element.color,
    align: (element.align || 'left') as 'left' | 'center' | 'right',
    lineHeight: element.lineHeight || 1.25,
  }
  const src: TextParagraph[] =
    element.paragraphs && element.paragraphs.length > 0
      ? element.paragraphs
      : [{ text: element.placeholder || roleLabel(element.role) }]
  return src.map((p) => {
    if (p.separatorHeight && p.separatorHeight > 0) {
      return {
        isSeparator: true as const,
        spacerH: p.separatorHeight,
        text: '', fontFamily: def.fontFamily, fontSize: def.fontSize, fontWeight: def.fontWeight,
        color: def.color, align: def.align, lineHeight: def.lineHeight,
        highlight: false, highlightColor: '#FFE500',
      }
    }
    return {
      isSeparator: false as const,
      spacerH: 0 as const,
      text: p.role ? roleLabel(p.role) : (p.text ?? roleLabel(element.role)),
      fontFamily: p.fontFamily ?? def.fontFamily,
      fontSize: p.fontSize ?? def.fontSize,
      fontWeight: p.fontWeight ?? def.fontWeight,
      color: p.color ?? def.color,
      align: (p.align ?? def.align) as 'left' | 'center' | 'right',
      lineHeight: p.lineHeight ?? def.lineHeight,
      highlight: p.highlight ?? false,
      highlightColor: p.highlightColor ?? '#FFE500',
      shadow: p.shadow,
      strokeColor: p.strokeColor,
      strokeWidth: p.strokeWidth,
    }
  })
}

function TextNode({
  element,
  common,
  isSelected,
}: {
  element: TextElement
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  common: any
  isSelected: boolean
}) {
  const bgMode = element.bgMode || 'block'
  const padding = element.padding || 0
  const paras = resolveParagraphs(element)

  // block mode: text inset by padding on all sides
  // inline mode: text uses full width, padding controls bg rect visual margin
  const textX = bgMode === 'block' ? padding : 0
  const textW = bgMode === 'block' ? Math.max(10, element.width - padding * 2) : element.width
  const baseTop = bgMode === 'block' ? padding : 0

  // First pass — measure each paragraph so we can shift everything according
  // to verticalAlign (top / middle / bottom). Vertical alignment positions
  // the wrapped text block within the box's height.
  const measured = paras.map((p, i) => {
    if (p.isSeparator) return { p, lines: [] as string[], lh: 0, h: p.spacerH }
    const lines = wrapText(p.text, textW, p.fontSize, p.fontFamily, p.fontWeight)
    const lh = p.lineHeight * p.fontSize
    const next = paras[i + 1]
    const gap = next && !next.isSeparator ? PARA_GAP : 0
    return { p, lines, lh, h: lines.length * lh + gap }
  })
  const contentH = measured.reduce((sum, m) => sum + m.h, 0)
  const innerH = element.height - (bgMode === 'block' ? padding * 2 : 0)
  const va = element.verticalAlign
  const slack = Math.max(0, innerH - contentH)
  const offset = va === 'middle' ? slack / 2 : va === 'bottom' ? slack : 0

  let curY = baseTop + offset
  const items = measured.map((m) => {
    const y = curY
    curY += m.h
    return { ...m, y }
  })

  return (
    <Group
      {...common}
      width={element.width}
      height={element.height}
      clipFunc={(ctx: CanvasRenderingContext2D) => {
        ctx.rect(0, 0, element.width, element.height)
      }}
    >
      {/* Hitbox */}
      <Rect
        x={0} y={0} width={element.width} height={element.height}
        fill="rgba(0,0,0,0.001)"
        stroke={isSelected ? undefined : '#cccccc'}
        strokeWidth={isSelected ? 0 : 1}
        dash={isSelected ? undefined : [4, 4]}
      />

      {/* Block background — fills whole rect */}
      {element.backgroundColor && bgMode === 'block' && (
        <Rect x={0} y={0} width={element.width} height={element.height}
          fill={element.backgroundColor} listening={false}
        />
      )}

      {/* Paragraphs */}
      {items.map(({ p, lines, lh, y }, pi) => (
        <Fragment key={pi}>
          {p.isSeparator ? null : <>
          {/* Inline bg — one rect per wrapped line, padding = visual margin */}
          {element.backgroundColor && bgMode === 'inline' && lines.map((line, li) => {
            if (!line.trim()) return null
            const w = measureTextWidth(line, p.fontSize, element.fontFamily, p.fontWeight)
            const lx = p.align === 'center' ? (textW - w) / 2
                     : p.align === 'right'  ? textW - w : 0
            const bx = Math.max(0, lx - padding)
            const bw = Math.min(element.width - bx, w + padding * 2)
            const bgPadV = Math.max(2, padding / 2)
            return (
              <Rect key={li}
                x={bx} y={y + li * lh - bgPadV}
                width={bw} height={lh + bgPadV * 2}
                fill={element.backgroundColor} cornerRadius={4} listening={false}
              />
            )
          })}
          {/* Rough highlight preview (builder only — highlights the whole placeholder text) */}
          {p.highlight && (() => {
            const previewRects = computeHighlightRects(
              lines, p.text,
              textX, y, lh,
              p.fontSize, p.fontFamily, p.fontWeight,
              p.align, textW, measureTextWidth
            )
            // In builder mode the text has no ==...== so we fake one rect across all lines
            const fallback = lines.map((line, li) => {
              if (!line.trim()) return null
              const lw = measureTextWidth(line, p.fontSize, p.fontFamily, p.fontWeight)
              const ao = p.align === 'center' ? (textW - lw) / 2 : p.align === 'right' ? textW - lw : 0
              return { x: textX + ao, y: y + li * lh, w: lw, h: lh }
            }).filter(Boolean) as {x:number;y:number;w:number;h:number}[]
            const rects = previewRects.length > 0 ? previewRects : fallback
            if (rects.length === 0) return null
            const PAD_H = 5; const PAD_V = 3
            const hlColor = p.highlightColor
            return (
              <Shape
                key="hl"
                listening={false}
                sceneFunc={(ctx) => {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const nativeCtx = (ctx as any)._context as CanvasRenderingContext2D
                  const fakeCanvas = { getContext: () => nativeCtx } as unknown as HTMLCanvasElement
                  const rc = rough.canvas(fakeCanvas)
                  for (const r of rects) {
                    rc.rectangle(
                      r.x - PAD_H, r.y - PAD_V,
                      r.w + PAD_H * 2, r.h + PAD_V * 2,
                      { fill: hlColor, fillStyle: 'solid', roughness: 2, stroke: hlColor, strokeWidth: 1 }
                    )
                  }
                }}
              />
            )
          })()}
          {/* Text */}
          <Text
            x={textX} y={y} width={textW}
            text={p.text}
            fontSize={p.fontSize}
            fontFamily={p.fontFamily}
            fontStyle={String(p.fontWeight || 400).includes('7') ? 'bold' : 'normal'}
            fill={p.color}
            align={p.align}
            lineHeight={p.lineHeight}
            verticalAlign="top"
            listening={false}
            {...(p.shadow ? {
              shadowEnabled: true,
              shadowColor: p.shadow.color,
              shadowBlur: p.shadow.blur,
              shadowOffsetX: p.shadow.offsetX,
              shadowOffsetY: p.shadow.offsetY,
              shadowOpacity: p.shadow.opacity,
            } : {})}
            {...(p.strokeColor ? {
              stroke: p.strokeColor,
              strokeWidth: p.strokeWidth ?? 2,
              strokeEnabled: true,
              fillAfterStrokeEnabled: true,
            } : {})}
          />
          </>}
        </Fragment>
      ))}
    </Group>
  )
}

// Simple word-wrap using a measuring canvas. Breaks on words; long words stay on their own line.
function wrapText(
  text: string,
  maxWidth: number,
  fontSize: number,
  fontFamily: string,
  fontWeight: number | string | undefined
): string[] {
  if (typeof document === 'undefined') return [text]
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

function roleLabel(role: string): string {
  switch (role) {
    case 'title':
      return 'Titre'
    case 'subtitle':
      return 'Sous-titre'
    case 'text':
      return 'Texte'
    default:
      return role
  }
}

function ImageNode({
  element,
  common,
  isSelected,
}: {
  element: ImageElement
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  common: any
  isSelected: boolean
}) {
  const [img] = useImage(element.assetUrl || '')
  if (element.source === 'generated' || !element.assetUrl) {
    return (
      <Group {...common} width={element.width} height={element.height}>
        <Rect
          x={0}
          y={0}
          width={element.width}
          height={element.height}
          fill="#e8e3d4"
          stroke={isSelected ? undefined : '#cccccc'}
          strokeWidth={isSelected ? 0 : 1}
          dash={isSelected ? undefined : [4, 4]}
        />
        <Text
          x={0}
          y={element.height / 2 - 24}
          width={element.width}
          text={'Image générée\n(Gemini)'}
          fontSize={36}
          fontFamily="Inter"
          fill="#3f3f3f"
          align="center"
          listening={false}
        />
      </Group>
    )
  }
  return <KonvaImage {...common} image={img} width={element.width} height={element.height} />
}

function RectNode({
  element,
  common,
  isSelected,
}: {
  element: RectElement
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  common: any
  isSelected: boolean
}) {
  return (
    <Rect
      {...common}
      width={element.width}
      height={element.height}
      fill={element.fill}
      stroke={isSelected ? (element.stroke || undefined) : (element.stroke || '#cccccc')}
      strokeWidth={isSelected ? (element.strokeWidth || 0) : Math.max(element.strokeWidth || 0, 1)}
      dash={isSelected ? undefined : [4, 4]}
      cornerRadius={element.cornerRadius || 0}
    />
  )
}

// ── Snap computation ─────────────────────────────────────────────────────────

const SNAP_THRESHOLD = 14

function computeSnap(
  x: number,
  y: number,
  w: number,
  h: number,
  layout: TemplateLayout,
  selfId: string
): { x: number; y: number; lines: SnapLine[] } {
  const CW = layout.width
  const CH = layout.height
  const p = layout.padding

  // snap: position to set element.x/y to. guide: where to draw the guideline.
  const xSnaps: { snap: number; guide: number }[] = [
    { snap: 0, guide: 0 },
    { snap: (CW - w) / 2, guide: CW / 2 },
    { snap: CW - w, guide: CW },
  ]
  if (p?.left) xSnaps.push({ snap: p.left, guide: p.left })
  if (p?.right) xSnaps.push({ snap: CW - p.right - w, guide: CW - p.right })

  const ySnaps: { snap: number; guide: number }[] = [
    { snap: 0, guide: 0 },
    { snap: (CH - h) / 2, guide: CH / 2 },
    { snap: CH - h, guide: CH },
  ]
  if (p?.top) ySnaps.push({ snap: p.top, guide: p.top })
  if (p?.bottom) ySnaps.push({ snap: CH - p.bottom - h, guide: CH - p.bottom })

  let snappedX = x
  let snappedY = y
  const lines: SnapLine[] = []

  let minXDist = SNAP_THRESHOLD
  let bestXGuide: number | null = null
  for (const { snap, guide } of xSnaps) {
    const dist = Math.abs(x - snap)
    if (dist < minXDist) {
      minXDist = dist
      snappedX = snap
      bestXGuide = guide
    }
  }
  if (bestXGuide !== null) lines.push({ type: 'v', pos: bestXGuide })

  let minYDist = SNAP_THRESHOLD
  let bestYGuide: number | null = null
  for (const { snap, guide } of ySnaps) {
    const dist = Math.abs(y - snap)
    if (dist < minYDist) {
      minYDist = dist
      snappedY = snap
      bestYGuide = guide
    }
  }
  if (bestYGuide !== null) lines.push({ type: 'h', pos: bestYGuide })

  return { x: snappedX, y: snappedY, lines }
}
