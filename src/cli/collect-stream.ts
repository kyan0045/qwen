import type { ChatChunk } from "../types";

export interface StreamText {
  answer: string;
  reasoning: string;
}

export async function collectStreamText(
  stream: AsyncIterable<ChatChunk>,
  onContent?: (text: string) => void,
): Promise<StreamText> {
  let answer = "";
  let reasoning = "";
  for await (const chunk of stream) {
    if (chunk.delta.reasoningContent) reasoning += chunk.delta.reasoningContent;
    if (chunk.delta.content) {
      answer += chunk.delta.content;
      onContent?.(chunk.delta.content);
    }
  }
  return { answer, reasoning };
}
