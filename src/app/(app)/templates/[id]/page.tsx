import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { TemplateEditor } from './TemplateEditor'
import type { TemplateLayout } from '@/types/database'

type TemplateRow = {
  id: string
  name: string
  description: string
  layout: TemplateLayout
  style_guide: string
  carousel_instructions: string
  gemini_instructions: string
  avatar_instructions: string
  randomization_instructions: string
  absolute_rules: string
  platforms: string[]
}

export default async function TemplateBuilderPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: template } = await supabase
    .from('templates')
    .select('id, name, description, layout, style_guide, carousel_instructions, gemini_instructions, avatar_instructions, randomization_instructions, absolute_rules, platforms')
    .eq('id', id)
    .eq('user_id', user.id)
    .single<TemplateRow>()

  if (!template) notFound()

  return <TemplateEditor initialTemplate={template} />
}
