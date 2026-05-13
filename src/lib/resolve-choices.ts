/**
 * Resolves [[option1 | option2 (30%) | option3]] markers in instruction text.
 *
 * Rules:
 * - Options are separated by |
 * - An option can carry an optional weight: "label (40%)"
 * - Options without an explicit weight share the remaining probability equally
 * - If no weights at all, each option has equal probability
 * - The weight notation is stripped from the output — the LLM only sees the clean label
 *
 * Examples:
 *   [[red | blue | green]]                    → equal 33% each
 *   [[Type 1 (50%) | Type 2 (30%) | Type 3]]  → 50/30/20
 *   [[Type 1 (50%) | Type 2 (50%)]]           → 50/50
 */
export function resolveChoices(text: string): string {
  return text.replace(/\[\[([^\]]+)\]\]/g, (_match, raw: string) => {
    const options = raw.split('|').map(s => s.trim()).filter(Boolean)
    if (options.length === 0) return ''
    if (options.length === 1) {
      return options[0].replace(/\s*\(\d+(?:\.\d+)?%\)\s*$/, '').trim()
    }

    // Parse label + optional weight
    const parsed = options.map(opt => {
      const m = opt.match(/^(.*?)\s*\((\d+(?:\.\d+)?)%\)\s*$/)
      if (m) return { label: m[1].trim(), weight: parseFloat(m[2]) }
      return { label: opt, weight: null as number | null }
    })

    // Distribute remaining weight equally among unweighted options
    const explicitTotal = parsed.reduce((sum, p) => sum + (p.weight ?? 0), 0)
    const unweightedCount = parsed.filter(p => p.weight === null).length
    const defaultWeight = unweightedCount > 0
      ? Math.max(0, 100 - explicitTotal) / unweightedCount
      : 0

    const weights = parsed.map(p => p.weight ?? defaultWeight)
    const total = weights.reduce((a, b) => a + b, 0)
    if (total <= 0) return parsed[0].label

    // Weighted random pick
    let rand = Math.random() * total
    for (let i = 0; i < parsed.length; i++) {
      rand -= weights[i]
      if (rand <= 0) return parsed[i].label
    }
    return parsed[parsed.length - 1].label
  })
}
