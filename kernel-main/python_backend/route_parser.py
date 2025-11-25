# Improved parsing of function calls in text
# Returns: {"tool_call": object, "text_before": str, "text_after": str}

import re
import json
from typing import Optional, Dict, Any, Tuple, List
import random
import time


def generate_call_id(prefix: str = "call") -> str:
    """Generate a unique call ID."""
    timestamp = int(time.time() * 1000)
    random_part = ''.join(random.choices('abcdefghijklmnopqrstuvwxyz0123456789', k=9))
    return f"{prefix}_{timestamp}_{random_part}"


def extract_json(text: str, start_index: int) -> Optional[Dict[str, Any]]:
    """Helper to extract JSON from text (handles nested objects)."""
    depth = 0
    in_string = False
    escape_next = False
    json_str = ''
    
    for i in range(start_index, len(text)):
        char = text[i]
        json_str += char
        
        if escape_next:
            escape_next = False
            continue
        
        if char == '\\':
            escape_next = True
            continue
        
        if char == '"':
            in_string = not in_string
            continue
        
        if in_string:
            continue
        
        if char == '{':
            depth += 1
        if char == '}':
            depth -= 1
            if depth == 0:
                try:
                    parsed = json.loads(json_str)
                    return {"json": parsed, "end_index": i + 1}
                except json.JSONDecodeError:
                    return None
    
    return None


def extract_coordinates(text: str) -> Optional[Tuple[int, int]]:
    """Helper to extract coordinate pairs."""
    patterns = [
        r'\[\s*(\d+)\s*,\s*(\d+)\s*\]',  # [512, 384]
        r'(\d+)\s*,\s*(\d+)',             # 512, 384
        r'\(\s*(\d+)\s*,\s*(\d+)\s*\)',  # (512, 384)
    ]
    
    for pattern in patterns:
        match = re.search(pattern, text)
        if match:
            return (int(match.group(1)), int(match.group(2)))
    
    return None


def extract_quoted_text(text: str) -> Optional[str]:
    """Helper to extract text in quotes."""
    patterns = [
        r'"([^"\\]*(?:\\.[^"\\]*)*)"',  # "text with \"quotes\""
        r"'([^'\\]*(?:\\.[^'\\]*)*)'",  # 'text with \'quotes\''
        r'`([^`\\]*(?:\\.[^`\\]*)*)`',  # `text with \`quotes\``
    ]
    
    for pattern in patterns:
        match = re.search(pattern, text)
        if match:
            return match.group(1)
    
    return None


