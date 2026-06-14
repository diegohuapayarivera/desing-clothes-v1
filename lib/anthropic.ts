type Block = { type: string; text?: string }

/** Returns the text of the first text-type block in a Claude response. */
export function extractText(content: Block[]): string {
  for (const block of content) {
    if (block.type === 'text' && block.text) return block.text.trim()
  }
  return ''
}
