import type { Message } from "@/components/message";

type ToolInvocationState = "streaming" | "call" | "result";

type Snapshot = {
  messages: Message[];
  input: string;
  status: "ready" | "submitted" | "streaming";
  isInitializing: boolean;
  streamUrl: string | null;
  sandboxId: string | null;
};

type RealtimeSessionOptions = {
  api: string;
  body?: Record<string, any>;
  onError?: (error: Error) => void;
};

type SendOptions = {
  clearInput?: boolean;
};

type ToolInvocationPart = Extract<NonNullable<Message["parts"]>[number], { type: "tool-invocation" }>;

type StreamEvent =
  | { type: "text-delta"; delta?: string; textDelta?: string }
  | { type: "text-message"; content: string }
  | { type: "tool-input-available"; toolCallId: string; toolName?: string; input?: any }
  | { type: "tool-output-available"; toolCallId: string; output?: any }
  | { type: "screenshot-update"; screenshot?: string }
  | { type: "finish" }
  | { type: "error"; errorText?: string }
  | Record<string, any>;

export class RealtimeSession {
  private snapshot: Snapshot = {
    messages: [],
    input: "",
    status: "ready",
    isInitializing: true,
    streamUrl: null,
    sandboxId: null,
  };

  private readonly listeners = new Set<() => void>();
  private readonly api: string;
  private readonly baseBody?: Record<string, any>;
  private readonly onError?: (error: Error) => void;
  private abortController: AbortController | null = null;
  private currentTextId: string | null = null;
  private readonly toolMessageMap = new Map<string, string>();
  private activeScreenshotToolId: string | null = null;