def parse_text_tool_call(text: str) -> Optional[Dict[str, Any]]:
    """Parse tool calls from text."""
    
    # 0. JSON OBJECT PARSING - AI może wysłać JSON object bezpośrednio
    # Format: assistant {"name": "computer_use", "parameters": {...}}
    json_object_pattern = r'(?:assistant\s+)?\{\s*["\']name["\']\s*:\s*["\'](computer_use|update_workflow)["\']\s*,\s*["\']parameters["\']\s*:\s*(\{[\s\S]*?\})\s*\}'
    json_match = re.search(json_object_pattern, text, re.IGNORECASE)
    if json_match:
        try:
            tool_name = json_match.group(1)
            params_str = json_match.group(2)
            params = json.loads(params_str)
            
            return {
                "tool_call": {
                    "id": generate_call_id("call_json"),
                    "name": tool_name,
                    "arguments": json.dumps(params),
                },
                "text_before": text[:json_match.start()].strip(),
                "text_after": text[json_match.end():].strip(),
            }
        except (json.JSONDecodeError, AttributeError):
            pass
    
    # 1. WORKFLOW PARSING
    workflow_patterns = [
        r'update_workflow\s*\(\s*(\{)',
        r'workflow\s*\(\s*(\{)',
    ]
    
    for pattern in workflow_patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            start_index = match.start()
            json_start_index = text.find('{', start_index)
            
            if json_start_index != -1:
                extracted = extract_json(text, json_start_index)
                if extracted:
                    return {
                        "tool_call": {
                            "id": generate_call_id("call_workflow"),
                            "name": "update_workflow",
                            "arguments": json.dumps(extracted["json"]),
                        },
                        "text_before": text[:start_index].strip(),
                        "text_after": text[extracted["end_index"]:].strip(),
                    }
    
    # 2. COMPUTER_USE PARSING - format funkcyjny
    computer_use_patterns = [
        # computer_use("screenshot")
        {
            "regex": r'computer_use\s*\(\s*["\']`?screenshot["\']`?\s*\)',
            "extract": lambda m: {"action": "screenshot"}
        },
        # computer_use("wait", 2) lub computer_use("wait")
        {
            "regex": r'computer_use\s*\(\s*["\']`?wait["\']`?\s*(?:,\s*(\d+))?\s*\)',
            "extract": lambda m: {
                "action": "wait",
                "duration": int(m.group(1)) if m.group(1) else 1
            }
        },
        # computer_use("left_click", [512, 384]) lub computer_use("left_click", 512, 384)
        {
            "regex": r'computer_use\s*\(\s*["\']`?(left_click|double_click|right_click|mouse_move)["\']`?\s*,\s*(.+?)\s*\)',
            "extract": lambda m: (
                {"action": m.group(1), "coordinate": list(coords)} 
                if (coords := extract_coordinates(m.group(2))) else None
            )
        },
        # computer_use("type", "hello world")
        {
            "regex": r'computer_use\s*\(\s*["\']`?type["\']`?\s*,\s*(.+?)\s*\)',
            "extract": lambda m: (
                {"action": "type", "text": quoted}
                if (quoted := extract_quoted_text(m.group(1))) else None
            )
        },
        # computer_use("key", "Enter")
        {
            "regex": r'computer_use\s*\(\s*["\']`?key["\']`?\s*,\s*(.+?)\s*\)',
            "extract": lambda m: (
                {"action": "key", "text": quoted}
                if (quoted := extract_quoted_text(m.group(1))) else None
            )
        },
        # computer_use("scroll", "down", 5) lub computer_use("scroll", "up")
        {
            "regex": r'computer_use\s*\(\s*["\']`?scroll["\']`?\s*,\s*["\']`?(up|down)["\']`?\s*(?:,\s*(\d+))?\s*\)',
            "extract": lambda m: {
                "action": "scroll",
                "delta_y": (int(m.group(2)) if m.group(2) else 3) * 100 * (1 if m.group(1).lower() == "down" else -1)
            }
        },
    ]
    
    for pattern_info in computer_use_patterns:
        match = re.search(pattern_info["regex"], text, re.IGNORECASE)
        if match:
            args = pattern_info["extract"](match)
            if args:
                return {
                    "tool_call": {
                        "id": generate_call_id("call_computer"),
                        "name": "computer_use",
                        "arguments": json.dumps(args),
                    },
                    "text_before": text[:match.start()].strip(),
                    "text_after": text[match.end():].strip(),
                }
    
    # 3. SIMPLE PATTERNS - bez "computer_use"
    simple_patterns = [
        {
            "regex": r'\bscreenshot\s*\(\s*\)',
            "extract": lambda m: {"action": "screenshot"}
        },
        {
            "regex": r'\b(left_click|click|double_click|right_click|mouse_move)\s*\(\s*(.+?)\s*\)',
            "extract": lambda m: (
                {"action": "left_click" if m.group(1) == "click" else m.group(1), "coordinate": list(coords)}
                if (coords := extract_coordinates(m.group(2))) else None
            )
        },
        {
            "regex": r'\btype\s*\(\s*(.+?)\s*\)',
            "extract": lambda m: (
                {"action": "type", "text": quoted}
                if (quoted := extract_quoted_text(m.group(1))) else None
            )
        },
        {
            "regex": r'\bkey\s*\(\s*(.+?)\s*\)',
            "extract": lambda m: (
                {"action": "key", "text": quoted}
                if (quoted := extract_quoted_text(m.group(1))) else None
            )
        },
        {
            "regex": r'\bwait\s*\(\s*(?:(\d+))?\s*\)',
            "extract": lambda m: {
                "action": "wait",
                "duration": int(m.group(1)) if m.group(1) else 1
            }
        },
        {
            "regex": r'\bscroll\s*\(\s*["\']`?(up|down)["\']`?\s*(?:,\s*(\d+))?\s*\)',
            "extract": lambda m: {
                "action": "scroll",
                "delta_y": (int(m.group(2)) if m.group(2) else 3) * 100 * (1 if m.group(1).lower() == "down" else -1)
            }
        },
    ]
    
    for pattern_info in simple_patterns:
        match = re.search(pattern_info["regex"], text, re.IGNORECASE)
        if match:
            args = pattern_info["extract"](match)
            if args:
                return {
                    "tool_call": {
                        "id": generate_call_id("call_simple"),
                        "name": "computer_use",
                        "arguments": json.dumps(args),
                    },
                    "text_before": text[:match.start()].strip(),
                    "text_after": text[match.end():].strip(),
                }
    
    # 4. NATURAL LANGUAGE PATTERNS - wykrywanie intencji w naturalnym języku
    natural_patterns = [
        {
            "regex": r'(?:zrób|zrobie|zrobię|rob|make|take)\s+(?:a\s+)?screenshot',
            "extract": lambda m: {"action": "screenshot"}
        },
        {
            "regex": r'(?:kliknij|klikam|klikne|kliknę|click)\s+(?:w\s+)?(?:na\s+)?(?:współrzędne\s+)?(?:\[?\s*)?(\d+)\s*,?\s*(\d+)',
            "extract": lambda m: {
                "action": "left_click",
                "coordinate": [int(m.group(1)), int(m.group(2))]
            }
        },
        {
            "regex": r'(?:wpisz|wpiszę|wpisze|type)\s+["""](.+?)["""]',
            "extract": lambda m: {
                "action": "type",
                "text": m.group(1)
            }
        },
        {
            "regex": r'(?:naciśnij|nacisnij|press)\s+(?:klawisz\s+)?["""]?(\w+)["""]?',
            "extract": lambda m: {
                "action": "key",
                "text": m.group(1)
            }
        },
        {
            "regex": r'(?:czekaj|poczekaj|wait)\s+(\d+)\s*(?:sekund|second|s)?',
            "extract": lambda m: {
                "action": "wait",
                "duration": int(m.group(1))
            }
        },
    ]
    
    for pattern_info in natural_patterns:
        match = re.search(pattern_info["regex"], text, re.IGNORECASE)
        if match:
            args = pattern_info["extract"](match)
            if args:
                return {
                    "tool_call": {
                        "id": generate_call_id("call_natural"),
                        "name": "computer_use",
                        "arguments": json.dumps(args),
                    },
                    "text_before": text[:match.start()].strip(),
                    "text_after": text[match.end():].strip(),
                }
    
    return None
