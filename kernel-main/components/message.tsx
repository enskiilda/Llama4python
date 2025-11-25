"use client";

import type { ComponentType } from "react";
import { useRef } from "react";
import { Markdown } from "./markdown";
import { ABORTED } from "@/lib/utils";
import {
  CheckCircle,
  CircleSlash,
  Loader2,
  ScrollText,
} from "lucide-react";
import {
  ChainOfThoughtStep,
  ChainOfThoughtTrigger,
  ChainOfThoughtContent,
  ChainOfThoughtItem,
} from "@/components/prompt-kit/chain-of-thought";
import { CodeBlock, CodeBlockCode } from "@/components/prompt-kit/code-block";

const PressKeyIcon = () => (
  <svg width="22" height="22" viewBox="0 0 20 20" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
  <path d="M10.8828 9.61914L11.043 9.66309L17.5928 11.9746C18.5062 12.297 18.5682 13.565 17.6904 13.9746L15.1562 15.1562L13.9746 17.6904C13.5906 18.5132 12.4525 18.5107 12.0459 17.7549L11.9746 17.5928L9.66309 11.043C9.37952 10.2395 10.087 9.46376 10.8828 9.61914ZM13.0264 16.5771L13.9902 14.5127L14.0342 14.4287C14.1447 14.2377 14.3114 14.0842 14.5127 13.9902L16.5771 13.0264L11.0889 11.0889L13.0264 16.5771ZM11.877 2.66797C12.6428 2.66797 13.2514 2.6677 13.7432 2.70117C14.2406 2.73507 14.6684 2.80642 15.0684 2.97168C16.0498 3.37749 16.8295 4.15725 17.2354 5.13867C17.4007 5.53864 17.4719 5.9664 17.5059 6.46387C17.5393 6.95561 17.5391 7.56423 17.5391 8.33008C17.5389 8.6972 17.2412 8.99512 16.874 8.99512C16.507 8.99499 16.2092 8.69712 16.209 8.33008C16.209 7.5461 16.2084 6.99077 16.1787 6.55469C16.1494 6.12491 16.0941 5.85875 16.0068 5.64746C15.7359 4.99227 15.2148 4.47101 14.5596 4.2002C14.3483 4.11298 14.0821 4.05758 13.6523 4.02832C13.2163 3.99864 12.6609 3.99805 11.877 3.99805H8.45703C7.513 3.99805 6.84463 3.99834 6.32227 4.04102C5.80769 4.08307 5.4932 4.16316 5.24609 4.28906C4.74409 4.54487 4.33589 4.95307 4.08008 5.45508C3.95417 5.70219 3.87409 6.01668 3.83203 6.53125C3.78936 7.05361 3.78906 7.72198 3.78906 8.66602V11.4609C3.78906 12.344 3.78969 12.9693 3.82715 13.459C3.8641 13.9416 3.9345 14.2387 4.04492 14.4727C4.30898 15.0316 4.75938 15.4821 5.31836 15.7461C5.55226 15.8565 5.8487 15.9269 6.33105 15.9639C6.57587 15.9826 6.85484 15.9913 7.18262 15.9961L8.33008 16.001L8.46387 16.0146C8.76669 16.0766 8.99485 16.3449 8.99512 16.666C8.99512 16.9873 8.76681 17.2553 8.46387 17.3174L8.33008 17.3311L7.16309 17.3262C6.81513 17.321 6.5056 17.3102 6.22949 17.2891C5.67023 17.2462 5.19176 17.1568 4.75 16.9482C3.91222 16.5525 3.23744 15.8779 2.8418 15.04C2.63332 14.5983 2.54379 14.1198 2.50098 13.5605C2.45873 13.0083 2.45898 12.3236 2.45898 11.4609V8.66602C2.45898 7.74384 2.45871 7.01193 2.50684 6.42285C2.5556 5.82619 2.65735 5.31727 2.89453 4.85156C3.27785 4.0993 3.89032 3.4868 4.64258 3.10352C5.10829 2.86633 5.61721 2.76458 6.21387 2.71582C6.80301 2.66769 7.53491 2.66797 8.45703 2.66797H11.877Z" fill="currentColor"/>
  </svg>
);

const KeyboardIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-keyboard-icon lucide-keyboard"><path d="M10 8h.01"/><path d="M12 12h.01"/><path d="M14 8h.01"/><path d="M16 12h.01"/><path d="M18 8h.01"/><path d="M6 8h.01"/><path d="M7 16h10"/><path d="M8 12h.01"/><rect width="20" height="16" x="2" y="4" rx="2"/></svg>
);

const ScreenshotIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-images-icon lucide-images"><path d="m22 11-1.296-1.296a2.4 2.4 0 0 0-3.408 0L11 16"/><path d="M4 8a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2"/><circle cx="13" cy="7" r="1" fill="currentColor"/><rect x="8" y="2" width="14" height="14" rx="2"/></svg>
);

const MousePointerClickIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M14 4.1 12 6"/><path d="m5.1 8-2.9-.8"/><path d="m6 12-1.9 2"/><path d="M7.2 2.2 8 5.1"/><path d="M9.037 9.69a.498.498 0 0 1 .653-.653l11 4.5a.5.5 0 0 1-.074.949l-4.349 1.041a1 1 0 0 0-.74.739l-1.04 4.35a.5.5 0 0 1-.95.074z"/></svg>
);

const SplinePointerIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M14 4.1 12 6"/><path d="m5.1 8-2.9-.8"/><path d="m6 12-1.9 2"/><path d="M7.2 2.2 8 5.1"/><path d="M9.037 9.69a.498.498 0 0 1 .653-.653l11 4.5a.5.5 0 0 1-.074.949l-4.349 1.041a1 1 0 0 0-.74.739l-1.04 4.35a.5.5 0 0 1-.95.074z"/></svg>
);

const TimerIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-timer-icon lucide-timer"><line x1="10" x2="14" y1="2" y2="2"/><line x1="12" x2="15" y1="14" y2="11"/><circle cx="12" cy="14" r="8"/></svg>
);

export type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  parts?: Array<
    | { type: "text"; text: string }
    | {
        type: "tool-invocation";
        toolInvocation: {
          toolCallId: string;
          toolName?: string;
          state: "streaming" | "call" | "result";
          args?: Record<string, any>;
          argsText?: string;
          result?: any;
        };
      }
  >;
};

type PreviewMessageProps = {
  message: Message;
  status: "error" | "submitted" | "streaming" | "ready";
  isLatestMessage: boolean;
  isLoading: boolean;
};

type ComputerActionDescriptor = {
  label: string;
  detail?: string;
  icon: ComponentType<{ className?: string }> | null;
  showSkeleton?: boolean;
};

const streamingSpinner = (
  <Loader2 className="h-4 w-4 animate-spin text-blue-500" aria-hidden="true" />
);

const idleSpinner = (
  <Loader2 className="h-4 w-4 animate-spin text-zinc-500" aria-hidden="true" />
);

const abortedIcon = (
  <CircleSlash className="h-4 w-4 text-amber-600" aria-hidden="true" />
);

const completedIcon = (
  <CheckCircle className="h-4 w-4 text-green-600" aria-hidden="true" />
);

function formatCoordinate(value?: number[]) {
  if (!value || value.length < 2) return undefined;
  return `(${value[0]}, ${value[1]})`;
}

