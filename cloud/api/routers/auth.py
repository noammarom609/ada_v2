"""
Auth Router — handles login, signup, OAuth, and token refresh.
Uses Supabase Auth as the provider.
"""

import os
from urllib.parse import quote
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, EmailStr
from api.supabase_client import get_supabase

router = APIRouter()

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_ANON_KEY = os.environ.get("SUPABASE_ANON_KEY", "")
APP_REDIRECT_URL = os.environ.get("APP_URL", "dvirious://auth/callback")


class EmailSignup(BaseModel):
    email: EmailStr
    password: str
    display_name: str = ""


class EmailLogin(BaseModel):
    email: EmailStr
    password: str


class TokenRefresh(BaseModel):
    refresh_token: str


@router.get("/oauth-url")
async def get_oauth_url(provider: str = "google"):
    """
    Returns the OAuth URL that the desktop app should open in the browser.
    Supported providers: google, github
    """
    if provider not in ("google", "github"):
        raise HTTPException(status_code=400, detail="Unsupported provider. Use 'google' or 'github'.")

    # The OAuth URL is constructed from Supabase's auth endpoint
    encoded_redirect = quote(APP_REDIRECT_URL, safe='')
    oauth_url = (
        f"{SUPABASE_URL}/auth/v1/authorize"
        f"?provider={provider}"
        f"&redirect_to={encoded_redirect}"
    )

    return {"url": oauth_url, "provider": provider}


@router.post("/signup")
async def signup(data: EmailSignup):
    """Sign up with email and password."""
    sb = get_supabase()
    try:
        result = sb.auth.sign_up({
            "email": data.email,
            "password": data.password,
            "options": {
                "data": {"display_name": data.display_name}
            }
        })

        if result.user:
            # Profile is auto-created by the handle_new_user() trigger
            # on auth.users INSERT — no manual insert needed.

            return {
                "user_id": result.user.id,
                "email": result.user.email,
                "access_token": result.session.access_token if result.session else None,
                "refresh_token": result.session.refresh_token if result.session else None,
            }
        else:
            raise HTTPException(status_code=400, detail="Signup failed")
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/login")
async def login(data: EmailLogin):
    """Login with email and password."""
    sb = get_supabase()
    try:
        result = sb.auth.sign_in_with_password({
            "email": data.email,
            "password": data.password,
        })

        if result.user and result.session:
            return {
                "user_id": result.user.id,
                "email": result.user.email,
                "access_token": result.session.access_token,
                "refresh_token": result.session.refresh_token,
                "expires_at": result.session.expires_at,
            }
        else:
            raise HTTPException(status_code=401, detail="Invalid credentials")
    except Exception as e:
        raise HTTPException(status_code=401, detail=str(e))


@router.post("/refresh")
async def refresh_token(data: TokenRefresh):
    """Refresh an expired access token."""
    sb = get_supabase()
    try:
        result = sb.auth.refresh_session(data.refresh_token)

        if result.session:
            return {
                "access_token": result.session.access_token,
                "refresh_token": result.session.refresh_token,
                "expires_at": result.session.expires_at,
            }
        else:
            raise HTTPException(status_code=401, detail="Refresh failed")
    except Exception as e:
        raise HTTPException(status_code=401, detail=str(e))


@router.post("/logout")
async def logout():
    """Server-side logout (invalidate session)."""
    # With JWT-based auth, server-side logout is mostly a no-op.
    # The client deletes its stored tokens.
    return {"status": "logged_out"}
