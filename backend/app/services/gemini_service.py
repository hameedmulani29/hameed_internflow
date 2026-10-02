import json
import logging
import os
import re
import threading
from typing import Any
import httpx

logger = logging.getLogger(__name__)


class GeminiQuotaExhaustedError(RuntimeError):
    """Raised when all configured Gemini API keys have reached their quota limits."""
    pass


class GeminiConfigurationError(RuntimeError):
    """Raised when Gemini API credentials are misconfigured or rejected for authentication."""
    pass


def is_quota_error(status_code: int, response_text: str = "") -> bool:
    """Centralized quota and rate limit detector.
    
    Identifies HTTP 429 status codes as well as explicit Gemini API JSON quota error payloads.
    """
    if status_code == 429:
        return True

    text_lower = (response_text or "").lower()
    quota_keywords = [
        "resource_exhausted",
        "rate_limit_exceeded",
        "quota_exceeded",
        "quota exceeded",
        "rate limit exceeded",
        "daily quota",
        "per-minute quota",
        "user_rate_limit_exceeded",
    ]
    return any(kw in text_lower for kw in quota_keywords)


def mask_key(key: str) -> str:
    """Safely masks API keys for logging to prevent credential exposure."""
    if not key or len(key) < 8:
        return "***"
    return f"{key[:4]}...{key[-4:]}"


class GeminiKeyManager:
    """Thread-safe sequential Gemini API Key Manager.
    
    Supports numbered environment variables (INTERNFLOW_GEMINI_API_KEY_1, _2, _3...)
    with backward compatibility for single-key configs (INTERNFLOW_GEMINI_API_KEY, GEMINI_API_KEY).
    """

    def __init__(self):
        self._lock = threading.Lock()
        self._current_index = 0
        self._keys: list[tuple[str, str]] = [] # list of (key_name, key_value)
        self.reload_keys()

    def reload_keys(self) -> None:
        """Reloads keys from environment variables in deterministic order."""
        with self._lock:
            keys: list[tuple[str, str]] = []
            
            # 1. Discover numbered keys: INTERNFLOW_GEMINI_API_KEY_1, _2, _3...
            numbered_indices = []
            for env_var in os.environ:
                m = re.match(r"^INTERNFLOW_GEMINI_API_KEY_(\d+)$", env_var, re.IGNORECASE)
                if m:
                    numbered_indices.append((int(m.group(1)), env_var))
            
            numbered_indices.sort(key=lambda x: x[0])
            for _, env_var in numbered_indices:
                val = os.getenv(env_var, "").strip()
                if val:
                    keys.append((env_var, val))

            # 2. Fall back to single-key configuration if no numbered keys exist
            if not keys:
                single_key = (os.getenv("INTERNFLOW_GEMINI_API_KEY") or os.getenv("GEMINI_API_KEY") or "").strip()
                if single_key:
                    var_name = "INTERNFLOW_GEMINI_API_KEY" if os.getenv("INTERNFLOW_GEMINI_API_KEY") else "GEMINI_API_KEY"
                    keys.append((var_name, single_key))

            self._keys = keys
            self._current_index = 0

    @property
    def key_count(self) -> int:
        with self._lock:
            return len(self._keys)

    def has_keys(self) -> bool:
        return self.key_count > 0

    def get_active_key(self) -> tuple[int, str, str] | None:
        """Returns (index, key_name, key_value) of currently active key, or None if unconfigured."""
        with self._lock:
            if not self._keys:
                return None
            idx = self._current_index % len(self._keys)
            name, val = self._keys[idx]
            return idx, name, val

    def rotate_key(self, failed_index: int) -> tuple[int, str, str] | None:
        """Thread-safely advances to the next sequential key if failed_index matches current_index."""
        with self._lock:
            if not self._keys:
                return None

            # Only rotate if current index matches the index that failed (prevents double-rotation race conditions)
            if failed_index == self._current_index:
                old_name, old_val = self._keys[self._current_index % len(self._keys)]
                self._current_index += 1
                new_idx = self._current_index % len(self._keys)
                new_name, new_val = self._keys[new_idx]
                logger.warning(
                    f"[Gemini Key Manager] Key #{failed_index + 1} ({old_name}, {mask_key(old_val)}) quota/rate limited. "
                    f"Rotating to Key #{new_idx + 1} ({new_name}, {mask_key(new_val)})."
                )

            current_idx = self._current_index % len(self._keys)
            c_name, c_val = self._keys[current_idx]
            return current_idx, c_name, c_val

    def reset_rotation(self) -> None:
        """Resets key rotation back to the primary key (index 0)."""
        with self._lock:
            self._current_index = 0


