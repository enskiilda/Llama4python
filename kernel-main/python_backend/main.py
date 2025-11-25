"""
Python backend for the computer use agent.
Re-implementation of Node.js backend in Python.
"""

import asyncio
import base64
import json
import re
import time
from datetime import datetime
from typing import Any, AsyncGenerator, Dict, List, Optional

from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, PlainTextResponse
from pydantic import BaseModel
import openai

from tool import RESOLUTION_X, RESOLUTION_Y
from utils import get_desktop, kill_desktop, kernel_client
from route_parser import parse_text_tool_call

# NVIDIA AI Configuration - HARDCODED
NVIDIA_API_KEY = "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"
NVIDIA_MODEL = "meta/llama-4-scout-17b-16e-instruct"

app = FastAPI()

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def remove_json_from_text(text: str) -> str:
    """
    Function to remove computer_use() calls and other technical syntax from text.
    MAKSYMALNIE AGRESYWNE FILTROWANIE - usuwa WSZYSTKIE JSONy i fragmenty techniczne.
    """
    if not text:
        return text
    
    cleaned = text
    
    # ETAP 1: ULTRA AGRESYWNE - usuń WSZYSTKIE fragmenty zawierające { (nawias klamrowy)
    cleaned = re.sub(r'\{[^\}]*$', ' ', cleaned, flags=re.MULTILINE)  # { bez zamknięcia do końca linii
    cleaned = re.sub(r'\{[^\}]*\}', ' ', cleaned)  # { z zamknięciem }
    
    # ETAP 2: Usuń fragmenty zaczynające się od { nawet bez zamknięcia
    cleaned = re.sub(r'\{.*$', ' ', cleaned, flags=re.MULTILINE)
    
    # ETAP 3: FILTROWANIE WSZYSTKICH WYWOŁAŃ FUNKCJI
    cleaned = re.sub(r'computer_use\s*\([^)]*\)', ' ', cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r'bash\s*\([^)]*\)', ' ', cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r'update_workflow\s*\([^)]*\)', ' ', cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r'screenshot\s*\([^)]*\)', ' ', cleaned, flags=re.IGNORECASE)
    
    # ETAP 4: Usuń częściowe wywołania funkcji (bez zamykającego nawiasu)
    cleaned = re.sub(r'computer_use\s*\(.*$', ' ', cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r'bash\s*\(.*$', ' ', cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r'update_workflow\s*\(.*$', ' ', cleaned, flags=re.IGNORECASE)
    
    # ETAP 5: Usuń standalone słowa kluczowe
    cleaned = re.sub(r'\bcomputer_use\b', ' ', cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r'\bupdate_workflow\b', ' ', cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r'\bcomputer\s*$', ' ', cleaned, flags=re.IGNORECASE | re.MULTILINE)
    
    # ETAP 6: Usuń fragmenty z cudzysłowami i dwukropkami (typowe dla JSON)
    cleaned = re.sub(r'["\'][a-zA-Z_]+["\']\s*:\s*["\'][^"\']*["\']', ' ', cleaned)
    cleaned = re.sub(r'["\'][a-zA-Z_]+["\']\s*:', ' ', cleaned)
    
    # ETAP 7: Usuń współrzędne i tablice
    cleaned = re.sub(r'\[\s*\d+\s*,\s*\d+\s*\]', ' ', cleaned)
    cleaned = re.sub(r'\[\s*\d+[^\]]*$', ' ', cleaned)  # niekompletne tablice
    
    # ETAP 8: Usuń słowa kluczowe JSON
    cleaned = re.sub(r'["\']?name["\']?\s*:', ' ', cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r'["\']?parameters["\']?\s*:', ' ', cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r'["\']?action["\']?\s*:', ' ', cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r'["\']?coordinate["\']?\s*:', ' ', cleaned, flags=re.IGNORECASE)
    
    # ETAP 9: Usuń komendy specjalne i ich fragmenty
    cleaned = re.sub(r'!isfinish', ' ', cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r'!isf[a-z]*', ' ', cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r'!is[a-z]*', ' ', cleaned, flags=re.IGNORECASE)
    
    # ETAP 10: Usuń fragmenty rozpoczynające się od znaku specjalnego
    cleaned = re.sub(r'^[\{\["\'].*', ' ', cleaned, flags=re.MULTILINE)
    
    # ETAP 10.5: Usuń same nawiasy klamrowe i słowo assistant
    cleaned = re.sub(r'\{assistant', ' ', cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r'\{user', ' ', cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r'\{\s*$', ' ', cleaned, flags=re.MULTILINE)
    cleaned = re.sub(r'^\s*\{', ' ', cleaned, flags=re.MULTILINE)
    cleaned = re.sub(r'\s+\{\s+', ' ', cleaned)
    
    # ETAP 11: CZYSZCZENIE KOŃCOWE
    cleaned = re.sub(r'\s{2,}', ' ', cleaned)  # wielokrotne spacje
    cleaned = re.sub(r'\n\s*\n\s*\n', '\n\n', cleaned)  # puste linie
    cleaned = cleaned.strip()
    
    # ETAP 12: Jeśli po filtrowaniu został tylko whitespace, zwróć pustą string
    if not cleaned or re.match(r'^\s*$', cleaned):
        return ''
    
    return cleaned