  constructor(options: RealtimeSessionOptions) {
    this.api = options.api;
    this.baseBody = options.body;
    this.onError = options.onError;
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = () => this.snapshot;

  setInput(value: string) {
    this.updateSnapshot({ input: value });
  }

  setInitializing(flag: boolean) {
    this.updateSnapshot({ isInitializing: flag });
  }

  updateDesktop({ streamUrl, sandboxId }: { streamUrl: string | null; sandboxId: string | null }) {
    this.updateSnapshot({ streamUrl, sandboxId });
  }

  async sendMessage(text: string, options?: SendOptions) {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (this.snapshot.status === "streaming" || this.snapshot.status === "submitted") return;
    if (this.snapshot.isInitializing) return;

    const userMessage: Message = {
      id: `user-${Date.now()}-${Math.random()}`,
      role: "user",
      content: trimmed,
    };

    const newMessages = [...this.snapshot.messages, userMessage];

    this.currentTextId = null;
    this.activeScreenshotToolId = null;

    this.updateSnapshot({
      messages: newMessages,
      input: options?.clearInput ? "" : this.snapshot.input,
      status: "submitted",
    });

    this.abortController?.abort();
    const abortController = new AbortController();
    this.abortController = abortController;

    try {
      const payload = {
        messages: newMessages,
        timestamp: Date.now(),
        sandboxId: this.snapshot.sandboxId,
        ...(this.baseBody ?? {}),
      };

      const response = await fetch(this.api, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: abortController.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      if (!response.body) {
        throw new Error("No response body");
      }

      this.updateSnapshot({ status: "streaming" });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          if (buffer.trim()) {
            this.processLine(buffer);
          }
          break;
        }

        buffer += decoder.decode(value, { stream: true });

        let newlineIndex = buffer.indexOf("\n");
        while (newlineIndex !== -1) {
          const line = buffer.slice(0, newlineIndex);
          buffer = buffer.slice(newlineIndex + 1);
          this.processLine(line);
          newlineIndex = buffer.indexOf("\n");
        }
      }

      this.abortController = null;
      this.updateSnapshot({ status: "ready" });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
      } else {
        console.error("[STREAMING ERROR]", error);
        if (this.onError) {
          this.onError(error instanceof Error ? error : new Error(String(error)));
        }
      }
      this.updateSnapshot({ status: "ready" });
    }
  }

  stop() {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.updateSnapshot({ status: "ready" });
  }

  private processLine(rawLine: string) {
    const line = rawLine;
    if (!line) return;

    let event: StreamEvent;
    try {
      event = JSON.parse(line) as StreamEvent;
    } catch (err) {
      // Nie jest JSON - to surowy tekst, obsłuż jako text-delta
      // Nie używamy trim() aby zachować spacje
      this.handleTextDelta(line);
      return;
    }

    if (!event.type) {
      return;
    }

    if (event.type === "text-delta") {
      const textEvent = event as { type: "text-delta"; delta?: string; textDelta?: string };
      const delta = typeof textEvent.delta === "string" ? textEvent.delta : textEvent.textDelta ?? "";
      if (!delta) return;
      this.handleTextDelta(delta);
      return;
    }

    if (event.type === "text-message") {
      const messageEvent = event as { type: "text-message"; content: string };
      if (!messageEvent.content) return;
      this.handleTextMessage(messageEvent.content);
      return;
    }

    if (event.type === "tool-input-available") {
      const toolEvent = event as { type: "tool-input-available"; toolCallId: string; toolName?: string; input?: any };
      if (!toolEvent.toolCallId) return;
      this.handleToolEvent(toolEvent.toolCallId, "call", {
        toolName: toolEvent.toolName,
        args: toolEvent.input,
        argsText: toolEvent.input ? JSON.stringify(toolEvent.input, null, 2) : undefined,
      });
      if (toolEvent.input?.action === "screenshot") {
        this.activeScreenshotToolId = toolEvent.toolCallId;
      }
      return;
    }

    if (event.type === "tool-output-available") {
      const outputEvent = event as { type: "tool-output-available"; toolCallId: string; output?: any };
      if (!outputEvent.toolCallId) return;
      this.handleToolEvent(outputEvent.toolCallId, "result", { result: outputEvent.output });
      if (outputEvent.output?.type === "image") {
        this.activeScreenshotToolId = outputEvent.toolCallId;
      }
      return;
    }

    if (event.type === "screenshot-update") {
      const screenshotEvent = event as { type: "screenshot-update"; screenshot?: string };
      if (!this.activeScreenshotToolId) return;
      if (!screenshotEvent.screenshot) return;
      this.handleToolEvent(this.activeScreenshotToolId, "result", {
        result: { type: "image", data: screenshotEvent.screenshot },
      });
      return;
    }

    if (event.type === "finish") {
      this.currentTextId = null;
      this.updateSnapshot({ status: "ready" });
      return;
    }

    if (event.type === "error") {
      const errorEvent = event as { type: "error"; errorText?: string };
      const error = new Error(errorEvent.errorText || "Streaming error");
      if (this.onError) {
        this.onError(error);
      }
      this.updateSnapshot({ status: "ready" });
      return;
    }
  }

  private handleTextDelta(delta: string) {
    if (!this.currentTextId) {
      const assistantMessage: Message = {
        id: `assistant-${Date.now()}-${Math.random()}`,
        role: "assistant",
        content: delta,
      };
      this.currentTextId = assistantMessage.id;
      this.replaceMessages([...this.snapshot.messages, assistantMessage]);
      return;
    }

    const updatedMessages = this.snapshot.messages.map((message) => {
      if (message.id !== this.currentTextId) return message;
      return {
        ...message,
        content: (message.content ?? "") + delta,
      };
    });

    this.replaceMessages(updatedMessages);
  }

  private handleTextMessage(content: string) {
    // Create a new separate message for each text-message event
    const assistantMessage: Message = {
      id: `assistant-${Date.now()}-${Math.random()}`,
      role: "assistant",
      content: content,
    };
    
    // Reset currentTextId so next text-delta creates a new message
    this.currentTextId = null;
    
    this.replaceMessages([...this.snapshot.messages, assistantMessage]);
  }

  private handleToolEvent(
    toolCallId: string,
    state: ToolInvocationState,
    updates: Partial<ToolInvocationPart["toolInvocation"]>,
  ) {
    let messageId = this.toolMessageMap.get(toolCallId);

    if (!messageId) {
      messageId = `tool-${toolCallId}-${Date.now()}`;
      this.toolMessageMap.set(toolCallId, messageId);

      const invocation: ToolInvocationPart = {
        type: "tool-invocation",
        toolInvocation: {
          toolCallId,
          toolName: updates.toolName,
          state,
          args: updates.args,
          argsText: updates.argsText,
          result: updates.result,
        },
      };

      const toolMessage: Message = {
        id: messageId,
        role: "assistant",
        content: "",
        parts: [invocation],
      };

      this.currentTextId = null;
      this.replaceMessages([...this.snapshot.messages, toolMessage]);
      return;
    }

    const updatedMessages = this.snapshot.messages.map((message) => {
      if (message.id !== messageId || !message.parts) return message;

      const newParts = message.parts.map((part) => {
        if (part.type !== "tool-invocation") return part;
        if (part.toolInvocation.toolCallId !== toolCallId) return part;

        return {
          ...part,
          toolInvocation: {
            ...part.toolInvocation,
            ...updates,
            state,
          },
        };
      });

      return {
        ...message,
        parts: newParts,
      };
    });

    this.replaceMessages(updatedMessages);
  }

  private replaceMessages(messages: Message[]) {
    this.updateSnapshot({ messages });
  }

  private updateSnapshot(partial: Partial<Snapshot>) {
    this.snapshot = { ...this.snapshot, ...partial };
    this.emit();
  }

  private emit() {
    for (const listener of this.listeners) {
      listener();
    }
  }
}
