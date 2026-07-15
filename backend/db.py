"""
This module implements the database interaction logic for HeyRoute.
"""

import os
from supabase import create_client
from shapely import MultiPolygon, wkb
from datetime import datetime, timezone
from typing import List, Dict, Any
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Initialize supabase client using environment variables
supabase = create_client(
    os.getenv("SUPABASE_URL"),
    os.getenv("SUPABASE_SERVICE_KEY")
)

async def store_audio_file(file_path: str, file_content: bytes):
    """
    Uploads the audio file to Supabase Storage and returns the response.

    Purpose:
    - To store raw voice inputs for logging, and debugging

    Parameters:
    - file_path (str): Storage path
    - file_content (bytes): Raw audio file data

    Returns:
        dict: Supabase response containing file metadata and public URL
        None if failed to upload
    """

    try:
        normalized_file_path = file_path.replace("\\", "/")
        # We specify the content_type so the browser knows it's audio later
        response = supabase.storage.from_("voice_logs").upload(
            path=normalized_file_path,
            file=file_content,
            file_options={"content-type": "audio/wav", "upsert": "true"}
        )
        return response
    except Exception as e:
        print(f"Storage Upload Error: {e}")
        return None

async def store_interactions(user_id: str, session_id: str, audio_file_path: str,
    raw_input: str, enhanced_input: str, response: str, conversation_history: List[Any], turn_number: int, intents: Dict[str, bool]):
    """
    Stores metadata of recorded audio in the database along with the conversation context.

    Table: interaction_logs
    """

    try:
        supabase.table("interaction_logs").insert({
            "user_id": user_id,
            "session_id": session_id,
            "audio_file_path": audio_file_path,
            "raw_input": raw_input,
            "enhanced_input": enhanced_input,
            "response": response,
            "conversation_history": conversation_history,
            "turn_number": turn_number,
            "intents": intents,
            "created_at": datetime.now(timezone.utc).isoformat()
        }).execute()
    except Exception as e:
        print(f"Database Insert Error: {e}")

async def store_metrics(user_id: str, session_id: str, 
    save_ms: float, asr_ms: float, cleaning_ms: float, gpt_ms: float, ors_ms: float, intent_detect_ms: float, final_json_ms: float, network_overhead_ms: float, total_turnaround_ms: float):
    """
    Stores response time metrics for each processing stage of the user's request.

    Table: performance_logs
    """

    try:
        supabase.table("performance_logs").insert({
            "user_id": user_id,
            "session_id": session_id,
            "save_ms": int(save_ms),
            "asr_ms": int(asr_ms),
            "cleaning_ms": int(cleaning_ms),
            "gpt_ms": int(gpt_ms),
            "ors_ms": int(ors_ms),
            "intent_detect_ms": int(intent_detect_ms),
            "final_json_ms": int(final_json_ms),
            "network_overhead_ms": int(network_overhead_ms),
            "total_turnaround_ms": int(total_turnaround_ms),
            "created_at": datetime.now(timezone.utc).isoformat()
        }).execute()
    except Exception as e:
        print(f"Error storing metrics: {e}")

async def log_final_json(user_id: str, session_id: str, payload: Dict[str, Any]):
    """
    Stores the final JSON payload for each user request.

    Table: final_json_logs
    """

    try:
        supabase.table("final_json_logs").insert({
            "user_id": user_id,
            "session_id": session_id,
            "json_payload": payload,
            "created_at": datetime.now(timezone.utc).isoformat()
        }).execute()
    except Exception as e:
        print("Final JSON logging failed:", e)

async def log_preference(user_id: str, session_id: str, preference_type: str, preference_value: str, is_accepted: bool):
    """
    Stores user preference information.

    Table: preference_logs
    """
    
    try:
        supabase.table("preference_logs").insert({
            "user_id": user_id,
            "session_id": session_id,
            "preference_type": preference_type,
            "preference_value": preference_value,
            "is_accepted": is_accepted,
            "created_at": datetime.now(timezone.utc).isoformat()
        }).execute()
    except Exception as e:
        print("Preference logging failed:", e)

async def log_route_details(user_id: str, session_id: str, event_type: str, origin: str, destination: str, option: str, via: str, distance: str, duration: str):
    """
    Stores detailed information about the route generated for the user, including origin, destination,
    route option, via road, distance, and duration.

    Table: route_logs
    """
    
    try:
        supabase.table("route_logs").insert({
            "user_id": user_id,
            "session_id": session_id,
            "event_type": event_type,
            "origin": origin,
            "destination": destination,
            "route_option": option,
            "via_road": via,
            "distance": distance,
            "duration": duration,
            "created_at": datetime.now(timezone.utc).isoformat()
        }).execute()
    except Exception as e:
        print("Route logging failed:", e)

