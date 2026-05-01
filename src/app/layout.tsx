import type { Metadata } from 'next'
import { Inter, Fraunces } from 'next/font/google'
import { buildGoogleFontsHref } from '@/lib/google-fonts'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
})

const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Tiktok Factory',
  description: 'Générez des carousels TikTok/Instagram en un clic',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Load the curated Google Fonts catalog so every template can use any of
  // them in the builder + the Konva render without further dynamic loading.
  const googleFontsHref = buildGoogleFontsHref()

  return (
    <html lang="fr" className={`${inter.variable} ${fraunces.variable}`}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link rel="stylesheet" href={googleFontsHref} />
      </head>
      <body className="min-h-screen">{children}</body>
    </html>
  )
}
