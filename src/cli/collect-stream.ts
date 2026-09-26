import type { ChatChunk, Usage } from "../types";

export interface StreamText {
  answer: string;
  reasoning: string;
  usage?: Usage;
}

export async function collectStreamText(
  stream: AsyncIterable<ChatChunk>,
  onContent?: (text: string) => void,
): Promise<StreamText> {
  let answer = "";
  let reasoning = "";
  let usage: Usage | undefined;
  for await (const chunk of stream) {
    if (chunk.delta.reasoningContent) reasoning += chunk.delta.reasoningContent;
    if (chunk.delta.content) {
      answer += chunk.delta.content;
      onContent?.(chunk.delta.content);
    }
    if (chunk.usage) usage = chunk.usage;
  }
  return { answer, reasoning, usage };
}
