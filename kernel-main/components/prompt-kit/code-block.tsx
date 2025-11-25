"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

const CodeBlock = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "rounded-md bg-zinc-900 dark:bg-zinc-950",
      className
    )}
    {...props}
  />
))
CodeBlock.displayName = "CodeBlock"

interface CodeBlockCodeProps extends React.HTMLAttributes<HTMLElement> {
  code: string
  language?: string
}

const CodeBlockCode = React.forwardRef<
  HTMLElement,
  CodeBlockCodeProps
>(({ className, code, language, ...props }, ref) => (
  <code
    ref={ref}
    className={cn(
      "block overflow-x-auto p-4 text-sm text-zinc-50 font-mono",
      className
    )}
    {...props}
  >
    {code}
  </code>
))
CodeBlockCode.displayName = "CodeBlockCode"

export { CodeBlock, CodeBlockCode }
