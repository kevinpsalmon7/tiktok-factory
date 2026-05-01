'use client'

import { Stage, Layer, Rect, Text, Image as KonvaImage, Transformer, Group } from 'react-konva'
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

type Props = {
  layout: TemplateLayout
  selectedId: string | null
  onSelect: (id: string | null) => void
  onUpdate: (id: string, patch: Partial<TemplateElement>) => void
  activeSlideType: string
  stageWidth: number
  stageHeight: number
}

export function BuilderCanvas({
  layout,
  selectedId,
  onSelect,
  onUpdate,
  activeSlideType,
  stageWidth,
  stageHeight,
}: Props) {
  const scale = stageWidth / layout.width

  const stageRef = useRef<Konva.Stage>(null)
  const transformerRef = useRef<Konva.Transformer>(null)

  useEffect(() => {
    if (!transformerRef.current || !stageRef.current) return
    if (selectedId) {
      const node = stageRef.current.findOne('#' + selectedId)
      if (node) {
        transformerRef.current.nodes([node])
        transformerRef.current.getLayer()?.batchDraw()
      }
    } else {
      transformerRef.current.nodes([])
    }
  }, [selectedId, layout])

  const visibleElements = [...layout.elements]
    .filter((el) => !el.slideTypes || el.slideTypes.length === 0 || el.slideTypes.includes(activeSlideType))
    .sort((a, b) => a.zIndex - b.zIndex)

  return (
    <Stage
      ref={stageRef}
      width={stageWidth}
      height={stageHeight}
      scaleX={scale}
      scaleY={scale}
      onMouseDown={(e) => {
        if (e.target === e.target.getStage()) onSelect(null)
      }}
      className="bg-white shadow-card rounded-2xl"
    >
      <Layer>
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
          />
        ))}
        <Transformer
          ref={transformerRef}
          rotateEnabled
          anchorSize={10}
          borderStroke="#0f0f0f"
          anchorStroke="#0f0f0f"
          anchorFill="#ffffff"
          boundBoxFunc={(oldBox, newBox) => {
            if (newBox.width < 20 || newBox.height < 20) return oldBox
            return newBox
          }}
        />
      </Layer>
    </Stage>
  )
}

function ElementNode({
  element,
  isSelected,
  onSelect,
  onUpdate,
}: {
  element: TemplateElement
  isSelected: boolean
  onSelect: () => void
  onUpdate: (patch: Partial<TemplateElement>) => void
}) {
  const common = {
    id: element.id,
    x: element.x,
    y: element.y,
    rotation: element.rotation || 0,
    opacity: element.opacity ?? 1,
    draggable: true,
    onClick: onSelect,
    onTap: onSelect,
    onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => {
      onUpdate({ x: e.target.x(), y: e.target.y() })
    },
    onTransformEnd: (e: Konva.KonvaEventObject<Event>) => {
      const node = e.target
      const scaleX = node.scaleX()
      const scaleY = node.scaleY()
      node.scaleX(1)
      node.scaleY(1)
      onUpdate({
        x: node.x(),
        y: node.y(),
        width: Math.max(20, node.width() * scaleX),
        height: Math.max(20, node.height() * scaleY),
        rotation: node.rotation(),
      })
    },
  }

  if (element.type === 'text') return <TextNode element={element as TextElement} common={common} />
  if (element.type === 'image') return <ImageNode element={element as ImageElement} common={common} />
  if (element.type === 'rect') return <RectNode element={element as RectElement} common={common} />
  return null
}

function TextNode({
  element,
  common,
}: {
  element: TextElement
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  common: any
}) {
  return (
    <Group {...common} width={element.width} height={element.height}>
      {element.backgroundColor && (
        <Rect
          x={0}
          y={0}
          width={element.width}
          height={element.height}
          fill={element.backgroundColor}
          listening={false}
        />
      )}
      <Text
        x={element.padding || 0}
        y={element.padding || 0}
        width={element.width - (element.padding || 0) * 2}
        height={element.height - (element.padding || 0) * 2}
        text={element.placeholder || `{{${element.field}}}`}
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

function ImageNode({
  element,
  common,
}: {
  element: ImageElement
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  common: any
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
          listening={false}
        />
        <Text
          x={0}
          y={element.height / 2 - 20}
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
}: {
  element: RectElement
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  common: any
}) {
  return (
    <Rect
      {...common}
      width={element.width}
      height={element.height}
      fill={element.fill}
      stroke={element.stroke}
      strokeWidth={element.strokeWidth || 0}
      cornerRadius={element.cornerRadius || 0}
    />
  )
}
