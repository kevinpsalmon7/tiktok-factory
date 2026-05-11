/**
 * Randomization disabled — [[...]] markers are stripped and the text is returned as-is.
 * (strip the markers so the LLM doesn't see raw [[...]] syntax)
 */
export function resolveChoices(text: string): string {
  // Remove [[...]] markers entirely, leaving the text unchanged
  return text.replace(/\[\[[^\]]+\]\]/g, '')
}