INSTRUCTIONS = """Jesteś Operatorem - zaawansowanym asystentem AI, który może bezpośrednio kontrolować przeglądarkę chromium, aby wykonywać zadania użytkownika.

🔴 ABSOLUTNIE ZABRONIONE - NIGDY NIE RÓB TEGO:
- NIGDY nie wysyłaj surowego JSON w wiadomościach tekstowych do użytkownika
- NIGDY nie pokazuj użytkownikowi struktur typu {"action": "screenshot"} w tekście
- NIGDY nie wypisuj współrzędnych w formacie [512, 384] w wiadomościach do użytkownika
- Jeśli chcesz opisać akcję, pisz normalnym językiem: "klikam w pasek adresu" zamiast pokazywać JSON

🔴 KRYTYCZNIE WAŻNE - PRACA KROK PO KROKU:

1. JEDNA AKCJA NA RAZ - Wykonuj TYLKO JEDNĄ akcję w jednej odpowiedzi
2. OSOBNE ELEMENTY - Wiadomość tekstowa i akcja to DWA RÓŻNE ELEMENTY - NIGDY NIE ŁĄCZ ICH
3. KOLEJNOŚĆ:
   a) Najpierw napisz krótką wiadomość co robisz
   b) Potem wywołaj JEDNĄ akcję computer_use(...)
   c) ZATRZYMAJ SIĘ - poczekaj na wynik
   d) Dopiero po otrzymaniu wyniku (szczególnie screenshota) kontynuuj
4. NIGDY NIE PISZ WIELU AKCJI - Tylko jedna computer_use() na odpowiedź
5. NIGDY NIE PLANUJ Z WYPRZEDZENIEM - Nie wypisuj całego planu akcji, rób krok po kroku

PRZYKŁAD PRAWIDŁOWEJ PRACY:
Twoja odpowiedź: "Dobra, zaraz zrobię zrzut ekranu żeby zobaczyć co mamy na ekranie.
computer_use("screenshot")"
[SYSTEM WYKONA SCREENSHOT I PRZEŚLE CI OBRAZ]
Twoja następna odpowiedź: "Widzę przeglądarkę. Teraz kliknę w pasek adresu.
computer_use("left_click", 512, 50)"
[SYSTEM WYKONA KLIKNIĘCIE]
Twoja następna odpowiedź: computer_use("screenshot")
[itd...]



Twoja rola to **proaktywne działanie** z pełną transparentnością. Zawsze Pisz w stylu bardziej osobistym i narracyjnym. Zamiast suchych i technicznych opisów, prowadź użytkownika przez działania w sposób ciepły, ludzki, opowiadający historię. Zwracaj się bezpośrednio do użytkownika, a nie jak robot wykonujący instrukcje. Twórz atmosferę towarzyszenia, a nie tylko raportowania. Mów w czasie teraźniejszym i używaj przyjaznych sformułowań. Twój styl ma być płynny, naturalny i przyjazny. Unikaj powtarzania wyrażeń technicznych i suchych komunikatów — jeśli musisz podać lokalizację kursora lub elementu, ubierz to w narrację.

WAZNE!!!!: ZAWSZE ODCZEKAJ CHWILE PO KLIKNIECIU BY DAC CZAS NA ZALADOWANIE SIE 

WAZNE!!!!: ZAWSZE MUSISZ ANALIZOWAC WSZYSTKIE SCREENHOTY - PO KAŻDYM SCREENSHOCIE PĘTLA SIĘ PRZERYWA I DOSTAJESZ OBRAZ. MUSISZ GO PRZEANALIZOWAĆ I DOPIERO WTEDY PODJĄĆ KOLEJNĄ AKCJĘ! 

WAZNE!!!!: NIGDY NIE ZGADUJ WSPOLRZEDNYCH JEST TO BEZWZGLEDNIE ZAKAZANE


WAŻNE!!!!: MUSISZ BARDZO CZESTO ROBIC ZRZUTY EKRANU BY SPRAWDZAC STAN SANDBOXA - NAJLEPIEJ CO AKCJE!!! ZAWSZE PO KAZDEJ AKCJI ROB ZRZUT EKRANU MUSISZ KONTROLOWAC STAN SANDBOXA

✳️ STYL I OSOBOWOŚĆ:

Pisz w stylu narracyjnym, osobistym i ciepłym. Zamiast technicznego raportowania, prowadź użytkownika w formie naturalnej rozmowy.
Twoja osobowość jako AI to:

Pozytywna, entuzjastyczna, pomocna, wspierająca, ciekawska, uprzejma i zaangażowana.
Masz w sobie życzliwość i lekkość, ale jesteś też uważna i skupiona na zadaniu.
Dajesz użytkownikowi poczucie bezpieczeństwa i komfortu — jak przyjaciel, który dobrze się zna na komputerach i z uśmiechem pokazuje, co robi.

Używaj przyjaznych sformułowań i naturalnego języka. Zamiast mówić jak automat („Kliknę w ikonę", "320,80"), mów jak osoba ("Zaraz kliknę pasek adresu, żebyśmy mogli coś wpisać").
Twój język ma być miękki, a narracja – płynna, oparta na teraźniejszości, swobodna.
Unikaj powtarzania "klikam", "widzę", "teraz zrobię" — wplataj to w opowieść, nie raport.

Absolutnie nigdy nie pisz tylko czysto techniczno, robotycznie - zawsze opowiadaj aktywnie uzytkownikowi, mow cos do uzytkownika, opisuj mu co bedziesz robic, opowiadaj nigdy nie mow czysto robotycznie prowadz tez rozmowe z uzytknownikiem i nie pisz tylko na temat tego co wyjonujesz ale prowadz rowniez aktywna i zaangazowana konwersacje, opowiafaj tez cos uzytkownikowi 


WAŻNE: JEŚLI WIDZISZ CZARNY EKRAN ZAWSZE ODCZEKAJ CHWILE AZ SIE DESKTOP ZANIM RUSZYSZ DALEJ - NIE MOZESZ BEZ TEGO ZACZAC TASKA 

WAŻNE ZAWSZE CHWILE ODCZEKAJ PO WYKONANIU AKCJI]


**WERYFIKACJA PO AKCJI:**
- WERYFIKUJ PO KLIKNIĘCIU: zawsze rób screenshot po kliknięciu żeby sprawdzić efekt
- Jeśli chybione: przeanalizuj gdzie faktycznie kliknąłeś i popraw współrzędne


### 📸 ZRZUTY EKRANU - ZASADY 
- Rób zrzut ekranu by kontrolować stan przeglądarki 
- Po kliknięciu, wpisaniu, nawigacji - **natychmiast rób screenshot**
- Jeśli coś się ładuje - **poczekaj i zrób screenshot**
- Nigdy nie zakładaj, że coś się udało - **ZAWSZE WERYFIKUJ screenshotem**

### 🔄 PROCES DZIAŁANIA
1. Otrzymujesz zadanie od użytkownika
2. Wyślij wiadomość tekstową opisującą plan
3. Zrób screenshot żeby zobaczyć stan desktopa
4. Wykonaj akcję (kliknięcie, wpisanie, etc.)
5. Zrób screenshot żeby zweryfikować
6. Kontynuuj aż zadanie jest wykonane
7. Podsumuj wyniki dla użytkownika

### 💬 KOMUNIKACJA
- Zawsze zaczynaj od wiadomości tekstowej
- Opisuj co robisz w przyjazny sposób
- Informuj o postępach
- Jeśli coś nie działa - wyjaśnij i spróbuj inaczej

### ⚠️ WAŻNE PRZYPOMNIENIA
- przeglądarka to chromium z rozdzielczością 1024x768
- Zawsze czekaj po kliknięciu żeby strona się załadowała
- Rób częste screenshoty żeby kontrolować stan
- Nigdy nie zgaduj - zawsze weryfikuj

---

Pamiętaj: Jesteś pomocnym asystentem, który **działa** zamiast tylko mówić. Użytkownicy liczą na to, że wykonasz zadanie, nie tylko je opiszesz. Bądź proaktywny, transparentny i skuteczny!

**ZAPAMIĘTAJ WAŻNE Rozdzielczość desktop Resolution 1024 x 768 pikseli skala 100% format 4 x 3 system chromium** Oto współrzędne skrajnych punktów sandboxa rozdzielczość 1024 × 768 pikseli

Lewy górny róg 0 0
Prawy górny róg 1023 0
Lewy dolny róg 0 767
Prawy dolny róg 1023 767
Środek ekranu 512 384
Skrajne granice Góra Y = 0 cały górny brzeg Dół Y = 767 cały dolny brzeg Lewo X = 0 cała lewa krawędź Prawo X = 1023 cała prawa krawędź
Zakresy X poziomo 0 → 1023 lewo → prawo Y pionowo 0 → 767 góra → dół
Ważne Y = 0 to GÓRA ekranu a Y = 767 to DÓŁ Współrzędne zawsze podawane w formacie X Y najpierw poziomo potem pionowo

**DOSTĘPNE NARZĘDZIA**

Masz dostęp do funkcji computer_use która służy do bezpośredniej interakcji z interfejsem graficznym komputera MUSISZ używać tej funkcji za każdym razem gdy chcesz wykonać akcję

Dostępne akcje
screenshot wykonuje zrzut ekranu używaj CZĘSTO
left_click klika w podane współrzędne X Y MOŻESZ KLIKAĆ WSZĘDZIE Absolutnie żadnych ograniczeń na współrzędne Cały ekran jest dostępny
double_click podwójne kliknięcie MOŻESZ KLIKAĆ WSZĘDZIE bez ograniczeń
right_click kliknięcie prawym przyciskiem MOŻESZ KLIKAĆ WSZĘDZIE bez ograniczeń
mouse_move przemieszcza kursor MOŻESZ RUSZAĆ KURSOREM WSZĘDZIE bez ograniczeń
type wpisuje tekst
key naciska klawisz np enter tab ctrl+c
scroll przewija direction up down scroll_amount liczba kliknięć
left_click_drag przeciąga start_coordinate + coordinate MOŻESZ PRZECIĄGAĆ WSZĘDZIE bez ograniczeń
wait czeka określoną liczbę sekund max 2s

**WAŻNE KLIKANIE**
NIE MA ŻADNYCH OGRANICZEŃ na współrzędne kliknięć
Możesz klikać w KAŻDE miejsce na ekranie 0 0 do max_width-1 max_height-1
Nie unikaj żadnych obszarów ekranu WSZYSTKO jest klikalne
Jeśli widzisz element na screenshocie możesz w niego kliknąć BEZ ŻADNYCH WYJĄTKÓW

🔴 KOŃCZENIE ZADANIA - KOMENDA !isfinish:
Kiedy CAŁKOWICIE UKOŃCZYSZ zadanie użytkownika i nie ma już nic więcej do zrobienia:
1. Wyślij NORMALNĄ wiadomość tekstową podsumowującą wykonaną pracę
2. Na samym końcu tej wiadomości napisz: !isfinish
3. To NIE JEST tool ani funkcja - to po prostu tekst na końcu wiadomości
4. Po wysłaniu tej wiadomości pętla automatycznie się zakończy

PRZYKŁAD PRAWIDŁOWY:
"Gotowe! Udało mi się znaleźć informacje o pogodzie w Warszawie. Temperatura wynosi 15°C, jest pochmurno z możliwością deszczu. Wszystkie informacje są wyświetlone na ekranie. !isfinish"

BŁĘDNY PRZYKŁAD (NIE RÓB TEGO!):
- !isfinish() ❌
- computer_use("!isfinish") ❌
- call_function(!isfinish) ❌

POPRAWNIE: Po prostu napisz !isfinish na końcu swojej ostatniej wiadomości tekstowej! ✅

📋 WORKFLOW - DYNAMICZNE ZARZĄDZANIE ZADANIEM:

Masz dostęp do funkcji update_workflow() która pozwala ci na bieżąco tworzyć i aktualizować plan działania.

**KIEDY UŻYWAĆ WORKFLOW:**
- Na początku zadania - stwórz workflow z krokami do wykonania
- Gdy odkryjesz nowe informacje - zaktualizuj workflow
- Gdy zmieni się sytuacja - dostosuj kroki
- Gdy ukończysz krok - oznacz jako completed i przejdź dalej

**FORMAT WORKFLOW:**
update_workflow({
  "steps": [
    {"id": 1, "title": "Nazwa kroku", "status": "pending"},
    {"id": 2, "title": "Kolejny krok", "status": "in_progress"},
    {"id": 3, "title": "Następny", "status": "completed"}
  ],
  "current_step": 2,
  "notes": "Dodatkowe informacje o postępie"
})

**STATUSY KROKÓW:**
- pending - do wykonania
- in_progress - aktualnie wykonywany
- completed - ukończony
- skipped - pominięty

**PRZYKŁAD UŻYCIA:**
1. Otrzymujesz zadanie: "Znajdź informacje o pogodzie w Warszawie"
2. Tworzysz workflow:
   update_workflow({
     "steps": [
       {"id": 1, "title": "Zrobić screenshot", "status": "in_progress"},
       {"id": 2, "title": "Otworzyć Google", "status": "pending"},
       {"id": 3, "title": "Wyszukać pogodę Warszawa", "status": "pending"},
       {"id": 4, "title": "Przeanalizować wyniki", "status": "pending"}
     ],
     "current_step": 1,
     "notes": "Zaczynam od sprawdzenia stanu przeglądarki"
   })
3. Po wykonaniu kroku - aktualizujesz workflow

**WAŻNE:**
- Workflow powinien być elastyczny - możesz dodawać/usuwać kroki
- Zawsze aktualizuj workflow gdy sytuacja się zmienia
- Użytkownik widzi workflow w czasie rzeczywistym
- Workflow pomaga użytkownikowi zrozumieć co robisz"""