function describeComputerAction(part: NonNullable<Message["parts"]>[number] & { type: "tool-invocation" }): ComputerActionDescriptor {
  const { args = {}, argsText, state } = part.toolInvocation;
  const action: string | undefined = args?.action;

  if (!action && state === "streaming") {
    if (argsText) {
      return {
        label: "Analyzing action",
        detail: argsText.slice(0, 50),
        icon: Loader2,
      };
    }
    return {
      label: "Preparing action",
      icon: Loader2,
      showSkeleton: false,
    };
  }

  switch (action) {
    case "screenshot":
      return { label: "Taking screenshot", icon: ScreenshotIcon };
    case "left_click":
      return {
        label: "Left click",
        detail: formatCoordinate(args?.coordinate) ?? (argsText ? "(streaming...)" : undefined),
        icon: MousePointerClickIcon,
      };
    case "right_click":
      return {
        label: "Right click",
        detail: formatCoordinate(args?.coordinate) ?? (argsText ? "(streaming...)" : undefined),
        icon: MousePointerClickIcon,
      };
    case "double_click":
      return {
        label: "Double click",
        detail: formatCoordinate(args?.coordinate) ?? (argsText ? "(streaming...)" : undefined),
        icon: MousePointerClickIcon,
      };
    case "mouse_move":
      return {
        label: "Move mouse",
        detail: formatCoordinate(args?.coordinate) ?? (argsText ? "(streaming...)" : undefined),
        icon: SplinePointerIcon,
      };
    case "type":
      return {
        label: "Typing",
        detail: args?.text ? `"${args.text}"` : argsText ? "(streaming...)" : undefined,
        icon: KeyboardIcon,
      };
    case "key":
      return {
        label: "Pressing key",
        detail: args?.text ? `"${args.text}"` : argsText ? "(streaming...)" : undefined,
        icon: PressKeyIcon,
      };
    case "wait":
      return {
        label: "Waiting",
        detail: args?.duration ? `${args.duration} seconds` : argsText ? "(streaming...)" : undefined,
        icon: TimerIcon,
      };
    case "scroll":
      return {
        label: "Scrolling",
        detail:
          args?.coordinate && (args?.delta_x !== undefined || args?.delta_y !== undefined)
            ? `at ${formatCoordinate(args.coordinate)} (Δx: ${args.delta_x || 0}, Δy: ${args.delta_y || 0})`
            : argsText
              ? "(streaming...)"
              : undefined,
        icon: ScrollText,
      };
    case "left_click_drag":
      return {
        label: "Dragging",
        detail:
          args?.start_coordinate && args?.coordinate
            ? `${formatCoordinate(args.start_coordinate)} → ${formatCoordinate(args.coordinate)}`
            : argsText
              ? "(streaming...)"
              : undefined,
        icon: SplinePointerIcon,
      };
    default:
      return {
        label: action ?? "Computer action",
        detail: argsText ? argsText.slice(0, 60) : undefined,
        icon: Loader2,
      };
  }
}

function renderInvocationStatus(
  state: "streaming" | "call" | "result",
  isLatestMessage: boolean,
  chatStatus: PreviewMessageProps["status"],
  result?: any,
) {
  if (state === "streaming") {
    return streamingSpinner;
  }

  if (state === "call") {
    return isLatestMessage && chatStatus !== "ready" ? idleSpinner : <div className="h-4 w-4 bg-red-500 rounded-sm" aria-hidden="true" />;
  }

  if (state === "result") {
    if (result === ABORTED || result?.status === "aborted") {
      return abortedIcon;
    }
    return completedIcon;
  }

  return null;
}

