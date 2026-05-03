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

// Semantic role: what kind of content this text block holds.
// The generator (Claude) fills each role with appropriate copy.
export type TextRole = 'title' | 'subtitle' | 'text' | 'cta'

export interface BaseElement {
  id: string
  type: TemplateElementType
  x: number
  y: number
  width: number
  height: number
  opacity?: number
  zIndex: number
  slideType: string // which slide type this element belongs to (exactly one)
  locked?: boolean
}

export interface TextElement extends BaseElement {
  type: 'text'
  role: TextRole // semantic role — replaces free-form field name
  fontSize: number
  fontFamily: string
  fontWeight?: number | string
  color: string
  backgroundColor?: string
  // 'block' = bg fills the whole box. 'inline' = bg tightly hugs the text.
  bgMode?: 'block' | 'inline'
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

export interface TemplatePadding {
  top: number
  right: number
  bottom: number
  left: number
}

export interface TemplateLayout {
  width: number // canvas width (default 1080)
  height: number // canvas height (default 1920)
  backgroundColor?: string
  elements: TemplateElement[]
  // Ordered list of slide type names the carousel can use (e.g., ['title', 'content', 'cta']).
  // User-editable through the builder.
  slideTypes: string[]
  // Safe area / inner padding shown as guides in the builder (visual only).
  padding?: TemplatePadding
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