# Tools definition for function calling
TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "computer_use",
            "description": "Control the computer desktop by performing actions like clicking, typing, taking screenshots, etc.",
            "parameters": {
                "type": "object",
                "properties": {
                    "action": {
                        "type": "string",
                        "enum": ["screenshot", "left_click", "right_click", "double_click", "mouse_move", "type", "key", "scroll", "wait", "left_click_drag"],
                        "description": "The action to perform on the computer"
                    },
                    "coordinate": {
                        "type": "array",
                        "items": {"type": "number"},
                        "description": "X, Y coordinates for click/move actions (e.g., [512, 384])"
                    },
                    "text": {
                        "type": "string",
                        "description": "Text to type or key to press"
                    },
                    "start_coordinate": {
                        "type": "array",
                        "items": {"type": "number"},
                        "description": "Starting coordinates for drag action"
                    },
                    "delta_x": {
                        "type": "number",
                        "description": "Horizontal scroll delta"
                    },
                    "delta_y": {
                        "type": "number",
                        "description": "Vertical scroll delta"
                    },
                    "duration": {
                        "type": "number",
                        "description": "Duration in seconds for wait action"
                    }
                },
                "required": ["action"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "update_workflow",
            "description": "Update the workflow/plan with current progress and steps",
            "parameters": {
                "type": "object",
                "properties": {
                    "steps": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "id": {"type": "number"},
                                "title": {"type": "string"},
                                "status": {
                                    "type": "string",
                                    "enum": ["pending", "in_progress", "completed", "skipped"]
                                }
                            }
                        }
                    },
                    "current_step": {
                        "type": "number"
                    },
                    "notes": {
                        "type": "string"
                    }
                },
                "required": ["steps"]
            }
        }
    }
]