async def log_session_metadata(user_id: str, session_id: str, device: str, network: str):
    """
    Stores detailed information about the user's session, including device and network details.

    Table: session_metadata
    """

    try:
        supabase.table("session_metadata").insert({
            "user_id": user_id,
            "session_id": session_id,
            "device_model": device,
            "connection_type": network,
            "created_at": datetime.now(timezone.utc).isoformat()
        }).execute()
    except Exception as e:
        print(f"Metadata logging failed: {e}")

async def log_event(*, user_id: str, session_id: str, event_type: str, response: str, turn_number: int):
    """
    Logs system or user events. 
    To track user interactions, monitor system behaviour, and enable analytics and debugging.

    Table: user_events
    """

    try:
        supabase.table("user_events").insert({
            "user_id": user_id,
            "session_id": session_id,
            "event_type": event_type,
            "response": response,
            "turn_number": turn_number,
            "created_at": datetime.now(timezone.utc).isoformat()
        }).execute()
    except Exception as e:
        # Logging should NEVER break navigation
        print("Event logging failed:", e)

async def log_system_error(user_id: str, session_id: str, function_name: str, error_msg: str, error_type: str, payload: dict | None = None):
    """
    Logs system errors with detailed information for debugging and monitoring.

    Table: system_errors
    """

    try:
        supabase.table("system_errors").insert({
            "user_id": user_id,
            "session_id": session_id,
            "function_name": function_name,
            "error_message": error_msg,
            "error_type": error_type,
            "error_payload": payload or {},
            "created_at": datetime.now(timezone.utc).isoformat()
        }).execute()
    except Exception as e:
        print(f"CRITICAL: Logging failed: {e}")

async def load_polygons(road_name):
    """
    Retrieves stored road polygons from the database.

    Returns:
        List of Shapely geometries.
        None if no polygons found for the road_name.
    """

    response = (
        supabase
        .table("avoid_road_polygons")
        .select("geometry")
        .eq("road_name", road_name.lower())
        .execute()
    )

    if not response.data:
        return None

    # Load the WKB as a MultiPolygon object
    geom = wkb.loads(bytes.fromhex(response.data[0]["geometry"]))
    
    # Ensure it returns as a MultiPolygon even if stored as a single Polygon
    if geom.geom_type == 'Polygon':
        return MultiPolygon([geom])
    return geom

async def store_polygons(road_name, multi_poly):
    """
    Stores road polygons in database.

    Table: avoid_road_polygons
    """

    row = {
        "road_name": road_name.lower(), # Normalize for the case-insensitive constraint
        "geometry": wkb.dumps(multi_poly, hex=True)
    }
    supabase.table("avoid_road_polygons").upsert(row).execute()

async def load_saved_places(user_id: str):
    """
    Retrieves a stored place (latitude and longitude) for a given user and label.

    Returns:
        dict {lat, lng} if found, else None
    """

    try:
        response = (
            supabase
            .table("places")
            .select("label, latitude, longitude")
            .eq("user_id", user_id)
            .execute()
        )
        # Store as a dict for O(1) lookup: {"home": {"lat": 1.1, "lng": 2.2}}
        return {
            row["label"].lower(): {"lat": row["latitude"], "lng": row["longitude"]} 
            for row in response.data
        } if response.data else {}
    
    except Exception as e:
        print(f"Error fetching labels: {e}")
        return {}

async def store_place(user_id: str, label: str, latitude: float, longitude: float):
    """
    Stores or updates a user-defined place.

    Example:
        "home" -> coordinates of user's home
    """

    supabase.table("places").upsert({
        "user_id": user_id,
        "label": label.lower(),
        "latitude": latitude,
        "longitude": longitude
    }).execute()

async def load_most_used_item(
    table_name: str,
    select_field: str,
    user_id: str,
    destination_label: str,
    min_usage: int = 2
):
    """
    Generic function to load the most used item (e.g. road, route option) for a user and destination.

    Returns:
        Most used item (e.g. road name) if it meets the minimum usage threshold and is not tied with another item.
        None if no data, below threshold, or tie.
    """

    response = (
        supabase
        .table(table_name)
        .select(f"{select_field}, usage_count")
        .eq("user_id", user_id)
        .eq("destination_label", destination_label.lower())
        .execute()
    )

    rows = response.data or []
    if not rows:
        return None

    max_count = max(r["usage_count"] for r in rows)

    # Minimum confidence threshold
    if max_count < min_usage:
        return None

    # Check for tie
    top = [r for r in rows if r["usage_count"] == max_count]
    if len(top) != 1:
        return None

    return top[0][select_field]

