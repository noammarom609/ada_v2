"""Auth middleware — validates JWT from Supabase on every protected request."""

import os
import base64
from fastapi import Request, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError

security = HTTPBearer()

_raw_secret = os.environ.get("SUPABASE_JWT_SECRET", "")
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")

# Supabase JWT secrets may be base64-encoded; pre-compute both forms
_SECRETS = [_raw_secret]
try:
    _decoded = base64.b64decode(_raw_secret)
    if _decoded != _raw_secret.encode():
        _SECRETS.append(_decoded)
except Exception:
    pass

_ALGORITHMS = ["HS256", "HS384", "HS512"]


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> dict:
    """
    Extracts and validates the JWT from the Authorization header.
    Returns the decoded user payload (sub, email, etc.).
    """
    token = credentials.credentials
    last_error = None
    for secret in _SECRETS:
        try:
            payload = jwt.decode(
                token,
                secret,
                algorithms=_ALGORITHMS,
                audience="authenticated",
            )
            user_id = payload.get("sub")
            if not user_id:
                raise HTTPException(status_code=401, detail="Invalid token: no user ID")
            return payload
        except JWTError as e:
            last_error = e
            continue

    print(f"[Auth Middleware] JWT decode failed: {last_error}")
    print(f"[Auth Middleware] Tried {len(_SECRETS)} secret forms, raw length: {len(_raw_secret)}")
    raise HTTPException(status_code=401, detail=f"Invalid token: {str(last_error)}")


async def get_user_id(user: dict = Depends(get_current_user)) -> str:
    """Convenience dependency — returns just the user ID string."""
    return user["sub"]
