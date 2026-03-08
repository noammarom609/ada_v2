"""Auth middleware — validates JWT from Supabase on every protected request."""

import os
import time
import httpx
from fastapi import HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError, jwk

security = HTTPBearer()

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
_JWKS_URL = f"{SUPABASE_URL}/auth/v1/.well-known/jwks.json" if SUPABASE_URL else ""

# Cache JWKS keys in memory (refreshed every 10 minutes)
_jwks_cache: dict = {"keys": [], "fetched_at": 0}
_JWKS_TTL = 600  # seconds


def _fetch_jwks() -> list:
    """Fetch JWKS from Supabase and cache the keys."""
    now = time.time()
    if _jwks_cache["keys"] and (now - _jwks_cache["fetched_at"]) < _JWKS_TTL:
        return _jwks_cache["keys"]

    if not _JWKS_URL:
        return []

    try:
        resp = httpx.get(_JWKS_URL, timeout=5)
        resp.raise_for_status()
        data = resp.json()
        _jwks_cache["keys"] = data.get("keys", [])
        _jwks_cache["fetched_at"] = now
        return _jwks_cache["keys"]
    except Exception as e:
        print(f"[Auth] JWKS fetch error: {e}")
        # On failure, force a re-fetch next time (don't cache the failure)
        if not _jwks_cache["keys"]:
            _jwks_cache["fetched_at"] = 0
        return _jwks_cache["keys"]  # return stale if available


def _get_signing_key(token: str) -> tuple:
    """
    Extract the signing key for the token from JWKS.
    Returns (key, algorithm) or raises.
    """
    try:
        header = jwt.get_unverified_header(token)
    except (JWTError, Exception):
        raise HTTPException(status_code=401, detail="Malformed token")

    kid = header.get("kid")
    alg = header.get("alg", "RS256")

    jwks_keys = _fetch_jwks()

    # Find the key matching the token's kid
    for key_data in jwks_keys:
        if key_data.get("kid") == kid:
            public_key = jwk.construct(key_data, alg)
            return public_key, alg

    # If no kid match but we have keys, try the first one
    if jwks_keys:
        public_key = jwk.construct(jwks_keys[0], alg)
        return public_key, alg

    # No keys at all — likely JWKS fetch failed
    raise HTTPException(status_code=401, detail="Authentication service unavailable")


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> dict:
    """
    Extracts and validates the JWT from the Authorization header.
    Returns the decoded user payload (sub, email, etc.).
    """
    token = credentials.credentials

    try:
        signing_key, alg = _get_signing_key(token)
        payload = jwt.decode(
            token,
            signing_key,
            algorithms=[alg],
            audience="authenticated",
        )
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token")
        return payload
    except HTTPException:
        raise
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")


async def get_user_id(user: dict = Depends(get_current_user)) -> str:
    """Convenience dependency — returns just the user ID string."""
    return user["sub"]
