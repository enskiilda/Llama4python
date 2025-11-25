"use client";

import { RealtimeMessage } from "@/components/realtime-message";
import { getDesktopURL } from "@/lib/e2b/utils";
import { useScrollToBottom } from "@/lib/use-scroll-to-bottom";
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { Input } from "@/components/input";
import { Button } from "@/components/ui/button";
import { ClassicLoader } from "@/components/ui/loader";
import { toast } from "sonner";
import { AISDKLogo } from "@/components/icons";
import { PromptSuggestions } from "@/components/prompt-suggestions";
import { RealtimeSession } from "@/lib/realtime-session";

export default function Chat() {
  const [desktopContainerRef, desktopEndRef] = useScrollToBottom();
  const [mobileContainerRef, mobileEndRef] = useScrollToBottom();
  const [isIframeLocked, setIsIframeLocked] = useState(true);

  const sessionRef = useRef<RealtimeSession | undefined>(undefined);

  if (!sessionRef.current) {
    sessionRef.current = new RealtimeSession({
      api: "/api/chat",
      onError: (error) => {
        console.error(error);
        toast.error("There was an error", {
          description: "Please try again later.",
          richColors: true,
          position: "top-center",
        });
      },
    });
  }

  const session = sessionRef.current;

  const state = useSyncExternalStore(
    session.subscribe,
    session.getSnapshot,
    session.getSnapshot,
  );

  const { messages, input, status, isInitializing, streamUrl } = state;
  const isLoading = status !== "ready";

  const handleInputChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    session.setInput(e.target.value);
  };

  const handleFormSubmit = (e: FormEvent) => {
    e.preventDefault();
    session.sendMessage(session.getSnapshot().input, { clearInput: true });
  };

  const handlePromptSubmit = (prompt: string) => {
    session.sendMessage(prompt);
  };

  useEffect(() => {
    const init = async () => {
      try {
        session.setInitializing(true);
        const { streamUrl, id } = await getDesktopURL(undefined);
        session.updateDesktop({ streamUrl, sandboxId: id });
      } catch (err) {
        console.error("Failed to initialize desktop:", err);
        toast.error("Failed to initialize desktop");
      } finally {
        session.setInitializing(false);
      }
    };

    init();
  }, [session]);

  useEffect(() => {
    const { sandboxId } = session.getSnapshot();
    if (!sandboxId) return;

    const killDesktop = () => {
      const currentSandboxId = session.getSnapshot().sandboxId;
      if (!currentSandboxId) return;
      navigator.sendBeacon(
        `/api/kill-desktop?sandboxId=${encodeURIComponent(currentSandboxId)}`,
      );
    };

    const isIOS =
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

    if (isIOS || isSafari) {
      window.addEventListener("pagehide", killDesktop);
      return () => {
        window.removeEventListener("pagehide", killDesktop);
        killDesktop();
      };
    } else {
      window.addEventListener("beforeunload", killDesktop);
      return () => {
        window.removeEventListener("beforeunload", killDesktop);
        killDesktop();
      };
    }
  }, [session, state.sandboxId]);

  return (
    <div className="flex h-dvh relative">
      <div className="hidden xl:flex w-full">
        <div className="w-96 flex flex-col border-r border-border">
          <div className="bg-background py-2 px-4 flex justify-between items-center">
            <AISDKLogo />
          </div>

          <div
            className="flex-1 space-y-6 py-4 overflow-y-auto px-4 hide-scrollbar"
            ref={desktopContainerRef}
          >
            {messages.map((message, i) => (
              <RealtimeMessage
                message={message}
                key={message.id}
                isLoading={isLoading}
                status={status}
                isLatestMessage={i === messages.length - 1}
              />
            ))}
            <div ref={desktopEndRef} className="pb-2" />
          </div>

          {messages.length === 0 && (
            <PromptSuggestions
              disabled={isInitializing}
              submitPrompt={handlePromptSubmit}
            />
          )}
          <div className="bg-background">
            <form onSubmit={handleFormSubmit} className="p-4">
              <Input
                handleInputChange={handleInputChange}
                input={input}
                isInitializing={isInitializing}
                isLoading={isLoading}
                status={status}
                stop={() => session.stop()}
              />
            </form>
          </div>
        </div>

        <div className="flex-1 bg-black relative flex items-center justify-center">
          {streamUrl ? (
            <>
              <iframe
                src={streamUrl}
                className="w-full h-full"
                style={{
                  transformOrigin: "center",
                  width: "100%",
                  height: "100%",
                  pointerEvents: isIframeLocked ? "none" : "auto",
                }}
                allow="autoplay; clipboard-read; clipboard-write; camera; microphone; geolocation"
                sandbox="allow-same-origin allow-scripts allow-popups allow-forms allow-modals allow-downloads"
              />
              <Button
                onClick={() => setIsIframeLocked(!isIframeLocked)}
                className="absolute top-2 right-2 bg-black/50 hover:bg-black/70 text-white p-2 rounded z-10"
                title={isIframeLocked ? "Unlock desktop control" : "Lock desktop control"}
              >
                <svg width="20" height="20" viewBox="0 0 21 20" fill="none" xmlns="http://www.w3.org/2000/svg" className={`w-5 h-5 transition-opacity ${isIframeLocked ? 'opacity-100' : 'opacity-50'}`}>
                  <g clipPath="url(#lock-icon)">
                    <path fillRule="evenodd" clipRule="evenodd" d="M3.38477 3.33341C2.92453 3.33341 2.55143 3.70651 2.55143 4.16675V12.5001C2.55143 12.9603 2.92453 13.3334 3.38477 13.3334H16.7181C17.1783 13.3334 17.5514 12.9603 17.5514 12.5001V4.16675C17.5514 3.70651 17.1783 3.33341 16.7181 3.33341H3.38477ZM0.884766 4.16675C0.884766 2.78604 2.0040 1.66675 3.38477 1.66675H16.7181C18.0988 1.66675 19.2181 2.78604 19.2181 4.16675V12.5001C19.2181 13.8808 18.0988 15.0001 16.7181 15.0001H3.38477C2.00405 15.0001 0.884766 13.8808 0.884766 12.5001V4.16675Z" fill="currentColor"/>
                    <path fillRule="evenodd" clipRule="evenodd" d="M5.88477 17.5001C5.88477 17.0398 6.25786 16.6667 6.7181 16.6667H13.3848C13.845 16.6667 14.2181 17.0398 14.2181 17.5001C14.2181 17.9603 13.845 18.3334 13.3848 18.3334H6.7181C6.25786 18.3334 5.88477 17.9603 5.88477 17.5001Z" fill="currentColor"/>
                    <path fillRule="evenodd" clipRule="evenodd" d="M10.0501 13.3333C10.5104 13.3333 10.8835 13.7063 10.8835 14.1666V17.4999C10.8835 17.9602 10.5104 18.3333 10.0501 18.3333C9.58989 18.3333 9.2168 17.9602 9.2168 17.4999V14.1666C9.2168 13.7063 9.58989 13.3333 10.0501 13.3333Z" fill="currentColor"/>
                    <path d="M8.11331 6.25002C8.10195 6.22379 8.09873 6.19475 8.10408 6.16666C8.10943 6.13858 8.1231 6.11275 8.14332 6.09254C8.16353 6.07232 8.18936 6.05865 8.21744 6.0533C8.24553 6.04795 8.27457 6.05117 8.3008 6.06253L12.9088 7.93453C12.9368 7.94595 12.9605 7.9659 12.9766 7.99155C12.9926 8.01721 13.0002 8.04726 12.9982 8.07745C12.9961 8.10764 12.9847 8.13643 12.9654 8.15973C12.9461 8.18303 12.9199 8.19967 12.8907 8.20727L11.1269 8.66231C11.0273 8.68793 10.9363 8.73977 10.8635 8.81245C10.7907 8.88513 10.7386 8.97599 10.7128 9.07559L10.2581 10.8399C10.2504 10.8692 10.2338 10.8953 10.2105 10.9146C10.1872 10.9339 10.1584 10.9454 10.1282 10.9474C10.098 10.9494 10.068 10.9418 10.0423 10.9256C10.0167 10.9095 9.99682 10.8856 9.98535 10.8576L8.11331 6.25002Z" fill="currentColor"/>
                  </g>
                  <defs>
                    <clipPath id="lock-icon">
                      <rect width="20" height="20" fill="white" transform="translate(0.0517578)"/>
                    </clipPath>
                  </defs>
                </svg>
              </Button>
            </>
          ) : (
            <div className="flex items-center justify-center h-full">
              <ClassicLoader />
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col w-full xl:hidden">
        <div className="bg-background py-2 px-4 flex justify-between items-center">
          <AISDKLogo />
        </div>

        <div
          className="flex-1 space-y-6 py-4 overflow-y-auto px-4 hide-scrollbar"
          ref={mobileContainerRef}
        >
          {messages.map((message, i) => (
            <RealtimeMessage
              message={message}
              key={message.id}
              isLoading={isLoading}
              status={status}
              isLatestMessage={i === messages.length - 1}
            />
          ))}
          <div ref={mobileEndRef} className="pb-2" />
        </div>

        {messages.length === 0 && (
          <PromptSuggestions
            disabled={isInitializing}
            submitPrompt={handlePromptSubmit}
          />
        )}
        <div className="bg-background">
          <form onSubmit={handleFormSubmit} className="p-4">
            <Input
              handleInputChange={handleInputChange}
              input={input}
              isInitializing={isInitializing}
              isLoading={isLoading}
              status={status}
              stop={() => session.stop()}
            />
          </form>
        </div>
      </div>
    </div>
  );
}