function ComputerInvocation({
  part,
  isLatestMessage,
  status,
}: {
  part: Extract<NonNullable<Message["parts"]>[number], { type: "tool-invocation" }>;
  isLatestMessage: boolean;
  status: PreviewMessageProps["status"];
}) {
  const descriptor = describeComputerAction(part);
  const IconComponent = descriptor.icon;
  const { state, result, args = {} } = part.toolInvocation;
  const imgRef = useRef<HTMLImageElement>(null);

  const handleImageLoad = () => {
    if (imgRef.current) {
      imgRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  };

  return (
    <ChainOfThoughtStep defaultOpen={true}>
      <ChainOfThoughtTrigger
        leftIcon={IconComponent ? <IconComponent className="size-4" /> : null}
        rightIcon={renderInvocationStatus(state, isLatestMessage, status, result)}
      >
        {descriptor.label}
        {descriptor.detail && (
          <span className="ml-2 text-xs font-normal text-zinc-500 dark:text-zinc-400">
            {descriptor.detail}
          </span>
        )}
      </ChainOfThoughtTrigger>
      <ChainOfThoughtContent>
        {args.action && (
          <ChainOfThoughtItem>
            <strong>Action:</strong> {args.action}
          </ChainOfThoughtItem>
        )}
        {args.coordinate && (
          <ChainOfThoughtItem>
            <strong>Coordinate:</strong> {formatCoordinate(args.coordinate)}
          </ChainOfThoughtItem>
        )}
        {args.text && (
          <ChainOfThoughtItem>
            <strong>Text:</strong> "{args.text}"
          </ChainOfThoughtItem>
        )}
        {args.duration && (
          <ChainOfThoughtItem>
            <strong>Duration:</strong> {args.duration} seconds
          </ChainOfThoughtItem>
        )}
        {args.start_coordinate && (
          <ChainOfThoughtItem>
            <strong>Start:</strong> {formatCoordinate(args.start_coordinate)} → <strong>End:</strong> {formatCoordinate(args.coordinate)}
          </ChainOfThoughtItem>
        )}
        {state === "result" && result?.type === "image" && result?.data && (
          <ChainOfThoughtItem>
            <div className="overflow-hidden rounded-sm mt-2">
              <img
                ref={imgRef}
                src={`data:image/png;base64,${result.data}`}
                alt="Screenshot"
                className="w-full object-contain"
                onLoad={handleImageLoad}
              />
            </div>
          </ChainOfThoughtItem>
        )}
        {state === "streaming" && (
          <ChainOfThoughtItem>
            <span className="text-zinc-500">Streaming...</span>
          </ChainOfThoughtItem>
        )}
      </ChainOfThoughtContent>
    </ChainOfThoughtStep>
  );
}


function BashInvocation({
  part,
  isLatestMessage,
  status,
}: {
  part: Extract<NonNullable<Message["parts"]>[number], { type: "tool-invocation" }>;
  isLatestMessage: boolean;
  status: PreviewMessageProps["status"];
}) {
  const { args = {}, argsText, state, result } = part.toolInvocation;
  const command = args?.command as string | undefined;
  const displayCommand = argsText?.trim()?.length
    ? argsText.trim()
    : command
      ? command
      : "...";

  const statusIcon = renderInvocationStatus(state, isLatestMessage, status, result);

  return (
    <ChainOfThoughtStep defaultOpen={true}>
      <ChainOfThoughtTrigger
        leftIcon={<ScrollText className="size-4" />}
        rightIcon={statusIcon}
      >
        {state === "streaming" ? "Generating command" : "Running command"}
      </ChainOfThoughtTrigger>
      <ChainOfThoughtContent>
        <ChainOfThoughtItem>
          <strong>Command:</strong>
          <CodeBlock className="mt-2">
            <CodeBlockCode code={displayCommand} language="bash" />
          </CodeBlock>
        </ChainOfThoughtItem>
        {result && typeof result === 'string' && (
          <ChainOfThoughtItem>
            <strong>Output:</strong>
            <CodeBlock className="mt-2">
              <CodeBlockCode code={result} language="text" />
            </CodeBlock>
          </ChainOfThoughtItem>
        )}
      </ChainOfThoughtContent>
    </ChainOfThoughtStep>
  );
}

function GenericInvocation({
  part,
  isLatestMessage,
  status,
}: {
  part: Extract<NonNullable<Message["parts"]>[number], { type: "tool-invocation" }>;
  isLatestMessage: boolean;
  status: PreviewMessageProps["status"];
}) {
  const { toolName = "tool", state, args, result } = part.toolInvocation;
  const statusIcon = renderInvocationStatus(state, isLatestMessage, status, result);

  const getActionDescription = () => {
    if (!args) return "Processing...";
    
    if (args.action) {
      const action = args.action;
      const details: string[] = [];
      
      if (args.coordinate) {
        details.push(`at (${args.coordinate[0]}, ${args.coordinate[1]})`);
      }
      if (args.text) {
        details.push(`"${args.text}"`);
      }
      if (args.key) {
        details.push(`"${args.key}"`);
      }
      
      return details.length > 0 ? `${action} ${details.join(' ')}` : action;
    }
    
    if (typeof args === 'string') return args;
    if (args.command) return args.command;
    if (args.text) return args.text;
    
    return "Executing action...";
  };

  return (
    <ChainOfThoughtStep defaultOpen={true}>
      <ChainOfThoughtTrigger
        leftIcon={<Loader2 className="size-4" />}
        rightIcon={statusIcon}
      >
        {toolName}
      </ChainOfThoughtTrigger>
      <ChainOfThoughtContent>
        <ChainOfThoughtItem>
          {getActionDescription()}
        </ChainOfThoughtItem>
        {args && (
          <ChainOfThoughtItem>
            <CodeBlock className="mt-2">
              <CodeBlockCode code={JSON.stringify(args, null, 2)} language="json" />
            </CodeBlock>
          </ChainOfThoughtItem>
        )}
      </ChainOfThoughtContent>
    </ChainOfThoughtStep>
  );
}

function renderToolInvocation(part: Extract<NonNullable<Message["parts"]>[number], { type: "tool-invocation" }>, props: PreviewMessageProps) {
  const toolName = part.toolInvocation.toolName;

  if (toolName === "computer" || (!toolName && part.toolInvocation.args?.action)) {
    return <ComputerInvocation part={part} isLatestMessage={props.isLatestMessage} status={props.status} />;
  }

  if (toolName === "bash" || (!toolName && part.toolInvocation.args?.command)) {
    return <BashInvocation part={part} isLatestMessage={props.isLatestMessage} status={props.status} />;
  }

  return <GenericInvocation part={part} isLatestMessage={props.isLatestMessage} status={props.status} />;
}

function AITextMessage({ text }: { text: string }) {
  return (
    <ChainOfThoughtStep defaultOpen={true}>
      <ChainOfThoughtContent>
        <div className="w-full break-words max-w-full">
          <Markdown>{text}</Markdown>
        </div>
      </ChainOfThoughtContent>
    </ChainOfThoughtStep>
  );
}

export function PreviewMessage(props: PreviewMessageProps) {
  const { message } = props;

  const noColumnsStyle = {
    columnCount: 1,
    columns: 'auto',
    columnWidth: 'auto',
    MozColumnCount: 1,
    WebkitColumnCount: 1,
    display: 'block',
  };

  if (message.parts && message.parts.length > 0) {
    return (
      <>
        {message.parts.map((part, index) => {
          if (part.type === "tool-invocation") {
            return <div key={`${message.id}-${index}`} className="group/message w-full" data-role={message.role} style={noColumnsStyle}>{renderToolInvocation(part, props)}</div>;
          } else if (part.type === "text") {
            return (
              <div key={`${message.id}-${index}`} className="group/message w-full" data-role={message.role} style={noColumnsStyle}>
                {message.role === "user" ? (
                  <div className="flex justify-end items-start">
                    <span className="user-message-bubble">
                      {part.text}
                    </span>
                  </div>
                ) : (
                  <AITextMessage text={part.text} />
                )}
              </div>
            );
          }
          return null;
        })}
      </>
    );
  }

  return (
    <div className="group/message w-full" data-role={message.role} style={noColumnsStyle}>
      {message.role === "user" ? (
        <div className="flex justify-end items-start">
          <span className="user-message-bubble">
            {message.content}
          </span>
        </div>
      ) : (
        <AITextMessage text={message.content} />
      )}
    </div>
  );
}
