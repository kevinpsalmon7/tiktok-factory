export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          email: string | null
          full_name: string | null
          avatar_url: string | null
          anthropic_api_key: string | null
          gemini_api_key: string | null
          master_instructions: string
          avatar_instructions: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email?: string | null
          full_name?: string | null
          avatar_url?: string | null
          anthropic_api_key?: string | null
          gemini_api_key?: string | null
          master_instructions?: string
          avatar_instructions?: string
        }
        Update: {
          email?: string | null
          full_name?: string | null
          avatar_url?: string | null
          anthropic_api_key?: string | null
          gemini_api_key?: string | null
          master_instructions?: string
          avatar_instructions?: string
        }
      }
      templates: {
        Row: {
          id: string
          user_id: string
          name: string
          description: string
          layout: TemplateLayout
          style_guide: string
          carousel_instructions: string
          gemini_instructions: string
          platforms: string[]
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          description?: string
          layout?: TemplateLayout
          style_guide?: string
          carousel_instructions?: string
          gemini_instructions?: string
          platforms?: string[]
        }
        Update: {
          name?: string
          description?: string
          layout?: TemplateLayout
          style_guide?: string
          carousel_instructions?: string
          gemini_instructions?: string
          platforms?: string[]
        }
      }
      template_references: {
        Row: {
          id: string
          template_id: string
          user_id: string
          storage_path: string
          position: number
          created_at: string
        }
        Insert: {
          id?: string
          template_id: string
          user_id: string
          storage_path: string
          position?: number
        }
        Update: {
          storage_path?: string
          position?: number
        }
      }
      carousels: {
        Row: {
          id: string
          user_id: string
          template_id: string | null
          prompt: string
          carousel_type: string
          status: 'pending' | 'generating' | 'completed' | 'failed'
          slides: CarouselSlide[]
          error_message: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          template_id?: string | null
          prompt?: string
          carousel_type?: string
          status?: 'pending' | 'generating' | 'completed' | 'failed'
          slides?: CarouselSlide[]
          error_message?: string | null
        }
        Update: {
          template_id?: string | null
          prompt?: string
          carousel_type?: string
          status?: 'pending' | 'generating' | 'completed' | 'failed'
          slides?: CarouselSlide[]
          error_message?: string | null
        }
      }
    }
  }
}

// ── Template layout types ──────────────────────────────────────────────────

export type TemplateElementType = 'text' | 'image' | 'rect'

export interface BaseElement {
  id: string
  type: TemplateElementType
  x: number
  y: number
  width: number
  height: number
  rotation?: number
  opacity?: number
  zIndex: number
  slideTypes?: string[] // which slide_types this element applies to (e.g., ['title', 'content'])
}

export interface TextElement extends BaseElement {
  type: 'text'
  field: string // field name in slide data (e.g., 'heading_text', 'body_text')
  fontSize: number
  fontFamily: string
  fontWeight?: number | string
  color: string
  backgroundColor?: string
  align?: 'left' | 'center' | 'right'
  padding?: number
  lineHeight?: number
  placeholder?: string // shown in builder preview
}

export interface ImageElement extends BaseElement {
  type: 'image'
  source: 'generated' | 'asset' // Gemini-generated or fixed asset URL
  assetUrl?: string
  fit?: 'cover' | 'contain'
}

export interface RectElement extends BaseElement {
  type: 'rect'
  fill: string
  stroke?: string
  strokeWidth?: number
  cornerRadius?: number
}

export type TemplateElement = TextElement | ImageElement | RectElement

export interface TemplateLayout {
  width: number // canvas width (default 1080)
  height: number // canvas height (default 1920)
  backgroundColor?: string
  elements: TemplateElement[]
}

// ── Carousel slide types ──────────────────────────────────────────────────

export interface CarouselSlide {
  index: number
  slide_type: string // 'title', 'content', 'cta', or any custom
  text_fields: Record<string, string>
  illustration_prompt?: string
  rendered_url?: string // Supabase Storage URL after render
  background_url?: string // Gemini-generated bg image URL
}
