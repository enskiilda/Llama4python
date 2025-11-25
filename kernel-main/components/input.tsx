"use client"

import * as React from "react"
import {
  PromptInput,
  PromptInputAction,
  PromptInputActions,
  PromptInputTextarea,
} from "@/components/ui/prompt-input"
import { Button } from "@/components/ui/button"
import { ArrowUp, Square } from "lucide-react"

interface InputProps {
  input: string
  handleInputChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => void
  isInitializing: boolean
  isLoading: boolean
  status: string
  stop: () => void
}

export function Input({
  input,
  handleInputChange,
  isInitializing,
  isLoading,
  status,
  stop,
}: InputProps) {
  const handleSubmit = () => {
    const form = document.querySelector('form')
    if (form && input.trim().length > 0 && !isInitializing) {
      form.requestSubmit()
    }
  }

  const handleValueChange = (value: string) => {
    const event = {
      target: { value },
    } as React.ChangeEvent<HTMLTextAreaElement>
    handleInputChange(event)
  }

  const isStreaming = status === "streaming" || status === "submitted"

  return (
    <div className="rounded-[28px] p-2" style={{ backgroundColor: '#f6f6f6' }}>
      <PromptInput
        value={input}
        onValueChange={handleValueChange}
        isLoading={isLoading || isInitializing}
        onSubmit={handleSubmit}
        className="w-full"
      >
        <PromptInputTextarea placeholder="Ask me anything..." />
        <PromptInputActions className="justify-end pt-2">
          <PromptInputAction
            tooltip={isStreaming ? "Stop generation" : "Send message"}
          >
            <Button
              variant="default"
              size="icon"
              className="h-8 w-8 rounded-full"
              onClick={isStreaming ? stop : handleSubmit}
              disabled={!isStreaming && (input.trim().length === 0 || isInitializing)}
            >
              {isStreaming ? (
                <Square className="size-5 fill-current" />
              ) : (
                <ArrowUp className="size-5" />
              )}
            </Button>
          </PromptInputAction>
        </PromptInputActions>
      </PromptInput>
    </div>
  )
}
