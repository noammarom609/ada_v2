"""
Dvirious Cloud Backend — FastAPI on Vercel
Handles: Auth, AI proxy, billing, usage tracking
"""

import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

from api.routers import auth, billing, ai_proxy, users

app = FastAPI(
    title="Dvirious Cloud API",
    version="1.0.0",
    docs_url="/docs",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Lock down in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/auth", tags=["auth"])
app.include_router(users.router, prefix="/users", tags=["users"])
app.include_router(billing.router, prefix="/billing", tags=["billing"])
app.include_router(ai_proxy.router, prefix="/ai", tags=["ai"])


@app.get("/")
async def root():
    return {"service": "Dvirious Cloud API", "status": "running"}


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/debug/env-check")
async def env_check():
    """Temporary debug endpoint — check which env vars are set."""
    jwt_secret = os.environ.get("SUPABASE_JWT_SECRET", "")
    return {
        "SUPABASE_URL": bool(os.environ.get("SUPABASE_URL")),
        "SUPABASE_ANON_KEY": bool(os.environ.get("SUPABASE_ANON_KEY")),
        "SUPABASE_SERVICE_ROLE_KEY": bool(os.environ.get("SUPABASE_SERVICE_ROLE_KEY")),
        "SUPABASE_JWT_SECRET": bool(jwt_secret),
        "JWT_SECRET_LENGTH": len(jwt_secret),
        "JWT_SECRET_PREFIX": jwt_secret[:4] + "..." if len(jwt_secret) > 4 else "EMPTY",
    }


@app.get("/debug/test-token")
async def test_token(token: str = ""):
    """Temporary debug endpoint — test JWT decode."""
    from jose import jwt, JWTError
    import base64
    jwt_secret = os.environ.get("SUPABASE_JWT_SECRET", "")
    results = {}

    if not token:
        return {"error": "Pass ?token=YOUR_JWT"}

    # Try 1: raw secret string
    try:
        payload = jwt.decode(token, jwt_secret, algorithms=["HS256"], audience="authenticated")
        results["raw_secret"] = {"success": True, "sub": payload.get("sub"), "aud": payload.get("aud")}
    except JWTError as e:
        results["raw_secret"] = {"success": False, "error": str(e)}

    # Try 2: base64-decoded secret
    try:
        decoded_secret = base64.b64decode(jwt_secret)
        payload = jwt.decode(token, decoded_secret, algorithms=["HS256"], audience="authenticated")
        results["b64_decoded_secret"] = {"success": True, "sub": payload.get("sub"), "aud": payload.get("aud")}
    except Exception as e:
        results["b64_decoded_secret"] = {"success": False, "error": str(e)}

    # Try 3: no audience check
    try:
        payload = jwt.decode(token, jwt_secret, algorithms=["HS256"], options={"verify_aud": False})
        results["no_aud_check"] = {"success": True, "sub": payload.get("sub"), "aud": payload.get("aud")}
    except JWTError as e:
        results["no_aud_check"] = {"success": False, "error": str(e)}

    return results