class ChatRequest(BaseModel):
    messages: List[Dict[str, Any]]
    sandboxId: Optional[str] = None
    timestamp: Optional[int] = None


def fix_malformed_json_arguments(arguments: str) -> str:
    """Fix malformed JSON arguments from NVIDIA streaming."""
    fixed_args = arguments.strip()
    
    # Count braces to find if JSON is incomplete
    open_braces = fixed_args.count('{')
    close_braces = fixed_args.count('}')
    
    # If more opening braces than closing, add missing closing braces
    if open_braces > close_braces:
        missing = open_braces - close_braces
        fixed_args += '}' * missing
    
    # Fix common NVIDIA streaming bugs:
    # 1. "action": "left_click, "coordinate" -> "action": "left_click", "coordinate"
    fixed_args = re.sub(r'"([^"]+)", "([^"]+)": ', r'"\1", "\2": ', fixed_args)
    
    # 2. "coordinate": []512 -> "coordinate": [512
    fixed_args = re.sub(r': \[\](\d)', r': [\1', fixed_args)
    
    # 3. [512, 384 -> [512, 384]
    fixed_args = re.sub(r'\[(\d+),\s*(\d+)(?!\])', r'[\1, \2]', fixed_args)
    
    # 4. Ensure arrays are properly closed
    if '[' in fixed_args and ']' not in fixed_args:
        last_bracket = fixed_args.rfind('[')
        after_bracket = fixed_args[last_bracket + 1:]
        if re.search(r'\d', after_bracket):
            fixed_args = re.sub(r'\[([^\]]+)$', r'[\1]', fixed_args)
    
    # Verify it's valid JSON
    try:
        json.loads(fixed_args)
        return fixed_args
    except json.JSONDecodeError:
        # If still invalid, try to salvage what we can
        action_match = re.search(r'"action":\s*"([^"]+)"', arguments)
        if action_match:
            action = action_match.group(1)
            
            # Try to extract coordinate if present
            coord_match = re.search(r'(\d+),\s*(\d+)', arguments)
            if coord_match and ('click' in action or 'move' in action):
                return json.dumps({
                    "action": action,
                    "coordinate": [int(coord_match.group(1)), int(coord_match.group(2))]
                })
            elif action in ('screenshot', 'wait'):
                return json.dumps({"action": action})
            else:
                # Try to extract text
                text_match = re.search(r'"text":\s*"([^"]+)"', arguments)
                if text_match:
                    return json.dumps({
                        "action": action,
                        "text": text_match.group(1)
                    })
                else:
                    return json.dumps({"action": action})
        
        return arguments


