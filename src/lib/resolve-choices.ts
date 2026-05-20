/**
 * Mulberry32-based seeded PRNG. Same seed → same sequence.
 * Used to "freeze" resolveChoices across a batch so all N carousels share
 * identical resolved instructions (prerequisite for Anthropic prompt caching).
 */
export function makeSeededRandom(seed: string): () => number {
  // FNV-1a hash → 32-bit unsigned int
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 16777619)
  }
  let s = h >>> 0
  return () => {
    s = (s + 0x6D2B79F5) >>> 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

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
 *
 * `rand` lets callers inject a seeded PRNG (see makeSeededRandom) so the same
 * input produces the same output across multiple calls within a batch.
 */
export function resolveChoices(text: string, rand: () => number = Math.random): string {
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
    let r = rand() * total
    for (let i = 0; i < parsed.length; i++) {
      r -= weights[i]
      if (r <= 0) return parsed[i].label
    }
    return parsed[parsed.length - 1].label
  })
}
