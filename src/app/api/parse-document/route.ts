import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

    const ext = file.name.split('.').pop()?.toLowerCase() ?? ''

    if (ext === 'md' || ext === 'txt') {
      const text = await file.text()
      return NextResponse.json({ text })
    }

    if (ext === 'pdf') {
      const bytes = await file.arrayBuffer()
      const buffer = Buffer.from(bytes)
      // Dynamic require avoids bundler issues with pdf-parse
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfParse = require('pdf-parse/lib/pdf-parse.js')
      const data = await pdfParse(buffer)
      return NextResponse.json({ text: data.text })
    }

    return NextResponse.json({ error: 'Unsupported file type' }, { status: 400 })
  } catch (e) {
    console.error('[parse-document]', e)
    return NextResponse.json({ error: 'Failed to parse document' }, { status: 500 })
  }
}
