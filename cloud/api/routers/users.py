"""
Users Router — user profile, settings sync, plan info.
"""

from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from api.middleware import get_current_user, get_user_id
from api.supabase_client import get_supabase

router = APIRouter()


class UserSettings(BaseModel):
    ai_name: Optional[str] = None
    face_auth_enabled: Optional[bool] = None
    camera_flipped: Optional[bool] = None
    tool_permissions: Optional[dict] = None


@router.get("/me")
async def get_profile(user: dict = Depends(get_current_user)):
    """Get the current user's profile and plan info."""
    sb = get_supabase()
    user_id = user["sub"]

    result = sb.table("profiles").select("*").eq("id", user_id).single().execute()

    if not result.data:
        # Auto-create profile for OAuth users (who bypass /signup)
        email = user.get("email", "")
        display_name = user.get("user_metadata", {}).get("full_name", "") or email.split("@")[0]
        sb.table("profiles").insert({
            "id": user_id,
            "email": email,
            "display_name": display_name,
            "plan": "free",
        }).execute()
        result = sb.table("profiles").select("*").eq("id", user_id).single().execute()
        if not result.data:
            raise HTTPException(status_code=404, detail="Profile creation failed")

    profile = result.data
    return {
        "user_id": user_id,
        "email": user.get("email"),
        "display_name": profile.get("display_name", ""),
        "plan": profile.get("plan", "free"),
        "ai_name": profile.get("ai_name", "Dvirious"),
        "settings": profile.get("settings", {}),
        "usage": {
            "minutes_used_today": profile.get("minutes_used_today", 0),
            "daily_limit": _get_daily_limit(profile.get("plan", "free")),
        },
    }


@router.put("/settings")
async def update_settings(
    settings: UserSettings,
    user_id: str = Depends(get_user_id),
):
    """Sync user settings to the cloud."""
    sb = get_supabase()

    update_data = {}
    if settings.ai_name is not None:
        update_data["ai_name"] = settings.ai_name
    if settings.tool_permissions is not None:
        update_data["settings"] = {"tool_permissions": settings.tool_permissions}
    if settings.face_auth_enabled is not None:
        update_data.setdefault("settings", {})["face_auth_enabled"] = settings.face_auth_enabled
    if settings.camera_flipped is not None:
        update_data.setdefault("settings", {})["camera_flipped"] = settings.camera_flipped

    if update_data:
        sb.table("profiles").update(update_data).eq("id", user_id).execute()

    return {"status": "updated"}


@router.get("/usage")
async def get_usage(user_id: str = Depends(get_user_id)):
    """Get current usage stats for the user."""
    sb = get_supabase()

    result = sb.table("profiles").select(
        "plan, minutes_used_today, cad_generations_today, web_tasks_today"
    ).eq("id", user_id).single().execute()

    if not result.data:
        raise HTTPException(status_code=404, detail="Profile not found")

    profile = result.data
    plan = profile.get("plan", "free")

    return {
        "plan": plan,
        "voice_minutes": {
            "used": profile.get("minutes_used_today", 0),
            "limit": _get_daily_limit(plan),
        },
        "cad_generations": {
            "used": profile.get("cad_generations_today", 0),
            "limit": None if plan != "free" else 0,
        },
        "web_tasks": {
            "used": profile.get("web_tasks_today", 0),
            "limit": None if plan != "free" else 0,
        },
    }


def _get_daily_limit(plan: str) -> Optional[int]:
    """Returns daily voice minute limit. None = unlimited."""
    limits = {
        "free": 30,
        "pro": None,      # Unlimited
        "business": None,  # Unlimited
    }
    return limits.get(plan, 30)
