"""Auth middleware — validates JWT from Supabase on every protected request."""

import os
from fastapi import Request, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError

security = HTTPBearer()

SUPABASE_JWT_SECRET = os.environ.get("SUPABASE_JWT_SECRET", "")
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> dict:
    """
    Extracts and validates the JWT from the Authorization header.
    Returns the decoded user payload (sub, email, etc.).
    """
    token = credentials.credentials
    try:
        # Supabase JWTs are signed with the JWT secret from project settings
        payload = jwt.decode(
            token,
            SUPABASE_JWT_SECRET,
            algorithms=["HS256"],
            audience="authenticated",
        )
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token: no user ID")
        return payload
    except JWTError as e:
        print(f"[Auth Middleware] JWT decode failed: {e}")
        print(f"[Auth Middleware] JWT secret set: {bool(SUPABASE_JWT_SECRET)}, length: {len(SUPABASE_JWT_SECRET)}")
        raise HTTPException(status_code=401, detail=f"Invalid token: {str(e)}")


async def get_user_id(user: dict = Depends(get_current_user)) -> str:
    """Convenience dependency — returns just the user ID string."""
    return user["sub"]
