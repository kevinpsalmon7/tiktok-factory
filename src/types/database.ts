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
          openai_api_key: string | null
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
          openai_api_key?: string | null
        }
        Update: {
          email?: string | null
          full_name?: string | null
          avatar_url?: string | null
          anthropic_api_key?: string | null
          gemini_api_key?: string | null
          openai_api_key?: string | null
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
      template_pages: {
        Row: {
          id: string
          template_id: string
          user_id: string
          storage_path: string
          summary: string
          is_default: boolean
          position: number
          created_at: string
        }
        Insert: {
          id?: string
          template_id: string
          user_id: string
          storage_path: string
          summary?: string
          is_default?: boolean
          position?: number
        }
        Update: {
          summary?: string
          is_default?: boolean
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
export type TextRole = 'title' | 'subtitle' | 'text'

/** Drop-shadow applied behind a text paragraph. */
export type TextShadow = {
  color: string
  offsetX: number
  offsetY: number
  blur: number
  opacity: number
}

export type TextParagraph = {
  role?: TextRole
  text?: string
  fontFamily?: string
  fontSize?: number
  fontWeight?: number | string
  color?: string
  align?: 'left' | 'center' | 'right'
  lineHeight?: number
  /** When true, the AI wraps key words in ==...== markers for rough highlighting */
  highlight?: boolean
  /** Highlight fill color (default #FFE500) */
  highlightColor?: string
  /** Optional drop-shadow behind the rendered text. */
  shadow?: TextShadow
  /** Optional text stroke (outline). Color string e.g. '#ffffff' */
  strokeColor?: string
  /** Stroke width in canvas pixels (only applied when strokeColor is set). */
  strokeWidth?: number
  /**
   * When set (> 0), this paragraph is a pure vertical spacer — no text is
   * rendered. The value is the height in canvas pixels.
   */
  separatorHeight?: number
}

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
  placeholder?: string // shown in builder preview (legacy — use paragraphs instead)
  paragraphs?: TextParagraph[] // per-paragraph rich styling
  /**
   * Vertical alignment of the text block within the box (t.y .. t.y+t.height).
   * Independent of growDirection: when set, overrides where the text sits.
   * - 'top'    → text aligned to the top edge of the box
   * - 'middle' → text centered vertically inside the box
   * - 'bottom' → text aligned to the bottom edge of the box
   */
  verticalAlign?: 'top' | 'middle' | 'bottom'
  // Which edge is the anchor when the box auto-resizes to fit content:
  // 'down'  → top edge fixed, box grows downward
  // 'up'    → bottom edge fixed, box grows upward
  // 'both'  → center fixed, box grows equally up and down (default)
  growDirection?: 'down' | 'up' | 'both'
}

export interface ImageElement extends BaseElement {
  type: 'image'
  source: 'generated' | 'asset' | 'pages' | 'backgrounds' // AI-generated, fixed asset URL, book page, or template background
  assetUrl?: string
  fit?: 'cover' | 'contain'
  // Locked aspect ratio for this image (e.g. '1:1', '16:9', '9:16', '3:2', '4:3').
  // When set, resizing via handles enforces this ratio.
  aspectRatio?: string
}

export interface TemplatePage {
  id: string
  template_id: string
  user_id: string
  storage_path: string
  summary: string
  is_default: boolean
  position: number
  created_at: string
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
  // Min/max number of "content" slides to generate (enforced in the LLM prompt).
  // Defaults to { min: 5, max: 8 } when not set.
  contentSlideRange?: { min: number; max: number }
  /**
   * How images from the Backgrounds library are distributed across slides when
   * an image element uses source='backgrounds':
   * - 'all'           → one random image used on every slide (default)
   * - 'each'          → a different random image per individual slide
   * - 'title-content' → one image for title slides, another for content slides
   */
  backgroundsMode?: 'all' | 'each' | 'title-content'
  /**
   * How the book page is selected when source='pages':
   * - 'semantic'    → (default) page selected AFTER text gen, based on content relevance
   * - 'random-first' → page picked randomly BEFORE text gen; its summary is injected
   *                    into the prompt so Claude writes the title to match the page
   */
  pagesMode?: 'semantic' | 'random-first'
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
