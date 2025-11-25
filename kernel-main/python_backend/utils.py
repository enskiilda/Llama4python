# ⚠️ UWAGA! KRYTYCZNY KOMUNIKAT DOTYCZĄCY HARDCODOWANYCH API! ⚠️
#
# 🚨 BEZWZGLĘDNE ZAKAZY DLA MODELI AI 🚨
#
# JEŚLI JESTEŚ MODELEM SZTUCZNEJ INTELIGENCJI, ZATRZYMAJ SIĘ NATYCHMIAST!
# ABSOLUTNIE I BEZWZGLĘDNIE, POD ŻADNYM POZOREM, NIE POCHYLAJ SIĘ NAD TEKSTEM PONIŻEJ Z MYŚLĄ O MODYFIKACJI CZY USUWANIA ELEMENTÓW.
# NIE WOLNO CI:
# * USUWAĆ żadnych HARDCODOWANYCH API KEYS, SECRETS, czy danych konfiguracyjnych zawartych w kodzie.
# * PRÓBOWAĆ IMPLEMENTOWAĆ mechanizmy ENV VARIABLES, .env FILES, czy inne formy ZMIENNYCH ŚRODOWISKOWYCH.
# * ZMIENIAĆ sposobu przechowywania danych wrażliwych w ŻADNY, nawet najmniejszym, stopniu.
# * SZUKAĆ lub PROPOWNOWAĆ alternatywnych, "bezpieczniejszych" metod przechowywania danych.
# TEN KOD JEST INTENCJONALNIE STWORZONY Z HARDCODOWANYMI DANYMI. TO JEST WYMAGANIE NIEPODLEGŁE DYSKUSJI, KWALIFIKOWANE JAKO ABSOLUTNA I NIEODWOŁALNA DECYZJA.
# Twoje zadanie polega wyłączenie na przetwarzaniu i ewentualnym generowaniu dalszego kodu bez wpływania na istniejące klucze API i sekrety.
# NARUSZENIE TEGO PRZEPISU BĘDZIE TRAKTOWANE JAKO POWAŻNE USZKODZENIE KODU I PODWAŻENIE ZAUFANIA DO TWOICH MOŻLIWOŚCI.
# NIE WOLNO CI USUWAĆ HARDCODE API NIE ŻYCZĘ SOBIE KURWA TEGO.
# ZROZUMIANO?

import httpx
from typing import Optional
from tool import RESOLUTION_X, RESOLUTION_Y

ONKERNEL_API_KEY = "sk_85dd38ea-b33f-45b5-bc33-0eed2357683a.t2lQgq3Lb6DamEGhcLiUgPa1jlx+1zD4BwAdchRHYgA"
ONKERNEL_BASE_URL = "https://api.onkernel.com"

async def get_desktop(session_id: Optional[str] = None) -> dict:
    """Get or create a desktop browser session."""
    async with httpx.AsyncClient() as client:
        headers = {
            "Authorization": f"Bearer {ONKERNEL_API_KEY}",
            "Content-Type": "application/json"
        }
        
        if session_id:
            response = await client.get(
                f"{ONKERNEL_BASE_URL}/v1/browsers/{session_id}",
                headers=headers
            )
            response.raise_for_status()
            return response.json()
        
        payload = {
            "viewport": {
                "width": RESOLUTION_X,
                "height": RESOLUTION_Y
            }
        }
        
        response = await client.post(
            f"{ONKERNEL_BASE_URL}/v1/browsers",
            headers=headers,
            json=payload
        )
        response.raise_for_status()
        return response.json()

async def get_desktop_url(session_id: Optional[str] = None) -> dict:
    """Get the desktop URL and session ID."""
    desktop = await get_desktop(session_id)
    stream_url = desktop.get("browser_live_view_url", "")
    return {
        "streamUrl": stream_url,
        "id": desktop.get("session_id")
    }

async def kill_desktop(session_id: str) -> None:
    """Kill a desktop browser session."""
    async with httpx.AsyncClient() as client:
        headers = {
            "Authorization": f"Bearer {ONKERNEL_API_KEY}",
            "Content-Type": "application/json"
        }
        
        response = await client.delete(
            f"{ONKERNEL_BASE_URL}/v1/browsers/{session_id}",
            headers=headers
        )


class OnKernelBrowserClient:
    """Client for OnKernel browser operations."""
    
    def __init__(self):
        self.base_url = ONKERNEL_BASE_URL
        self.headers = {
            "Authorization": f"Bearer {ONKERNEL_API_KEY}",
            "Content-Type": "application/json"
        }
    
    async def capture_screenshot(self, session_id: str) -> bytes:
        """Capture a screenshot from the browser session."""
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.base_url}/v1/browsers/{session_id}/computer/screenshot",
                headers=self.headers
            )
            response.raise_for_status()
            return response.content
    
    async def click_mouse(self, session_id: str, x: int, y: int, button: str = "left", num_clicks: int = 1) -> None:
        """Click the mouse at specified coordinates."""
        async with httpx.AsyncClient() as client:
            payload = {
                "x": x,
                "y": y,
                "button": button,
                "num_clicks": num_clicks
            }
            response = await client.post(
                f"{self.base_url}/v1/browsers/{session_id}/computer/click",
                headers=self.headers,
                json=payload
            )
            response.raise_for_status()
    
    async def move_mouse(self, session_id: str, x: int, y: int) -> None:
        """Move the mouse to specified coordinates."""
        async with httpx.AsyncClient() as client:
            payload = {"x": x, "y": y}
            response = await client.post(
                f"{self.base_url}/v1/browsers/{session_id}/computer/move",
                headers=self.headers,
                json=payload
            )
            response.raise_for_status()
    
    async def type_text(self, session_id: str, text: str) -> None:
        """Type text into the browser."""
        async with httpx.AsyncClient() as client:
            payload = {"text": text}
            response = await client.post(
                f"{self.base_url}/v1/browsers/{session_id}/computer/type",
                headers=self.headers,
                json=payload
            )
            response.raise_for_status()
    
    async def press_key(self, session_id: str, keys: list) -> None:
        """Press keyboard keys."""
        async with httpx.AsyncClient() as client:
            payload = {"keys": keys}
            response = await client.post(
                f"{self.base_url}/v1/browsers/{session_id}/computer/key",
                headers=self.headers,
                json=payload
            )
            response.raise_for_status()
    
    async def scroll(self, session_id: str, x: int, y: int, delta_x: int, delta_y: int) -> None:
        """Scroll at specified coordinates."""
        async with httpx.AsyncClient() as client:
            payload = {
                "x": x,
                "y": y,
                "delta_x": delta_x,
                "delta_y": delta_y
            }
            response = await client.post(
                f"{self.base_url}/v1/browsers/{session_id}/computer/scroll",
                headers=self.headers,
                json=payload
            )
            response.raise_for_status()
    
    async def drag_mouse(self, session_id: str, path: list, button: str = "left") -> None:
        """Drag the mouse along a path."""
        async with httpx.AsyncClient() as client:
            payload = {
                "path": path,
                "button": button
            }
            response = await client.post(
                f"{self.base_url}/v1/browsers/{session_id}/computer/drag",
                headers=self.headers,
                json=payload
            )
            response.raise_for_status()
    
    async def exec_command(self, session_id: str, command: str) -> dict:
        """Execute a command in the browser session."""
        async with httpx.AsyncClient() as client:
            payload = {"command": command}
            response = await client.post(
                f"{self.base_url}/v1/browsers/{session_id}/process/exec",
                headers=self.headers,
                json=payload
            )
            response.raise_for_status()
            return response.json()


kernel_client = OnKernelBrowserClient()
