"""Supabase client singleton for auth and database operations."""

import os
from supabase import create_client, Client

from typing import Optional

_client: Optional[Client] = None


def get_supabase() -> Client:
    global _client
    if _client is None:
        url = os.environ["SUPABASE_URL"]
        key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
        _client = create_client(url, key)
    return _client


def get_supabase_anon() -> Client:
    """Client with anon key — for user-facing operations."""
    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_ANON_KEY"]
    return create_client(url, key)
