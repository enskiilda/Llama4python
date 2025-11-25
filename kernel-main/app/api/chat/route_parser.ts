// Ulepszone parsowanie wywołań funkcji w tekście
// Zwraca: { toolCall: object, textBefore: string, textAfter: string }

interface ParsedToolCall {
  toolCall: {
    id: string;
    name: string;
    arguments: string;
  };
  textBefore: string;
  textAfter: string;
}

// Helper do ekstrakcji JSON z tekstu (obsługuje zagnieżdżone obiekty)
function extractJSON(text: string, startIndex: number): { json: any, endIndex: number } | null {
  let depth = 0;
  let inString = false;
  let escapeNext = false;
  let jsonStr = '';
  
  for (let i = startIndex; i < text.length; i++) {
    const char = text[i];
    jsonStr += char;
    
    if (escapeNext) {
      escapeNext = false;
      continue;
    }
    
    if (char === '\\') {
      escapeNext = true;
      continue;
    }
    
    if (char === '"') {
      inString = !inString;
      continue;
    }
    
    if (inString) continue;
    
    if (char === '{') depth++;
    if (char === '}') {
      depth--;
      if (depth === 0) {
        try {
          const parsed = JSON.parse(jsonStr);
          return { json: parsed, endIndex: i + 1 };
        } catch (e) {
          return null;
        }
      }
    }
  }
  
  return null;
}

// Helper do ekstrakcji tablicy współrzędnych
function extractCoordinates(text: string): [number, number] | null {
  // Format: [x, y] lub x, y
  const patterns = [
    /\[\s*(\d+)\s*,\s*(\d+)\s*\]/,  // [512, 384]
    /(\d+)\s*,\s*(\d+)/,             // 512, 384
    /\(\s*(\d+)\s*,\s*(\d+)\s*\)/,  // (512, 384)
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return [parseInt(match[1]), parseInt(match[2])];
    }
  }
  
  return null;
}

