import { describe, expect, it } from "vitest";
import { buildChatBody, parseChatResponse } from "../../src/providers/openai-compat";
import type { ChatRequest } from "../../src/types";

describe("buildChatBody", () => {
  it("maps the core fields to wire names", () => {
    const req: ChatRequest = {
      model: "qwen3-32b",
      messages: [{ role: "user", content: "hi" }],
      temperature: 0.5,
      topP: 0.9,
      maxTokens: 128,
      stop: ["\n\n"],
    };
    const body = buildChatBody(req);
    expect(body.model).toBe("qwen3-32b");
    expect(body.temperature).toBe(0.5);
    expect(body.top_p).toBe(0.9);
    expect(body.max_tokens).toBe(128);
    expect(body.stop).toEqual(["\n\n"]);
    expect(body.messages).toEqual([{ role: "user", content: "hi" }]);
  });

  it("serialises tool calls and tool results", () => {
    const req: ChatRequest = {
      messages: [
        { role: "user", content: "weather?" },
        {
          role: "assistant",
          content: null,
          toolCalls: [
            { id: "call_1", type: "function", function: { name: "get", arguments: "{}" } },
          ],
        },
        { role: "tool", content: "sunny", toolCallId: "call_1" },
      ],
      tools: [
        {
          type: "function",
          function: { name: "get", description: "get weather", parameters: { type: "object" } },
        },
      ],
      toolChoice: "auto",
    };
    const body = buildChatBody(req);
    const messages = body.messages as Record<string, unknown>[];
    expect(messages[1]?.tool_calls).toHaveLength(1);
    expect(messages[2]?.tool_call_id).toBe("call_1");
    expect((body.tools as unknown[]).length).toBe(1);
    expect(body.tool_choice).toBe("auto");
  });

  it("preserves reasoning content on outbound assistant messages", () => {
    const body = buildChatBody({
      messages: [
        { role: "user", content: "continue" },
        { role: "assistant", content: "working", reasoningContent: "why this works" },
      ],
    });
    const messages = body.messages as Record<string, unknown>[];
    expect(messages[1]?.reasoning_content).toBe("why this works");
  });

  it("omits optional fields when not supplied", () => {
    const body = buildChatBody({ messages: [{ role: "user", content: "x" }] });
    expect(body).not.toHaveProperty("temperature");
    expect(body).not.toHaveProperty("tools");
    expect(body).not.toHaveProperty("model");
  });
});

describe("parseChatResponse", () => {
  it("normalises a standard completion", () => {
    const response = parseChatResponse({
      id: "chatcmpl-1",
      model: "qwen3-32b",
      choices: [
        {
          message: { role: "assistant", content: "hello" },
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 },
    });
    expect(response.message.content).toBe("hello");
    expect(response.finishReason).toBe("stop");
    expect(response.usage?.totalTokens).toBe(5);
  });

  it("surfaces Qwen reasoning content", () => {
    const response = parseChatResponse({
      id: "x",
      model: "qwen3-32b",
      choices: [
        {
          message: { role: "assistant", content: "4", reasoning_content: "hmm let me add" },
          finish_reason: "stop",
        },
      ],
    });
    expect(response.message.reasoningContent).toBe("hmm let me add");
    expect(response.message.content).toBe("4");
  });

  it("parses tool calls", () => {
    const response = parseChatResponse({
      id: "x",
      model: "qwen3-coder",
      choices: [
        {
          message: {
            role: "assistant",
            content: null,
            tool_calls: [
              {
                id: "call_9",
                type: "function",
                function: { name: "shell", arguments: '{"cmd":"ls"}' },
              },
            ],
          },
          finish_reason: "tool_calls",
        },
      ],
    });
    expect(response.finishReason).toBe("tool_calls");
    expect(response.message.toolCalls?.[0]?.function.name).toBe("shell");
  });

  it("maps reasoning_tokens into usage", () => {
    const response = parseChatResponse({
      id: "x",
      model: "m",
      choices: [{ message: { role: "assistant", content: "a" }, finish_reason: "stop" }],
      usage: {
        prompt_tokens: 1,
        completion_tokens: 4,
        total_tokens: 5,
        completion_tokens_details: { reasoning_tokens: 3 },
      },
    });
    expect(response.usage?.reasoningTokens).toBe(3);
  });
});
