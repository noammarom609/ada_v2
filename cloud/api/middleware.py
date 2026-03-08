"""Auth middleware — validates JWT from Supabase on every protected request."""

import os
import json
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


def _get_token_header(token: str) -> dict:
    """Decode JWT header without verification."""
    try:
        header_b64 = token.split('.')[0]
        padding = 4 - len(header_b64) % 4
        if padding != 4:
            header_b64 += '=' * padding
        return json.loads(base64.urlsafe_b64decode(header_b64))
    except Exception:
        return {}


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> dict:
    """
    Extracts and validates the JWT from the Authorization header.
    Returns the decoded user payload (sub, email, etc.).
    """
    token = credentials.credentials
    header = _get_token_header(token)
    token_alg = header.get("alg", "unknown")

    # Supabase uses HS256; accept common HMAC variants
    allowed_algs = ["HS256", "HS384", "HS512"]

    last_error = None
    errors_by_secret = []

    for i, secret in enumerate(_SECRETS):
        try:
            payload = jwt.decode(
                token,
                secret,
                algorithms=allowed_algs,
                audience="authenticated",
            )
            user_id = payload.get("sub")
            if not user_id:
                raise HTTPException(status_code=401, detail="Invalid token: no user ID")
            return payload
        except Exception as e:
            last_error = e
            errors_by_secret.append(f"secret[{i}]({type(secret).__name__}): {type(e).__name__}: {e}")
            continue

    # All attempts failed — return diagnostic info
    detail = (
        f"JWT verification failed | "
        f"alg={token_alg} | "
        f"header={header} | "
        f"secrets_tried={len(_SECRETS)} | "
        f"errors={errors_by_secret}"
    )
    print(f"[Auth Middleware] {detail}")
    raise HTTPException(status_code=401, detail=detail)


async def get_user_id(user: dict = Depends(get_current_user)) -> str:
    """Convenience dependency — returns just the user ID string."""
    return user["sub"]
