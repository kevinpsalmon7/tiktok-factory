/**
 * Detect the "It's not X. It's Y." oppositional two-sentence construction
 * (and all its variants in English/French) in generated text.
 *
 * Strategy: short, conservative regex set targeting the most common forms.
 * The patterns deliberately require:
 *   - A negation contraction or "not" / "n'est pas" at the START of the first sentence
 *   - A sentence boundary (period, question mark, exclamation, comma + space)
 *   - An affirmative re-statement with the same subject right after
 * False positives are acceptable for the retry mechanism (the LLM will produce
 * a different output the next attempt) — false negatives are the real problem.
 */

const PATTERNS: { name: string; re: RegExp }[] = [
  // English — "It's not X. It's Y." / "It isn't X. It's Y." / "It wasn't X. It was Y."
  { name: "It's not X. It's Y.", re: /\bIt['’]?s\s+(?:not|just\s+not)\b[^.!?]{2,80}[.!?]\s+It['’]?s\b/i },
  { name: "It isn't X. It is Y.", re: /\bIt\s+isn['’]?t\b[^.!?]{2,80}[.!?]\s+It\s+(?:is\b|['’]s\b)/i },
  { name: "It wasn't X. It was Y.", re: /\bIt\s+wasn['’]?t\b[^.!?]{2,80}[.!?]\s+It\s+was\b/i },
  { name: "It's not about X. It's about Y.", re: /\bIt['’]?s\s+not\s+about\b[^.!?]{2,80}[.!?]\s+It['’]?s\s+about\b/i },

  // English — "This isn't X. This is Y."
  { name: "This is(n't) X. This is Y.", re: /\bThis\s+(?:isn['’]?t|is\s+not)\b[^.!?]{2,80}[.!?]\s+This\s+is\b/i },
  { name: "That's not X. That's Y.", re: /\bThat['’]?s\s+not\b[^.!?]{2,80}[.!?]\s+That['’]?s\b/i },

  // English — "You're not X. You're Y." / "You aren't X. You are Y." / "You don't X. You Y."
  { name: "You're not X. You're Y.", re: /\bYou['’]?re\s+not\b[^.!?]{2,80}[.!?]\s+You['’]?re\b/i },
  { name: "You aren't X. You are Y.", re: /\bYou\s+aren['’]?t\b[^.!?]{2,80}[.!?]\s+You\s+(?:are\b|['’]re\b)/i },
  { name: "You don't X. You Y.", re: /\bYou\s+don['’]?t\b[^.!?]{2,80}[.!?]\s+You\b/i },

  // English — "I'm not X. I'm Y."
  { name: "I'm not X. I'm Y.", re: /\bI['’]?m\s+not\b[^.!?]{2,80}[.!?]\s+I['’]?m\b/i },

  // English — "Not X. (Just) Y." standalone two-word/three-word lazy form
  { name: "Not X. Just Y.", re: /(?:^|[.!?]\s+)Not\s+[^.!?]{2,60}[.!?]\s+(?:Just\s+|It['’]?s\s+|That['’]?s\s+|This\s+is\s+)/i },

  // French — "Ce n'est pas X. C'est Y." / "Ce n'est pas X, c'est Y." / "Ce n'est pas X mais Y."
  { name: "Ce n'est pas X. C'est Y.", re: /\bCe\s+n['’]?est\s+pas\b[^.!?,]{2,120}[.!?,]\s*C['’]?est\b/i },
  { name: "Ce n'est pas X mais Y.", re: /\bCe\s+n['’]?est\s+pas\b[^.!?]{2,120}\bmais\b/i },
  { name: "Ce n'est pas une question de X.", re: /\bCe\s+n['’]?est\s+pas\s+une\s+question\s+de\b[^.!?]{2,120}[.!?]\s+C['’]?est\b/i },

  // French — "Tu n'es pas X. Tu es Y."
  { name: "Tu n'es pas X. Tu es Y.", re: /\bTu\s+n['’]?es\s+pas\b[^.!?]{2,100}[.!?]\s+Tu\s+es\b/i },
  { name: "Vous n'êtes pas X. Vous êtes Y.", re: /\bVous\s+n['’]?[eê]tes\s+pas\b[^.!?]{2,100}[.!?]\s+Vous\s+[eê]tes\b/i },

  // French — "Pas X. (Juste|C'est) Y."
  { name: "Pas X. Juste Y.", re: /(?:^|[.!?]\s+)Pas\s+[^.!?]{2,60}[.!?]\s+(?:Juste\s+|C['’]?est\s+)/i },
]

export type ForbiddenHit = {
  location: string
  pattern: string
  snippet: string
}

/**
 * Scan every text_field of every slide for forbidden oppositional patterns.
 * Returns the list of hits — each one identifies WHERE the violation is and
 * which pattern matched, so the retry prompt can be specific.
 */
export function findForbiddenPatterns(
  slides: { index?: number; slide_type: string; text_fields: Record<string, string> }[]
): ForbiddenHit[] {
  const hits: ForbiddenHit[] = []
  for (const slide of slides) {
    const tf = slide.text_fields ?? {}
    for (const [role, raw] of Object.entries(tf)) {
      const value = String(raw ?? '')
      if (!value) continue
      for (const p of PATTERNS) {
        const m = value.match(p.re)
        if (m) {
          hits.push({
            location: `slide ${slide.index ?? '?'} (${slide.slide_type}) role "${role}"`,
            pattern: p.name,
            snippet: m[0].length > 100 ? m[0].slice(0, 100) + '…' : m[0],
          })
          // One hit per field is enough for the retry to target it
          break
        }
      }
    }
  }
  return hits
}