# Shared singleton instance
default_key_manager = GeminiKeyManager()


class GeminiProvider:
    """Centralized Gemini API Client Provider with Bounded Failover."""

    def __init__(self, key_manager: GeminiKeyManager | None = None):
        self.key_manager = key_manager or default_key_manager

    def get_model(self) -> str:
        return os.getenv("INTERNFLOW_GEMINI_MODEL", "gemini-2.0-flash")

    def generate_content(
        self,
        prompt: str,
        generation_config: dict[str, Any] | None = None,
        model: str | None = None,
        timeout: float = 30.0,
    ) -> dict[str, Any]:
        """Executes a content generation request with automatic sequential key failover.
        
        Rotates keys strictly on quota/rate-limit errors (429 / RESOURCE_EXHAUSTED).
        Does NOT rotate on malformed request errors (400) or auth errors (401/403).
        """
        if not self.key_manager.has_keys():
            logger.info("[Gemini Provider] No Gemini API keys configured.")
            raise GeminiQuotaExhaustedError("Gemini API key is not configured.")

        selected_model = model or self.get_model()
        payload = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": generation_config or {"temperature": 0.2},
        }

        total_keys = self.key_manager.key_count
        attempts = 0

        while attempts < total_keys:
            active_info = self.key_manager.get_active_key()
            if not active_info:
                raise GeminiQuotaExhaustedError("No Gemini API keys available.")

            idx, name, api_key = active_info
            attempts += 1

            url = f"https://generativelanguage.googleapis.com/v1beta/models/{selected_model}:generateContent"

            try:
                logger.debug(f"[Gemini Provider] Invoking Gemini API via Key #{idx + 1} ({name}, {mask_key(api_key)})")
                with httpx.Client(timeout=timeout) as client:
                    response = client.post(url, params={"key": api_key}, json=payload)
                
                status_code = response.status_code
                response_text = response.text

                # 1. Success case
                if status_code == 200:
                    try:
                        return response.json()
                    except ValueError as exc:
                        raise RuntimeError("Gemini returned an unreadable response payload.") from exc

                # 2. Quota / Rate limit error -> Rotate key and retry
                if is_quota_error(status_code, response_text):
                    logger.warning(
                        f"[Gemini Provider] Quota/Rate limit encountered on Key #{idx + 1} ({name}, HTTP {status_code})."
                    )
                    self.key_manager.rotate_key(idx)
                    continue

                # 3. Authentication / Permission error -> Log warning, do NOT blindly rotate
                if status_code in (401, 403):
                    logger.warning(
                        f"[Gemini Provider] Key #{idx + 1} ({name}, {mask_key(api_key)}) rejected with HTTP {status_code}: {response_text[:200]}"
                    )
                    raise GeminiConfigurationError(f"Gemini API key configuration error (HTTP {status_code}).")

                # 4. Bad Request / Application error -> Do NOT rotate key
                if 400 <= status_code < 500:
                    logger.error(f"[Gemini Provider] Request failed with HTTP {status_code}: {response_text[:300]}")
                    raise RuntimeError(f"Gemini request failed with HTTP {status_code}: {response_text[:200]}")

                # 5. Server-side error (5xx) -> Raise for retry handling
                response.raise_for_status()

            except httpx.HTTPError as exc:
                logger.warning(f"[Gemini Provider] HTTP error during Gemini call: {exc}")
                raise RuntimeError("Gemini service is temporarily unavailable.") from exc

        # All keys attempted and exhausted
        logger.error(f"[Gemini Provider] All {total_keys} configured Gemini API keys have been exhausted due to quota limits.")
        raise GeminiQuotaExhaustedError(f"All {total_keys} configured Gemini API keys have been exhausted due to quota limits.")


# Shared singleton provider instance
default_gemini_provider = GeminiProvider()
