import { ArrowUpRight, Lightbulb, Search, Globe } from "lucide-react";
import { ChainOfThoughtStep, ChainOfThoughtTrigger } from "./prompt-kit/chain-of-thought";

const suggestions = [
  {
    text: "Bing",
    prompt: "Otwórz przeglądarkę i włącz https://www.bing.com/?cc=pl",
    icon: Search,
  },
  {
    text: "Oferta T-Mobile",
    prompt: "Znajdź ofertę Magenta TV od T-Mobile'",
    icon: Lightbulb,
  },
  {
    text: "Github",
    prompt: "Wejdź na Github",
    icon: Globe,
  },
];

export function PromptSuggestions({
  submitPrompt,
  disabled,
}: {
  submitPrompt: (prompt: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex flex-col gap-2 px-4">
      {suggestions.map((suggestion, index) => {
        const IconComponent = suggestion.icon;
        return (
          <ChainOfThoughtStep key={index}>
            <ChainOfThoughtTrigger
              leftIcon={<IconComponent className="size-4" />}
              rightIcon={<ArrowUpRight className="h-4 w-4 text-zinc-500" />}
              onClick={() => !disabled && submitPrompt(suggestion.prompt)}
              disabled={disabled}
              className={disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
            >
              {suggestion.text}
            </ChainOfThoughtTrigger>
          </ChainOfThoughtStep>
        );
      })}
    </div>
  );
}