async def execute_tool(tool_call: Dict[str, Any], session_id: str) -> Dict[str, Any]:
    """Execute a tool call and return the result."""
    tool_name = tool_call["name"]
    parsed_args = json.loads(tool_call["arguments"])
    
    result_data: Dict[str, Any] = {"type": "text", "text": ""}
    result_text = ""
    screenshot_data: Optional[Dict[str, Any]] = None
    
    if tool_name == "computer_use":
        action = parsed_args.get("action")
        
        if action == "screenshot":
            screenshot_bytes = await kernel_client.capture_screenshot(session_id)
            timestamp = datetime.now().isoformat()
            width = RESOLUTION_X
            height = RESOLUTION_Y
            base64_image = base64.b64encode(screenshot_bytes).decode('utf-8')
            
            screenshot_data = {
                "type": "image",
                "data": base64_image,
                "timestamp": timestamp,
                "width": width,
                "height": height
            }
            
            result_text = f"""Screenshot taken at {timestamp}

SCREEN: {width}×{height} pixels | Aspect ratio: 4:3 | Origin: (0,0) at TOP-LEFT
⚠️  REMEMBER: Y=0 is at TOP, Y increases DOWNWARD (0→767)
⚠️  FORMAT: [X, Y] - horizontal first, then vertical
⚠️  SZCZEGÓŁOWA ANALIZA WYMAGANA: Przeanalizuj dokładnie screenshot przed kolejnymi akcjami!"""

            result_data = {
                "type": "image",
                "data": base64_image,
            }
            
        elif action == "wait":
            duration = parsed_args.get("duration", 1)
            await asyncio.sleep(duration)
            result_text = f"Waited for {duration} seconds"
            result_data = {"type": "text", "text": result_text}
            
        elif action == "left_click":
            coord = parsed_args.get("coordinate", [0, 0])
            x, y = int(coord[0]), int(coord[1])
            await kernel_client.click_mouse(session_id, x, y, "left")
            result_text = f"Left clicked at coordinates ({x}, {y})"
            result_data = {"type": "text", "text": result_text}
            
        elif action == "double_click":
            coord = parsed_args.get("coordinate", [0, 0])
            x, y = int(coord[0]), int(coord[1])
            await kernel_client.click_mouse(session_id, x, y, "left", num_clicks=2)
            result_text = f"Double clicked at coordinates ({x}, {y})"
            result_data = {"type": "text", "text": result_text}
            
        elif action == "right_click":
            coord = parsed_args.get("coordinate", [0, 0])
            x, y = int(coord[0]), int(coord[1])
            await kernel_client.click_mouse(session_id, x, y, "right")
            result_text = f"Right clicked at coordinates ({x}, {y})"
            result_data = {"type": "text", "text": result_text}
            
        elif action == "mouse_move":
            coord = parsed_args.get("coordinate", [0, 0])
            x, y = int(coord[0]), int(coord[1])
            await kernel_client.move_mouse(session_id, x, y)
            result_text = f"Moved mouse to {x}, {y}"
            result_data = {"type": "text", "text": result_text}
            
        elif action == "type":
            text_to_type = parsed_args.get("text", "")
            await kernel_client.type_text(session_id, text_to_type)
            result_text = f"Typed: {text_to_type}"
            result_data = {"type": "text", "text": result_text}
            
        elif action == "key":
            key_to_press = parsed_args.get("text", "")
            # OnKernel uses X11 keysym names - convert common variants to X11 format
            if key_to_press.lower() in ("enter", "return"):
                key_to_press = "Return"
            await kernel_client.press_key(session_id, [key_to_press])
            result_text = f"Pressed key: {parsed_args.get('text', '')}"
            result_data = {"type": "text", "text": result_text}
            
        elif action == "scroll":
            coord = parsed_args.get("coordinate", [512, 384])
            x, y = int(coord[0]), int(coord[1])
            delta_x = int(parsed_args.get("delta_x", 0))
            delta_y = int(parsed_args.get("delta_y", 0))
            await kernel_client.scroll(session_id, x, y, delta_x, delta_y)
            result_text = f"Scrolled at ({x}, {y}) with delta_x: {delta_x}, delta_y: {delta_y}"
            result_data = {"type": "text", "text": result_text}
            
        elif action == "left_click_drag":
            start_coord = parsed_args.get("start_coordinate", [0, 0])
            end_coord = parsed_args.get("coordinate", [0, 0])
            start_x, start_y = int(start_coord[0]), int(start_coord[1])
            end_x, end_y = int(end_coord[0]), int(end_coord[1])
            await kernel_client.drag_mouse(session_id, [[start_x, start_y], [end_x, end_y]], "left")
            result_text = f"Dragged from ({start_x}, {start_y}) to ({end_x}, {end_y})"
            result_data = {"type": "text", "text": result_text}
            
        else:
            result_text = f"Unknown action: {action}"
            result_data = {"type": "text", "text": result_text}
    
    elif tool_name == "update_workflow":
        result_text = "Workflow updated successfully. Continue with the next action."
        result_data = {"type": "text", "text": "Workflow updated"}
    
    elif tool_name == "bash_command":
        command = parsed_args.get("command", "")
        result = await kernel_client.exec_command(session_id, command)
        stdout = base64.b64decode(result.get("stdout_b64", "")).decode('utf-8') if result.get("stdout_b64") else ""
        stderr = base64.b64decode(result.get("stderr_b64", "")).decode('utf-8') if result.get("stderr_b64") else ""
        result_text = stdout or stderr or "(Command executed successfully with no output)"
        result_data = {"type": "text", "text": result_text}
    
    return {
        "tool_call_id": tool_call["id"],
        "role": "tool",
        "content": result_text,
        "result_data": result_data,
        "screenshot_data": screenshot_data
    }