// Helper do ekstrakcji tekstu w cudzysłowach
function extractQuotedText(text: string): string | null {
  const patterns = [
    /"([^"\\]*(\\.[^"\\]*)*)"/,  // "text with \"quotes\""
    /'([^'\\]*(\\.[^'\\]*)*)'/,  // 'text with \'quotes\''
    /`([^`\\]*(\\.[^`\\]*)*)`/,  // `text with \`quotes\``
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return match[1];
    }
  }
  
  return null;
}

export function parseTextToolCall(text: string): ParsedToolCall | null {
  
  // 0. JSON OBJECT PARSING - AI może wysłać JSON object bezpośrednio
  // Format: assistant {"name": "computer_use", "parameters": {...}}
  const jsonObjectPattern = /(?:assistant\s+)?\{\s*["']name["']\s*:\s*["'](computer_use|update_workflow)["']\s*,\s*["']parameters["']\s*:\s*(\{[\s\S]*?\})\s*\}/gi;
  jsonObjectPattern.lastIndex = 0;
  const jsonMatch = jsonObjectPattern.exec(text);
  if (jsonMatch) {
    try {
      const toolName = jsonMatch[1];
      const paramsStr = jsonMatch[2];
      const params = JSON.parse(paramsStr);
      
      return {
        toolCall: {
          id: `call_json_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          name: toolName,
          arguments: JSON.stringify(params),
        },
        textBefore: text.substring(0, jsonMatch.index).trim(),
        textAfter: text.substring(jsonMatch.index + jsonMatch[0].length).trim(),
      };
    } catch (e) {
      console.error('Failed to parse JSON object:', e);
    }
  }
  
  // 1. WORKFLOW PARSING - najbardziej złożone, więc najpierw
  const workflowPatterns = [
    /update_workflow\s*\(\s*(\{)/gi,
    /workflow\s*\(\s*(\{)/gi,
  ];
  
  for (const pattern of workflowPatterns) {
    pattern.lastIndex = 0; // Reset regex
    const match = pattern.exec(text);
    if (match) {
      const startIndex = match.index;
      const jsonStartIndex = text.indexOf('{', startIndex);
      
      if (jsonStartIndex !== -1) {
        const extracted = extractJSON(text, jsonStartIndex);
        if (extracted) {
          return {
            toolCall: {
              id: `call_workflow_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              name: "update_workflow",
              arguments: JSON.stringify(extracted.json),
            },
            textBefore: text.substring(0, startIndex).trim(),
            textAfter: text.substring(extracted.endIndex).trim(),
          };
        }
      }
    }
  }
  
  // 2. COMPUTER_USE PARSING - format funkcyjny
  const computerUsePatterns = [
    {
      // computer_use("screenshot")
      regex: /computer_use\s*\(\s*["'`]screenshot["'`]\s*\)/gi,
      action: "screenshot",
      extract: () => ({ action: "screenshot" })
    },
    {
      // computer_use("wait", 2) lub computer_use("wait")
      regex: /computer_use\s*\(\s*["'`]wait["'`]\s*(?:,\s*(\d+))?\s*\)/gi,
      action: "wait",
      extract: (match: RegExpExecArray) => ({
        action: "wait",
        duration: match[1] ? parseInt(match[1]) : 1
      })
    },
    {
      // computer_use("left_click", [512, 384]) lub computer_use("left_click", 512, 384)
      regex: /computer_use\s*\(\s*["'`](left_click|double_click|right_click|mouse_move)["'`]\s*,\s*(.+?)\s*\)/gi,
      action: "click",
      extract: (match: RegExpExecArray) => {
        const action = match[1];
        const coordsText = match[2];
        const coords = extractCoordinates(coordsText);
        if (coords) {
          return { action, coordinate: coords };
        }
        return null;
      }
    },
    {
      // computer_use("type", "hello world")
      regex: /computer_use\s*\(\s*["'`]type["'`]\s*,\s*(.+?)\s*\)/gi,
      action: "type",
      extract: (match: RegExpExecArray) => {
        const quotedText = extractQuotedText(match[1]);
        if (quotedText) {
          return { action: "type", text: quotedText };
        }
        return null;
      }
    },
    {
      // computer_use("key", "Enter")
      regex: /computer_use\s*\(\s*["'`]key["'`]\s*,\s*(.+?)\s*\)/gi,
      action: "key",
      extract: (match: RegExpExecArray) => {
        const quotedText = extractQuotedText(match[1]);
        if (quotedText) {
          return { action: "key", text: quotedText };
        }
        return null;
      }
    },
    {
      // computer_use("scroll", "down", 5) lub computer_use("scroll", "up")
      regex: /computer_use\s*\(\s*["'`]scroll["'`]\s*,\s*["'`](up|down)["'`]\s*(?:,\s*(\d+))?\s*\)/gi,
      action: "scroll",
      extract: (match: RegExpExecArray) => {
        const direction = match[1].toLowerCase();
        const amount = match[2] ? parseInt(match[2]) : 3;
        return {
          action: "scroll",
          delta_y: direction === "down" ? amount * 100 : -amount * 100
        };
      }
    },
  ];
  
  for (const pattern of computerUsePatterns) {
    pattern.regex.lastIndex = 0; // Reset regex
    const match = pattern.regex.exec(text);
    if (match) {
      const args = pattern.extract(match);
      if (args) {
        return {
          toolCall: {
            id: `call_computer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            name: "computer_use",
            arguments: JSON.stringify(args),
          },
          textBefore: text.substring(0, match.index).trim(),
          textAfter: text.substring(match.index + match[0].length).trim(),
        };
      }
    }
  }
  
  // 3. SIMPLE PATTERNS - bez "computer_use"
  const simplePatterns = [
    {
      regex: /\bscreenshot\s*\(\s*\)/gi,
      extract: () => ({ action: "screenshot" })
    },
    {
      regex: /\b(left_click|click|double_click|right_click|mouse_move)\s*\(\s*(.+?)\s*\)/gi,
      extract: (match: RegExpExecArray) => {
        const action = match[1] === "click" ? "left_click" : match[1];
        const coords = extractCoordinates(match[2]);
        if (coords) {
          return { action, coordinate: coords };
        }
        return null;
      }
    },
    {
      regex: /\btype\s*\(\s*(.+?)\s*\)/gi,
      extract: (match: RegExpExecArray) => {
        const quotedText = extractQuotedText(match[1]);
        if (quotedText) {
          return { action: "type", text: quotedText };
        }
        return null;
      }
    },
    {
      regex: /\bkey\s*\(\s*(.+?)\s*\)/gi,
      extract: (match: RegExpExecArray) => {
        const quotedText = extractQuotedText(match[1]);
        if (quotedText) {
          return { action: "key", text: quotedText };
        }
        return null;
      }
    },
    {
      regex: /\bwait\s*\(\s*(?:(\d+))?\s*\)/gi,
      extract: (match: RegExpExecArray) => ({
        action: "wait",
        duration: match[1] ? parseInt(match[1]) : 1
      })
    },
    {
      regex: /\bscroll\s*\(\s*["'`](up|down)["'`]\s*(?:,\s*(\d+))?\s*\)/gi,
      extract: (match: RegExpExecArray) => {
        const direction = match[1].toLowerCase();
        const amount = match[2] ? parseInt(match[2]) : 3;
        return {
          action: "scroll",
          delta_y: direction === "down" ? amount * 100 : -amount * 100
        };
      }
    },
  ];
  
  for (const pattern of simplePatterns) {
    pattern.regex.lastIndex = 0; // Reset regex
    const match = pattern.regex.exec(text);
    if (match) {
      const args = pattern.extract(match);
      if (args) {
        return {
          toolCall: {
            id: `call_simple_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            name: "computer_use",
            arguments: JSON.stringify(args),
          },
          textBefore: text.substring(0, match.index).trim(),
          textAfter: text.substring(match.index + match[0].length).trim(),
        };
      }
    }
  }
  
  // 4. NATURAL LANGUAGE PATTERNS - wykrywanie intencji w naturalnym języku
  const naturalPatterns = [
    {
      regex: /(?:zrób|zrobie|zrobię|rob|make|take)\s+(?:a\s+)?screenshot/gi,
      extract: () => ({ action: "screenshot" })
    },
    {
      regex: /(?:kliknij|klikam|klikne|kliknę|click)\s+(?:w\s+)?(?:na\s+)?(?:współrzędne\s+)?(?:\[?\s*)?(\d+)\s*,?\s*(\d+)/gi,
      extract: (match: RegExpExecArray) => ({
        action: "left_click",
        coordinate: [parseInt(match[1]), parseInt(match[2])]
      })
    },
    {
      regex: /(?:wpisz|wpiszę|wpisze|type)\s+["""](.+?)["""]/gi,
      extract: (match: RegExpExecArray) => ({
        action: "type",
        text: match[1]
      })
    },
    {
      regex: /(?:naciśnij|nacisnij|press)\s+(?:klawisz\s+)?["""]?(\w+)[""""]?/gi,
      extract: (match: RegExpExecArray) => ({
        action: "key",
        text: match[1]
      })
    },
    {
      regex: /(?:czekaj|poczekaj|wait)\s+(\d+)\s*(?:sekund|second|s)?/gi,
      extract: (match: RegExpExecArray) => ({
        action: "wait",
        duration: parseInt(match[1])
      })
    },
  ];
  
  for (const pattern of naturalPatterns) {
    pattern.regex.lastIndex = 0; // Reset regex
    const match = pattern.regex.exec(text);
    if (match) {
      const args = pattern.extract(match);
      if (args) {
        return {
          toolCall: {
            id: `call_natural_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            name: "computer_use",
            arguments: JSON.stringify(args),
          },
          textBefore: text.substring(0, match.index).trim(),
          textAfter: text.substring(match.index + match[0].length).trim(),
        };
      }
    }
  }
  
  return null;
}
