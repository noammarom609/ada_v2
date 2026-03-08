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
    version="1.1.0",
    docs_url="/docs" if os.environ.get("ENV") != "production" else None,
    redoc_url=None,
)

# CORS — allow Electron app and Vercel frontend
ALLOWED_ORIGINS = [
    "http://localhost:5180",
    "http://localhost:5173",
    "http://127.0.0.1:5180",
    "app://.",                     # Electron production
    "https://dvirious.com",
    "https://www.dvirious.com",
    "https://dvirius-m7f7.vercel.app",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
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