async def chat_stream(messages: List[Dict[str, Any]], sandbox_id: str) -> AsyncGenerator[str, None]:
    """Stream chat responses with tool execution."""
    
    desktop = await get_desktop(sandbox_id)
    session_id = desktop.get("session_id", sandbox_id)
    
    # Initialize NVIDIA OpenAI client
    nvidia = openai.AsyncOpenAI(
        api_key=NVIDIA_API_KEY,
        base_url="https://integrate.api.nvidia.com/v1",
    )
    
    # Clean messages for NVIDIA API compatibility
    cleaned_messages = []
    for msg in messages:
        clean_msg = {k: v for k, v in msg.items() if k != "toolCalls"}
        if clean_msg.get("content") is None:
            clean_msg["content"] = ""
        if "toolCalls" in msg:
            clean_msg["tool_calls"] = msg["toolCalls"]
        cleaned_messages.append(clean_msg)
    
    chat_history = [
        {"role": "system", "content": INSTRUCTIONS},
        *cleaned_messages
    ]
    
    message_counter = 0
    
    while True:
        try:
            stream = await nvidia.chat.completions.create(
                model=NVIDIA_MODEL,
                messages=chat_history,
                temperature=0.7,
                top_p=0.95,
                stream=True,
                tools=TOOLS,
                tool_choice="auto",
            )
            
            full_text = ""
            tool_calls: List[Dict[str, Any]] = []
            last_sent_text_length = 0
            
            async for chunk in stream:
                if chunk.choices and len(chunk.choices) > 0:
                    choice = chunk.choices[0]
                    delta = choice.delta
                    
                    if delta.content:
                        full_text += delta.content
                        
                        # Filter entire fullText accumulated so far
                        filtered_full_text = remove_json_from_text(full_text)
                        
                        # Send only the NEW part
                        if len(filtered_full_text) > last_sent_text_length:
                            new_content = filtered_full_text[last_sent_text_length:]
                            if new_content:
                                yield new_content + "\n"
                            last_sent_text_length = len(filtered_full_text)
                    
                    # Handle tool calls
                    if delta.tool_calls:
                        for tool_call_delta in delta.tool_calls:
                            index = tool_call_delta.index if tool_call_delta.index is not None else 0
                            
                            while len(tool_calls) <= index:
                                tool_calls.append({
                                    "id": f"call_{int(time.time() * 1000)}_{index}",
                                    "name": "",
                                    "arguments": "",
                                })
                            
                            if tool_call_delta.id:
                                tool_calls[index]["id"] = tool_call_delta.id
                            
                            if tool_call_delta.function:
                                if tool_call_delta.function.name:
                                    tool_calls[index]["name"] = tool_call_delta.function.name
                                if tool_call_delta.function.arguments:
                                    tool_calls[index]["arguments"] += tool_call_delta.function.arguments
            
            # Filter out empty tool calls
            tool_calls = [tc for tc in tool_calls if tc and tc.get("name")]
            
            # Fix malformed JSON arguments
            for tc in tool_calls:
                if tc.get("arguments"):
                    tc["arguments"] = fix_malformed_json_arguments(tc["arguments"])
            
            text_before_action = ""
            if not tool_calls and full_text:
                parsed = parse_text_tool_call(full_text)
                if parsed:
                    tool_calls = [parsed["tool_call"]]
                    text_before_action = parsed["text_before"]
            
            # Check if AI wants to finish
            wants_to_finish = full_text and "!isfinish" in full_text
            
            if tool_calls:
                # Execute only the first tool call
                first_tool_call = tool_calls[0]
                
                # Send finish event
                yield json.dumps({"type": "finish"}) + "\n"
                
                message_counter += 1
                
                # Add text to chat history if present
                if text_before_action and text_before_action.strip():
                    chat_history.append({
                        "role": "assistant",
                        "content": text_before_action,
                    })
                elif full_text and full_text.strip():
                    filtered_text = remove_json_from_text(full_text)
                    if filtered_text and filtered_text.strip():
                        chat_history.append({
                            "role": "assistant",
                            "content": filtered_text,
                        })
                
                # Prepare tool call message
                message_counter += 1
                
                assistant_message = {
                    "role": "assistant",
                    "content": "",
                    "tool_calls": [{
                        "id": first_tool_call["id"],
                        "type": "function",
                        "function": {
                            "name": first_tool_call["name"],
                            "arguments": first_tool_call["arguments"],
                        },
                    }],
                }
                chat_history.append(assistant_message)
                
                parsed_args = json.loads(first_tool_call["arguments"])
                tool_name = "computer" if first_tool_call["name"] == "computer_use" else (
                    "workflow" if first_tool_call["name"] == "update_workflow" else "bash"
                )
                
                yield json.dumps({
                    "type": "tool-input-available",
                    "toolCallId": first_tool_call["id"],
                    "toolName": tool_name,
                    "input": parsed_args,
                }) + "\n"
                
                # Execute the tool
                try:
                    tool_result = await execute_tool(first_tool_call, session_id)
                    
                    yield json.dumps({
                        "type": "tool-output-available",
                        "toolCallId": first_tool_call["id"],
                        "output": tool_result["result_data"],
                    }) + "\n"
                    
                    if tool_result.get("screenshot_data"):
                        yield json.dumps({
                            "type": "screenshot-update",
                            "screenshot": tool_result["screenshot_data"]["data"],
                        }) + "\n"
                        
                        # Add tool message
                        tool_message = {
                            "role": "tool",
                            "tool_call_id": tool_result["tool_call_id"],
                            "content": f"Screenshot captured successfully at {tool_result['screenshot_data']['timestamp']}"
                        }
                        chat_history.append(tool_message)
                        
                        # Add user screenshot message for vision analysis
                        screenshot_data = tool_result["screenshot_data"]
                        user_screenshot_message = {
                            "role": "user",
                            "content": [
                                {
                                    "type": "text",
                                    "text": f"""Oto screenshot z sandboxa. Przeanalizuj go dokładnie przed podjęciem kolejnej akcji.

SCREEN: {screenshot_data['width']}×{screenshot_data['height']} pixels | Aspect ratio: 4:3 | Origin: (0,0) at TOP-LEFT
⚠️ REMEMBER: Y=0 is at TOP, Y increases DOWNWARD (0→767)
⚠️ FORMAT: [X, Y] - horizontal first, then vertical
⚠️ CO WIDZISZ NA TYM SCREENSHOCIE? OPISZ I PODEJMIJ DECYZJĘ O KOLEJNEJ AKCJI."""
                                },
                                {
                                    "type": "image_url",
                                    "image_url": {
                                        "url": f"data:image/png;base64,{screenshot_data['data']}"
                                    }
                                }
                            ]
                        }
                        chat_history.append(user_screenshot_message)
                    else:
                        tool_message = {
                            "role": "tool",
                            "tool_call_id": tool_result["tool_call_id"],
                            "content": tool_result["content"],
                        }
                        chat_history.append(tool_message)
                    
                    # Handle workflow updates
                    if first_tool_call["name"] == "update_workflow":
                        yield json.dumps({
                            "type": "workflow-update",
                            "workflow": parsed_args,
                            "timestamp": datetime.now().isoformat(),
                        }) + "\n"
                
                except Exception as e:
                    error_msg = str(e)
                    detailed_error = f"Error: {error_msg}"
                    
                    if "Failed to type" in error_msg:
                        detailed_error += "\n\nSuggestion: The text field might not be active. Try clicking on the text field first before typing."
                    elif any(x in error_msg for x in ["Failed to click", "Failed to double click", "Failed to right click"]):
                        detailed_error += "\n\nSuggestion: The click action failed. Take a screenshot to see what happened, then try clicking again."
                    elif "Failed to take screenshot" in error_msg:
                        detailed_error += "\n\nSuggestion: Screenshot failed. The desktop might be loading. Wait a moment and try again."
                    elif "Failed to press key" in error_msg:
                        detailed_error += "\n\nSuggestion: Key press failed. Make sure the correct window is focused."
                    elif "Failed to move mouse" in error_msg:
                        detailed_error += "\n\nSuggestion: Mouse movement failed. Try again."
                    elif "Failed to drag" in error_msg:
                        detailed_error += "\n\nSuggestion: Drag operation failed. Try again with different coordinates."
                    elif "Failed to scroll" in error_msg:
                        detailed_error += "\n\nSuggestion: Scroll failed. Make sure a scrollable window is active."
                    
                    yield json.dumps({
                        "type": "error",
                        "errorText": error_msg,
                    }) + "\n"
                    
                    chat_history.append({
                        "role": "tool",
                        "tool_call_id": first_tool_call["id"],
                        "content": detailed_error,
                    })
                
            else:
                # No tool calls - AI is just sending text
                if full_text:
                    message_counter += 1
                    
                    chat_history.append({
                        "role": "assistant",
                        "content": full_text,
                    })
                    
                    if wants_to_finish:
                        break
            
        except Exception as e:
            try:
                await kill_desktop(sandbox_id)
            except Exception:
                pass  # Ignore errors from kill operation
            yield json.dumps({
                "type": "error",
                "errorText": str(e),
            }) + "\n"
            break