async def increment_usage(
    table_name: str,
    key_field: str,
    key_value: str,
    user_id: str,
    destination_label: str
):
    """
    Updates usage count for personalization tracking.
    """

    destination_label = destination_label.lower()

    existing = (
        supabase
        .table(table_name)
        .select("usage_count")
        .eq("user_id", user_id)
        .eq("destination_label", destination_label)
        .eq(key_field, key_value)
        .execute()
    )

    if existing.data:
        new_count = existing.data[0]["usage_count"] + 1

        supabase.table(table_name).update({
            "usage_count": new_count,
            "last_used": "now()"
        }) \
        .eq("user_id", user_id) \
        .eq("destination_label", destination_label) \
        .eq(key_field, key_value) \
        .execute()
    else:
        supabase.table(table_name).insert({
            "user_id": user_id,
            "destination_label": destination_label,
            key_field: key_value,
            "usage_count": 1
        }).execute()

async def load_most_used_road(user_id: str, destination_label: str):
    """
    Returns the most frequently used road for a user and destination.
    """

    return await load_most_used_item(
        table_name="route_familiarity",
        select_field="major_road",
        user_id=user_id,
        destination_label=destination_label
    )

async def store_route_familiarity(user_id: str, destination_label: str, major_road: str):
    """
    Tracks frequently used roads for a user and destination to personalize future route suggestions.
    """

    await increment_usage(
        table_name="route_familiarity",
        key_field="major_road",
        key_value=major_road,
        user_id=user_id,
        destination_label=destination_label
    )

async def load_most_avoided_road(user_id: str, destination_label: str):
    """
    Returns the most frequently avoided road for a user and destination.
    """

    return await load_most_used_item(
        table_name="route_avoidance",
        select_field="avoided_road",
        user_id=user_id,
        destination_label=destination_label
    )

async def store_route_avoidance(user_id: str, destination_label: str, avoided_road: str):
    """
    Tracks frequently avoided roads for a user and destination to personalize future route suggestions.
    """

    await increment_usage(
        table_name="route_avoidance",
        key_field="avoided_road",
        key_value=avoided_road,
        user_id=user_id,
        destination_label=destination_label
    )

async def load_most_preferred_option(user_id: str, destination_label: str):
    """
    Returns the most preferred route option for a user and destination.
    """

    return await load_most_used_item(
        table_name="route_option_preference",
        select_field="route_option",
        user_id=user_id,
        destination_label=destination_label
    )

async def store_route_option_preference(user_id: str, destination_label: str, route_option: str):
    """
    Tracks the user's preference for different route options.
    """

    await increment_usage(
        table_name="route_option_preference",
        key_field="route_option",
        key_value=route_option,
        user_id=user_id,
        destination_label=destination_label
    )

async def store_trip(
    user_id: str,
    origin_coords: any,
    destination_coords: any,
    via_road_name: str,
    route_option: str,
    avoid_roads: list[str] = None,
    avoid_features: list[str] = None,
    origin_name: str = None,
    destination_name: str = None
):
    """
    Stores a complete trip log including coordinate arrays and avoidance lists.
    """
    
    # Helper to ensure we send [lat, lng] to Postgres
    def format_coords(c):
        if isinstance(c, dict):
            return [c.get("lat"), c.get("lng")]
        return c  # Assume it's already a list or None
    try:
        row = {
            "user_id": user_id,
            "origin_coords": format_coords(origin_coords),
            "destination_coords": format_coords(destination_coords),
            "origin_name": origin_name,
            "destination_name": destination_name,
            "via_road_name": via_road_name,
            "route_option": route_option,
            "avoid_roads": avoid_roads or [],
            "avoid_features": avoid_features or [],
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        
        supabase.table("trip_history").insert(row).execute()
    except Exception as e:
        print(f"Error storing trip: {e}")

async def load_trip_history(user_id: str, limit: int = 10):
    """
    Retrieves the most recent trips for a specific user.
    """
    try:
        response = (
            supabase
            .table("trip_history")
            .select("*")
            .eq("user_id", user_id)
            .order("created_at", descending=True)
            .limit(limit)
            .execute()
        )
        return response.data
    except Exception as e:
        print(f"Error loading trips: {e}")
        return []

import os
import json

POINTS_CACHE_FILE = os.path.join(os.path.dirname(__file__), "road_points_cache.json")

async def load_road_points(road_name: str) -> list:
    """
    Retrieves stored road centerline points for Mapbox avoidance.
    """
    if os.path.exists(POINTS_CACHE_FILE):
        try:
            with open(POINTS_CACHE_FILE, "r") as f:
                cache = json.load(f)
                return cache.get(road_name.lower())
        except Exception:
            pass
    return None

async def store_road_points(road_name: str, points: list):
    """
    Stores road centerline points for Mapbox avoidance.
    """
    cache = {}
    if os.path.exists(POINTS_CACHE_FILE):
        try:
            with open(POINTS_CACHE_FILE, "r") as f:
                cache = json.load(f)
        except Exception:
            pass
    cache[road_name.lower()] = points
    try:
        with open(POINTS_CACHE_FILE, "w") as f:
            json.dump(cache, f)
    except Exception as e:
        print(f"Failed to write road points cache: {e}")    