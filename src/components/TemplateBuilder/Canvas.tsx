'use client'

import { Stage, Layer, Rect, Text, Image as KonvaImage, Transformer, Group, Line } from 'react-konva'
import type Konva from 'konva'
import { useEffect, useRef, useState } from 'react'
import useImage from 'use-image'
import type {
  TemplateLayout,
  TemplateElement,
  TextElement,
  ImageElement,
  RectElement,
} from '@/types/database'

type SnapLine = { type: 'v' | 'h'; pos: number }

type Props = {
  layout: TemplateLayout
  selectedId: string | null
  onSelect: (id: string | null) => void
  onUpdate: (id: string, patch: Partial<TemplateElement>) => void
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
            if (newBox.width < 20 || newBox.height < 20) return oldBox
            if (!snapEnabled) return newBox

            // boundBoxFunc coordinates are in the layer's local space = logical px
            const T = SNAP_THRESHOLD
            const CW = layout.width
            const CH = layout.height
            const p = layout.padding
            const eps = 0.5

            let { x, y, width, height } = newBox
            const lines: SnapLine[] = []

            const leftMoved = Math.abs(x - oldBox.x) > eps
            const rightMoved = Math.abs((x + width) - (oldBox.x + oldBox.width)) > eps
            const topMoved = Math.abs(y - oldBox.y) > eps
            const bottomMoved = Math.abs((y + height) - (oldBox.y + oldBox.height)) > eps

            // Left edge snap
            if (leftMoved && !rightMoved) {
              const targets = [0, ...(p?.left ? [p.left] : [])]
              for (const t of targets) {
                if (Math.abs(x - t) < T) {
                  width = width + (x - t)
                  x = t
                  lines.push({ type: 'v', pos: t })
                  break
                }
              }
            }
            // Right edge snap
            if (rightMoved && !leftMoved) {
              const right = x + width
              const targets = [CW, ...(p?.right ? [CW - p.right] : [])]
              for (const t of targets) {
                if (Math.abs(right - t) < T) {
                  width = t - x
                  lines.push({ type: 'v', pos: t })
                  break
                }
              }
            }
            // Top edge snap
            if (topMoved && !bottomMoved) {
              const targets = [0, ...(p?.top ? [p.top] : [])]
              for (const t of targets) {
                if (Math.abs(y - t) < T) {
                  height = height + (y - t)
                  y = t
                  lines.push({ type: 'h', pos: t })
                  break
                }
              }
            }
            // Bottom edge snap
            if (bottomMoved && !topMoved) {
              const bottom = y + height
              const targets = [CH, ...(p?.bottom ? [CH - p.bottom] : [])]
              for (const t of targets) {
                if (Math.abs(bottom - t) < T) {
                  height = t - y
                  lines.push({ type: 'h', pos: t })
                  break
                }
              }
            }

            setSnapLines(lines)
            if (width < 20 || height < 20) return oldBox
            return { ...newBox, x, y, width, height }
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
  layout,
  snapEnabled,
  onSnapChange,
}: {
  element: TemplateElement
  isSelected: boolean
  onSelect: () => void
  onUpdate: (patch: Partial<TemplateElement>) => void
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
      if (!snapEnabled) return
      const node = e.target
      const result = computeSnap(
        node.x(), node.y(),
        element.width, element.height,
        layout, element.id
      )
      node.x(result.x)
      node.y(result.y)
      onSnapChange(result.lines)
    },
    onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => {
      onSnapChange([])
      onUpdate({ x: Math.round(e.target.x()), y: Math.round(e.target.y()) })
    },
    onTransformEnd: (e: Konva.KonvaEventObject<Event>) => {
      const node = e.target
      const scaleX = node.scaleX()
      const scaleY = node.scaleY()
      node.scaleX(1)
      node.scaleY(1)
      onUpdate({
        x: Math.round(node.x()),
        y: Math.round(node.y()),
        width: Math.max(20, Math.round(node.width() * scaleX)),
        height: Math.max(20, Math.round(node.height() * scaleY)),
      })
    },
  }

  if (element.type === 'text') return <TextNode element={element as TextElement} common={common} isSelected={isSelected} />
  if (element.type === 'image') return <ImageNode element={element as ImageElement} common={common} isSelected={isSelected} />
  if (element.type === 'rect') return <RectNode element={element as RectElement} common={common} isSelected={isSelected} />
  return null
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
  const text = element.placeholder || roleLabel(element.role)

  return (
    <Group {...common} width={element.width} height={element.height}>
      {/* Hitbox: transparent-filled Rect covering the full element so the
          Group picks up mouse events even when the real bg / text are
          listening={false}. Also doubles as the visual outline when not selected. */}
      <Rect
        x={0}
        y={0}
        width={element.width}
        height={element.height}
        fill="rgba(0,0,0,0.001)"
        stroke={isSelected ? undefined : '#cccccc'}
        strokeWidth={isSelected ? 0 : 1}
        dash={isSelected ? undefined : [4, 4]}
      />
      

      {/* Block background — fills whole rect */}
      {element.backgroundColor && bgMode === 'block' && (
        <Rect
          x={0}
          y={0}
          width={element.width}
          height={element.height}
          fill={element.backgroundColor}
          listening={false}
        />
      )}

      {/* Inline background — measured to hug the text per line */}
      {element.backgroundColor && bgMode === 'inline' && (
        <InlineTextBackground element={element} text={text} />
      )}

      <Text
        x={element.padding || 0}
        y={element.padding || 0}
        width={element.width - (element.padding || 0) * 2}
        height={element.height - (element.padding || 0) * 2}
        text={text}
        fontSize={element.fontSize}
        fontFamily={element.fontFamily}
        fontStyle={String(element.fontWeight || 400).includes('7') ? 'bold' : 'normal'}
        fill={element.color}
        align={element.align || 'left'}
        lineHeight={element.lineHeight || 1}
        verticalAlign="top"
        listening={false}
      />
    </Group>
  )
}

function InlineTextBackground({ element, text }: { element: TextElement; text: string }) {
  // Use a hidden Konva.Text helper to measure each line's width.
  // We do this at render time via a ref hack: we render one Rect per line,
  // but first we need the per-line wrapping. Konva handles wrapping internally
  // so we rely on its getTextWidth + line splitting approximation.
  // For simplicity here we draw a single rect sized to the measured text size.
  // Komva does not expose per-line metrics easily from the consumer side without
  // creating a Text node. We create one with the same props using a ref-callback.
  const padding = element.padding || 0
  const availableWidth = element.width - padding * 2

  // Konva's Text auto-wraps by width — we approximate inline bg by measuring
  // each wrapped line via an offscreen canvas context.
  const lines = wrapText(
    text,
    availableWidth,
    element.fontSize,
    element.fontFamily,
    element.fontWeight
  )
  const lineHeight = (element.lineHeight || 1) * element.fontSize

  return (
    <>
      {lines.map((line, i) => {
        if (!line.trim()) return null
        const w = measureTextWidth(line, element.fontSize, element.fontFamily, element.fontWeight)
        // Alignment
        let xOffset = padding
        if (element.align === 'center') xOffset = padding + (availableWidth - w) / 2
        else if (element.align === 'right') xOffset = padding + (availableWidth - w)
        return (
          <Rect
            key={i}
            x={xOffset - 6}
            y={padding + i * lineHeight - 2}
            width={w + 12}
            height={lineHeight + 4}
            fill={element.backgroundColor}
            cornerRadius={4}
            listening={false}
          />
        )
      })}
    </>
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
    case 'cta':
      return 'CTA'
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