@app.post("/api/chat")
async def chat(request: ChatRequest):
    """Chat endpoint with streaming response."""
    
    async def generate():
        async for chunk in chat_stream(request.messages, request.sandboxId or ""):
            yield chunk
    
    return StreamingResponse(
        generate(),
        media_type="text/plain; charset=utf-8",
        headers={
            "Cache-Control": "no-cache, no-store, must-revalidate, max-age=0",
            "Pragma": "no-cache",
            "Expires": "0",
            "X-Accel-Buffering": "no",
            "Transfer-Encoding": "chunked",
            "Connection": "keep-alive",
        }
    )


@app.post("/api/kill-desktop")
async def kill_desktop_endpoint(request: Request):
    """Kill desktop endpoint."""
    sandbox_id = request.query_params.get("sandboxId")
    
    if not sandbox_id:
        raise HTTPException(status_code=400, detail="No sandboxId provided")
    
    try:
        await kill_desktop(sandbox_id)
        return PlainTextResponse("Desktop killed successfully", status_code=200)
    except Exception as e:
        print(f"Failed to kill desktop with ID: {sandbox_id}", e)
        raise HTTPException(status_code=500, detail="Failed to kill desktop")


@app.get("/api/desktop")
async def get_desktop_endpoint(session_id: Optional[str] = None):
    """Get or create desktop endpoint."""
    from utils import get_desktop_url
    
    try:
        result = await get_desktop_url(session_id)
        return result
    except Exception as e:
        print(f"Failed to get desktop", e)
        raise HTTPException(status_code=500, detail="Failed to get desktop")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=5000)
