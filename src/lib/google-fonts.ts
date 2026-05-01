// Curated list of popular Google Fonts grouped by category.
// Each entry contains the family name and the weights to load.
// We restrict to a sensible subset to keep the bundle / loaded font count under control.

export type GoogleFont = {
  family: string
  category: 'sans' | 'serif' | 'display' | 'mono' | 'handwriting'
  weights: number[]
}

export const GOOGLE_FONTS: GoogleFont[] = [
  // Sans serif
  { family: 'Inter', category: 'sans', weights: [400, 500, 600, 700, 800] },
  { family: 'Roboto', category: 'sans', weights: [400, 500, 700, 900] },
  { family: 'Open Sans', category: 'sans', weights: [400, 600, 700, 800] },
  { family: 'Poppins', category: 'sans', weights: [400, 500, 600, 700, 800] },
  { family: 'Montserrat', category: 'sans', weights: [400, 500, 600, 700, 800] },
  { family: 'Lato', category: 'sans', weights: [400, 700, 900] },
  { family: 'Nunito', category: 'sans', weights: [400, 600, 700, 800] },
  { family: 'Work Sans', category: 'sans', weights: [400, 500, 600, 700] },
  { family: 'DM Sans', category: 'sans', weights: [400, 500, 700] },
  { family: 'Manrope', category: 'sans', weights: [400, 500, 700, 800] },
  { family: 'Outfit', category: 'sans', weights: [400, 500, 700, 800] },
  { family: 'Plus Jakarta Sans', category: 'sans', weights: [400, 500, 700, 800] },
  { family: 'Space Grotesk', category: 'sans', weights: [400, 500, 700] },
  { family: 'Archivo', category: 'sans', weights: [400, 600, 700, 800] },
  { family: 'Bebas Neue', category: 'sans', weights: [400] },

  // Serif
  { family: 'Playfair Display', category: 'serif', weights: [400, 600, 700, 800, 900] },
  { family: 'Merriweather', category: 'serif', weights: [400, 700, 900] },
  { family: 'Lora', category: 'serif', weights: [400, 500, 600, 700] },
  { family: 'EB Garamond', category: 'serif', weights: [400, 500, 700] },
  { family: 'Cormorant Garamond', category: 'serif', weights: [400, 500, 700] },
  { family: 'PT Serif', category: 'serif', weights: [400, 700] },
  { family: 'DM Serif Display', category: 'serif', weights: [400] },
  { family: 'Fraunces', category: 'serif', weights: [400, 500, 700, 800, 900] },
  { family: 'Libre Caslon Display', category: 'serif', weights: [400] },

  // Display / decorative
  { family: 'Anton', category: 'display', weights: [400] },
  { family: 'Oswald', category: 'display', weights: [400, 500, 600, 700] },
  { family: 'Righteous', category: 'display', weights: [400] },
  { family: 'Abril Fatface', category: 'display', weights: [400] },
  { family: 'Archivo Black', category: 'display', weights: [400] },

  // Handwriting
  { family: 'Caveat', category: 'handwriting', weights: [400, 700] },
  { family: 'Pacifico', category: 'handwriting', weights: [400] },
  { family: 'Dancing Script', category: 'handwriting', weights: [400, 700] },
  { family: 'Permanent Marker', category: 'handwriting', weights: [400] },

  // Mono
  { family: 'JetBrains Mono', category: 'mono', weights: [400, 500, 700] },
  { family: 'Fira Code', category: 'mono', weights: [400, 500, 700] },
  { family: 'IBM Plex Mono', category: 'mono', weights: [400, 500, 700] },
]

export function getFontByFamily(family: string): GoogleFont | undefined {
  return GOOGLE_FONTS.find((f) => f.family === family)
}

/**
 * Build the Google Fonts CSS URL that loads ALL fonts in the curated list.
 * Used once at the root layout to make every font available to the builder
 * + Konva render without per-font dynamic loading.
 */
export function buildGoogleFontsHref(): string {
  const families = GOOGLE_FONTS.map((f) => {
    const wghts = f.weights.join(';')
    return `family=${encodeURIComponent(f.family)}:wght@${wghts}`
  }).join('&')
  return `https://fonts.googleapis.com/css2?${families}&display=swap`
}
