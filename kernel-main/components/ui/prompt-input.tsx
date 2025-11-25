"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

interface PromptInputContextValue {
  value: string
  onValueChange: (value: string) => void
  isLoading: boolean
  onSubmit: () => void
}

const PromptInputContext = React.createContext<PromptInputContextValue | undefined>(undefined)

function usePromptInput() {
  const context = React.useContext(PromptInputContext)
  if (!context) {
    throw new Error("usePromptInput must be used within a PromptInput")
  }
  return context
}

interface PromptInputProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string
  onValueChange: (value: string) => void
  isLoading: boolean
  onSubmit: () => void
}

const PromptInput = React.forwardRef<HTMLDivElement, PromptInputProps>(
  ({ className, value, onValueChange, isLoading, onSubmit, children, ...props }, ref) => {
    return (
      <PromptInputContext.Provider value={{ value, onValueChange, isLoading, onSubmit }}>
        <div ref={ref} className={cn("relative", className)} {...props}>
          {children}
        </div>
      </PromptInputContext.Provider>
    )
  }
)
PromptInput.displayName = "PromptInput"

const PromptInputTextarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => {
  const { value, onValueChange, isLoading } = usePromptInput()
  const textareaRef = React.useRef<HTMLTextAreaElement>(null)

  React.useImperativeHandle(ref, () => textareaRef.current!)

  React.useLayoutEffect(() => {
    const textarea = textareaRef.current
    if (textarea) {
      textarea.style.height = "auto"
      const newHeight = Math.min(textarea.scrollHeight, 200)
      textarea.style.height = `${newHeight}px`
    }
  }, [value])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      if (value.trim().length > 0 && !isLoading) {
        const { onSubmit } = usePromptInput()
        onSubmit()
      }
    }
  }

  return (
    <textarea
      ref={textareaRef}
      rows={1}
      value={value}
      onChange={(e) => onValueChange(e.target.value)}
      onKeyDown={handleKeyDown}
      disabled={isLoading}
      className={cn(
        "w-full resize-none border-0 bg-transparent p-3 text-foreground dark:text-white placeholder:text-muted-foreground dark:placeholder:text-gray-300 focus:ring-0 focus-visible:outline-none min-h-12",
        className
      )}
      {...props}
    />
  )
})
PromptInputTextarea.displayName = "PromptInputTextarea"

const PromptInputActions = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={cn("flex items-center gap-2", className)}
      {...props}
    />
  )
})
PromptInputActions.displayName = "PromptInputActions"

interface PromptInputActionProps extends React.HTMLAttributes<HTMLDivElement> {
  tooltip?: string
}

const PromptInputAction = React.forwardRef<HTMLDivElement, PromptInputActionProps>(
  ({ className, tooltip, ...props }, ref) => {
    return <div ref={ref} className={className} title={tooltip} {...props} />
  }
)
PromptInputAction.displayName = "PromptInputAction"

export { PromptInput, PromptInputTextarea, PromptInputActions, PromptInputAction }
