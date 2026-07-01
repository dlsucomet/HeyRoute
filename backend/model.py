"""
This module implements the core backend service of HeyRoute.

Handles:
    - Processing of user voice input (transcript)
    - Semantic place resolution (e.g., understanding "home", "work", "current location")
    - Intent detection using GPT
    - Managing conversational state and trip context
    - Interfacing with OpenRouteService for route generation
    - Learning user preferences over time (e.g., route options, road avoidance, familiarity)
"""

import asyncio
import json
import time
import string
from fastapi import FastAPI, HTTPException, Header, Request
from pydantic import BaseModel
from typing import Optional, Dict
from dotenv import load_dotenv
from llm_gpt import process_with_gpt
from adapters.google_routes_adapter import GoogleRoutesAdapter
from adapters.openrouteservice_adapter import OpenRouteServiceAdapter
from helpers import build_gpt_prompt, normalize_road_name, format_heyroute_response, format_alternates_response, check_label_role, resolve_collisions, toll_roads, extract_json
from prompts import SYSTEM_PROMPT, CLARIFICATIONS_PROMPT, TRIP_CHANGES_PROMPT, INTENTS_PROMPT, NAVIGATION_INTENTS_PROMPT, PREFERENCE_INTENTS_PROMPT, SEMANTICS_PROMPT
from db import log_event, log_system_error, log_final_json, log_preference, log_route_details, load_saved_places, store_trip, load_most_used_road, store_route_familiarity, load_most_avoided_road, store_route_avoidance, load_most_preferred_option, store_route_option_preference

# Load environment variables from .env file
load_dotenv()

app = FastAPI()
google_adapter = GoogleRoutesAdapter()
ors_adapter = OpenRouteServiceAdapter()
SESSIONS = {}

# ------------------- Request Model -------------------
class TranscriptRequest(BaseModel):
    """
    Represents a user voice input request.

    transcript: The transcribed user speech input
    origin: optional currect location (lat, lng)
    """

    transcript: str
    origin: Optional[Dict[str, float]] = None

# ------------------- Global Conversation State -------------------
class SessionState:
    """
    Maintains the conversational and navigation of a user session.

    Attributes:
        1. conversation_history: List of all user and assistant messages in the current session

        2. turn_count: Number of user turns taken in the current session

        3. routes_data: List of generated route options. 
        
        4. current_route_params: The active routing parameters (origin, destination, via, avoid).
        
        5. final_gpt_response: The final JSON response from GPT containing the parsed trip details

        6. primary_route: The currently selected primary route from the generated options
        
        7. route_created: Flag indicating route generation completion
        
        8. pending_preference: Tracks if user preference confirmation is needed and what type (route option, avoidance, familiarity)
        
        9. current_location: The user's current location (lat, lng) updated in real-time during navigation
        
        10. navigation_started: Indicates active navigation state
        
        11. semantic_context: A dictionary to track the semantic context (e.g., "home" or "work")
    """

    def __init__(self):
        self.conversation_history = []
        self.turn_count = 0
        self.routes_data = []
        self.current_route_params = {}
        self.final_gpt_response = None
        self.primary_route = None
        self.route_created = False
        self.pending_preference = True
        self.current_location = None
        self.navigation_started = False

        self.semantic_context = {
            "origin_label": None,        # "home", "work", etc.
            "destination_label": None,
            "origin_known": False,
            "destination_known": False,
            "origin_value": None,        # actual address / coords
            "destination_value": None
        }

    def increment_turn(self):
        """
        Increments the turn count and returns the updated value.
        """

        self.turn_count += 1
        return self.turn_count

    def clear_trip_context(self):
        """
        Wipes trip-specific data while keeping the session container alive.
        """

        self.conversation_history = []
        self.turn_count = 0
        self.routes_data = []
        self.current_route_params = {}
        self.final_gpt_response = None
        self.primary_route = None
        self.route_created = False
        self.pending_preference = True
        self.navigation_started = False
        
        self.semantic_context = {
            "origin_label": None,
            "destination_label": None,
            "origin_known": False,
            "destination_known": False,
            "origin_value": None,
            "destination_value": None
        }

# ------------------- Trip Complete Endpoint -------------------
@app.post("/end_trip")
async def end_trip(session_id: str = Header(None, alias="X-Session-ID")):
    """
    Ends the current trip and clears the session state for the given session ID.
    """
    
    state = SESSIONS.get(session_id)
    if not state:
        raise HTTPException(status_code=404, detail="Session not found")
    state.clear_trip_context()
    return {"status": "success", "message": "Trip context cleared"}

# ------------------- Manual Reroute Endpoint -------------------
@app.post("/directions/reroute")
async def directions(request: Request, session_id: str = Header(None, alias="X-Session-ID")):
    """
    Generates updated routes based on the user's current location during navigation.

    Used when user deviates from route and manual reroute is triggered.
    """

    state = SESSIONS.get(session_id)
    if not state:
        raise HTTPException(status_code=404, detail="Session not found")

    payload = await request.json()
    new_lat = payload.get("lat")
    new_lng = payload.get("lng")

    if new_lat and new_lng:
        state.current_location = {"lat": new_lat, "lng": new_lng}

    try:
        active_adapter = ors_adapter if state.current_route_params.get("avoid_roads") else google_adapter
        routes, ors_latency = await active_adapter.get_directions(
            origin=state.current_location,
            destination=state.current_route_params.get("destination"),
            option=state.current_route_params.get("option"),
            via=state.current_route_params.get("via"),
            avoid_roads=state.current_route_params.get("avoid_roads"),
            avoid_features=state.current_route_params.get("avoid_features")
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Routing engine error: {str(e)}")

    if not routes:
        return {"error": "No new routes found from current location"}
    
    primary_route = routes[0]
    alternatives = routes[1:]
    state.routes_data = routes
    state.primary_route = primary_route

    return {"primary_route": primary_route, "alternatives": alternatives, "ors_latency": ors_latency}

# ------------------- Main API Endpoint -------------------
"""
Main API endpoint of the HeyRoute App.

1. Managers user session lifecycle
2. Processes voice input (transcript)
3. Performas semantic place resolution
4. Detects user intent using GPT
5. Handles various intents:
    - Clarifications
    - Trip setup
    - Route generation
    - Preference learning
    - Navigation execution

Returns conversational response and route data.
"""

@app.post("/heyroute/")
async def heyroute(payload: TranscriptRequest, user_id: str = Header(None, alias="X-User-ID"), session_id: str = Header(None, alias="X-Session-ID")):
    try:
        # If no session exists, create one now
        if session_id not in SESSIONS:
            SESSIONS[session_id] = SessionState()
        state = SESSIONS.get(session_id)
        if not state:
            raise HTTPException(status_code=404, detail="Invalid session")
        state.current_location = payload.origin

        current_turn = state.increment_turn()
        user_input = payload.transcript.strip()
        if not user_input:
            raise HTTPException(status_code=400, detail="Empty transcript received.")
        state.conversation_history.append({"role": "user", "content": user_input})
        
        # ----------  Semantic Resolution ----------
        state.semantic_context = await resolve_semantic_places(user_input, state.semantic_context, user_id)

        # ---------- Intent Detection ----------
        intent_mode = ""

        if state.pending_preference and state.final_gpt_response:
            intent_mode = "PREFERENCE_CONFIRMATION"
        elif state.navigation_started:
            intent_mode = "NAVIGATION"
        else:
            intent_mode = "SETUP"
        intents, intent_detect_latency = await detect_intent(user_input, intent_mode, state.conversation_history, state.semantic_context, user_id, session_id)
        intents = await resolve_collisions(intents)

        # ---------- Handle Clarifications ----------
        if intents.get("clarifications"):
            prompt = await build_gpt_prompt(SYSTEM_PROMPT, CLARIFICATIONS_PROMPT,
                                        f"The conversation so far:\n" +
                                        "\n".join(f"User: {m['content']}" if m["role"] == "user"
                                                    else f"Assistant: {m['content']}" for m in state.conversation_history) +
                                        f"\n\nLatest user message: {user_input}")
            response, gpt_latency = await process_with_gpt(prompt)
            state.conversation_history.append({"role": "assistant", "content": response})
            asyncio.create_task(log_event(user_id=user_id, session_id=session_id, event_type="CLARIFICATION_PROVIDED", response=response, turn_number=current_turn))
            return {"heyroute": response, "history": state.conversation_history, "turn_number": current_turn, "intents": intents, "intent_detect_latency": intent_detect_latency, "gpt_latency": gpt_latency, "user_id": user_id, "session_id": session_id}

        # ---------- Handle Cancellation ----------
        elif intents.get("cancellation"):
            response = "Okay, I've cancelled your trip. Let me know if you'd like to start a new one later."
            state.conversation_history.append({"role": "assistant", "content": response})

            # Clears all trip context but keep session alive for future conversations.
            state.clear_trip_context()
            asyncio.create_task(log_event(user_id=user_id, session_id=session_id, event_type="NAVIGATION_CANCELLED", response=response, turn_number=current_turn))
            
            return {"heyroute": response, "history": state.conversation_history, "turn_number": current_turn, "intents": intents, "intent_detect_latency": intent_detect_latency, "user_id": user_id, "session_id": session_id, "navigation_started": False}

        # ---------- Handle End Navigation Setup ----------
        elif intents.get("generate_routes") or intents.get("trip_changes"):
            final_response = ""
            if intents.get("trip_changes"):
                if state.semantic_context["destination_known"]:
                    final_json_prompt = [
                        {"role": "system", "content": SYSTEM_PROMPT},
                        {"role": "system", "content": TRIP_CHANGES_PROMPT},
                        {"role": "system", "content": SEMANTICS_PROMPT},
                        {"role": "user", "content": (
                            "The conversation so far is:\n" +
                            "\n".join(f"User: {m['content']}" if m["role"] == "user" else f"Assistant: {m['content']}"
                                    for m in state.conversation_history) +
                            f"\n\ndestination_known = {state.semantic_context['destination_known']}" +
                            "\n\nPlease output the final travel JSON now."
                        )}
                    ]
                else:
                    final_json_prompt = [
                        {"role": "system", "content": SYSTEM_PROMPT},
                        {"role": "system", "content": TRIP_CHANGES_PROMPT},
                        {"role": "user", "content": (
                            "The conversation so far is:\n" +
                            "\n".join(f"User: {m['content']}" if m["role"] == "user" else f"Assistant: {m['content']}"
                                    for m in state.conversation_history) +
                            "\n\nPlease output the final travel JSON now."
                        )}
                    ]
                final_response, final_json_latency = await process_with_gpt(final_json_prompt)
            else:
                if state.semantic_context["destination_known"]:
                    final_json_prompt = [
                        {"role": "system", "content": SYSTEM_PROMPT},
                        {"role": "system", "content": SEMANTICS_PROMPT},
                        {"role": "user", "content": (
                            "The conversation so far is:\n" +
                            "\n".join(f"User: {m['content']}" if m["role"] == "user" else f"Assistant: {m['content']}"
                                    for m in state.conversation_history) +
                            f"\n\ndestination_known = {state.semantic_context['destination_known']}" +
                            "\n\nPlease output the final travel JSON now."
                        )}
                    ]
                else:
                    final_json_prompt = [
                        {"role": "system", "content": SYSTEM_PROMPT},
                        {"role": "user", "content": (
                            "The conversation so far is:\n" +
                            "\n".join(f"User: {m['content']}" if m["role"] == "user" else f"Assistant: {m['content']}"
                                    for m in state.conversation_history) +
                            "\n\nPlease output the final travel JSON now."
                        )}
                    ]
                final_response, final_json_latency = await process_with_gpt(final_json_prompt)

            try:
                state.final_gpt_response = json.loads(extract_json(final_response))
                asyncio.create_task(log_final_json(user_id=user_id, session_id=session_id,
                    payload={
                        "origin": state.final_gpt_response.get("origin"),
                        "destination": state.final_gpt_response.get("destination"),
                        "via": state.final_gpt_response.get("via"),
                        "avoid": state.final_gpt_response.get("avoid"),
                        "option": state.final_gpt_response.get("option")
                    }
                ))

                # ---------- Fetch Routes ----------
                origin_coords = None
                destination_coords = None
                destination = None
                tasks = []
                task_mapping = {}

                # Origin
                if state.semantic_context["origin_known"]:
                    origin_coords = state.semantic_context["origin_value"]
                    state.final_gpt_response["origin"] = state.semantic_context["origin_label"]
                else:
                    origin = state.final_gpt_response.get("origin")
                    if origin == "current location" and state.current_location:
                        origin_coords = state.current_location
                    else:
                        task_mapping["origin"] = len(tasks)
                        tasks.append(google_adapter.geocode(origin))

                # Destination
                if state.semantic_context["destination_known"]:
                    destination_coords = state.semantic_context["destination_value"]
                    state.final_gpt_response["destination"] = state.semantic_context["destination_label"]
                    destination = state.final_gpt_response["destination"]
                else:
                    destination = state.final_gpt_response["destination"]
                    task_mapping["destination"] = len(tasks)
                    tasks.append(google_adapter.geocode(destination))

                # Via points
                via_coords = []
                via_input = state.final_gpt_response.get("via")
                if via_input:
                    task_mapping["via_start"] = len(tasks)
                    for place in via_input:
                        if place.strip():
                            tasks.append(google_adapter.geocode(place.strip()))

                start_time = time.perf_counter()
                results = await asyncio.gather(*tasks)
                end_time = time.perf_counter()
                geocode_latency = (end_time - start_time) * 1000

                if "origin" in task_mapping:
                    origin_coords = results[task_mapping["origin"]]
                if "destination" in task_mapping:
                    destination_coords = results[task_mapping["destination"]]
                if "via_start" in task_mapping:
                    # Everything from via_start to the end of results belongs to 'via'
                    via_coords = [r for r in results[task_mapping["via_start"]:] if r]

                if not origin_coords or not destination_coords:
                    response  = "I couldn't find your destination. Could you be more specific?"
                    state.conversation_history.append({"role": "assistant", "content": response})
                    await log_system_error(
                        user_id, session_id, "geocoding_zero_results", 
                        "Geocoder returned null for origin or destination",
                        type(e).__name__,
                        {"gpt_json": state.final_gpt_response}
                    )
                    return {"heyroute": response, "history": state.conversation_history, "turn_number": current_turn, "intents": intents, "intent_detect_latency": intent_detect_latency, "final_json_latency": final_json_latency, "user_id": user_id, "session_id": session_id}

                # Avoid roads/features
                avoid_roads = []
                avoid_features = []
                avoid_input = state.final_gpt_response.get("avoid")
                if avoid_input:
                    for item in avoid_input:
                        item = item.strip().lower()
                        if item in ["highways", "tollways", "ferries"]:
                            avoid_features.append(item)
                        else:
                            normalized_road = await normalize_road_name(item)
                            if normalized_road in toll_roads:
                                avoid_features.append("tollways")
                            else:
                                avoid_roads.append(normalized_road)
                avoid_features = list(set(avoid_features))
                route_option = state.final_gpt_response.get("option", "recommended")

                most_preferred_option = await load_most_preferred_option(user_id, destination)
                most_avoided_road = await load_most_avoided_road(user_id, destination)
                most_used_road = await load_most_used_road(user_id, destination)

                state.current_route_params = {
                    "origin": origin_coords,
                    "destination": destination_coords,
                    "option": route_option,
                    "via": via_coords,
                    "avoid_roads": avoid_roads,
                    "avoid_features": avoid_features
                }

                if state.pending_preference:
                    # Case 1: Route Option
                    if most_preferred_option:
                        state.pending_preference = "route_option"
                        response = (
                            f"You usually take the {most_preferred_option} route for this trip. "
                            f"Do you want me to use the {most_preferred_option} route?"
                        )
                        state.conversation_history.append({"role": "assistant", "content": response})
                        asyncio.create_task(log_event(user_id=user_id, session_id=session_id, event_type="PREFERENCE_PROMPTED", response=response, turn_number=current_turn))
                        return {"heyroute": response, "history": state.conversation_history, "turn_number": current_turn, "intents": intents, "intent_detect_latency": intent_detect_latency, "final_json_latency": final_json_latency, "geocode_latency": geocode_latency, "user_id": user_id, "session_id": session_id}
                    
                    # Case 2: Route Avoidance
                    elif not avoid_input and most_avoided_road:
                        state.pending_preference = "avoid"
                        response = (
                            f"You usually avoid {most_avoided_road} on this trip. "
                            f"Do you want me to avoid it again?"
                        )
                        state.conversation_history.append({"role": "assistant", "content": response})
                        asyncio.create_task(log_event(user_id=user_id, session_id=session_id, event_type="PREFERENCE_PROMPTED", response=response, turn_number=current_turn))
                        return {"heyroute": response, "history": state.conversation_history, "turn_number": current_turn, "intents": intents, "intent_detect_latency": intent_detect_latency, "final_json_latency": final_json_latency, "geocode_latency": geocode_latency, "user_id": user_id, "session_id": session_id}
                    
                    # Case 3: Route Familiarity
                    elif most_used_road:
                        state.pending_preference = "familiarity"
                        response = (
                            f"You usually take the route {most_used_road}. "
                            f"Do you want me to use it again?"
                        )
                        state.conversation_history.append({"role": "assistant", "content": response})
                        asyncio.create_task(log_event(user_id=user_id, session_id=session_id, event_type="PREFERENCE_PROMPTED", response=response, turn_number=current_turn))
                        return {"heyroute": response, "history": state.conversation_history, "turn_number": current_turn, "intents": intents, "intent_detect_latency": intent_detect_latency, "final_json_latency": final_json_latency, "geocode_latency": geocode_latency, "user_id": user_id, "session_id": session_id}
                    
                state.routes_data, state.primary_route, response = await generate_route_and_response(user_id, session_id, origin_coords, destination_coords, route_option, via_coords, avoid_roads, avoid_features, state.final_gpt_response, state.navigation_started)
                state.route_created = True
                state.pending_preference = False
                state.conversation_history.append({"role": "assistant", "content": response.get("heyroute")})
                response["final_json_latency"] = final_json_latency
                response["geocode_latency"] = geocode_latency
                response["intent_detect_latency"] = intent_detect_latency
                response["history"] = state.conversation_history
                response["turn_number"] = current_turn
                response["intents"] = intents
                asyncio.create_task(log_event(user_id=user_id, session_id=session_id, event_type="ROUTES_CREATED_RESPONSE", response=response.get("heyroute"), turn_number=current_turn))
                return response
            except (json.JSONDecodeError, TypeError):
                await log_system_error(
                    user_id, session_id, "llm_json_format_error", 
                    "LLM failed to return valid JSON", 
                    type(e).__name__,
                    {"raw_response": final_response, "input": user_input, "turn_number": current_turn}
                )
                response = "I'm sorry, I couldn't understand the travel details. Could you please clarify?"
                state.conversation_history.append({"role": "assistant", "content": response})
                return {"heyroute": response, "history": state.conversation_history, "turn_number": current_turn, "intents": intents, "intent_detect_latency": intent_detect_latency, "final_json_latency": final_json_latency, "user_id": user_id, "session_id": session_id}

        # ---------- Handle Preference Remembering ----------
        elif intents.get("preference_remembering"):
            road = ""
            params = state.current_route_params
            destination = None
            if state.semantic_context["destination_known"]:
                destination = state.semantic_context["destination_label"]
            else:
                destination = state.final_gpt_response["destination"]

            if state.pending_preference == "route_option":
                most_preferred_option = await load_most_preferred_option(user_id, destination)
                params["option"] = most_preferred_option
                preference_value = most_preferred_option
                state.current_route_params["option"] = most_preferred_option
            elif state.pending_preference == "avoid":
                most_avoided_road = await load_most_avoided_road(user_id, destination)
                preference_value = most_avoided_road
                if most_avoided_road in toll_roads:
                    params["avoid_features"].append("tollways")
                    state.current_route_params["avoid_features"].append("tollways")
                else:
                    params["avoid_roads"].append(most_avoided_road)
                    state.current_route_params["avoid_roads"].append(most_avoided_road)
            elif state.pending_preference == "familiarity":
                most_used_road = await load_most_used_road(user_id, destination)
                preference_value = most_used_road
                road = most_used_road

            state.routes_data, state.primary_route, response = await generate_route_and_response(user_id, session_id, params["origin"], params["destination"], params["option"], params["via"], params["avoid_roads"], params["avoid_features"], state.final_gpt_response, state.navigation_started, road)
            state.route_created = True
            state.conversation_history.append({"role": "assistant", "content": response.get("heyroute")})
            response["intent_detect_latency"] = intent_detect_latency
            response["history"] = state.conversation_history
            response["turn_number"] = current_turn
            response["intents"] = intents
            asyncio.create_task(log_event(user_id=user_id, session_id=session_id, event_type="ROUTES_CREATED_RESPONSE", response=response.get("heyroute"), turn_number=current_turn))
            asyncio.create_task(log_preference(user_id=user_id, session_id=session_id, 
                preference_type=state.pending_preference, preference_value=preference_value, is_accepted=True
            ))
            state.pending_preference = False
            return response
        
        # User says No to preference remembering
        elif intents.get("no_preference_remembering"):
            params = state.current_route_params
            destination = None
            if state.semantic_context["destination_known"]:
                destination = state.semantic_context["destination_label"]
            else:
                destination = state.final_gpt_response["destination"]

            if state.pending_preference == "route_option":
                most_preferred_option = await load_most_preferred_option(user_id, destination)
                preference_value = most_preferred_option
            elif state.pending_preference == "avoid":
                most_avoided_road = await load_most_avoided_road(user_id, destination)
                preference_value = most_avoided_road
            elif state.pending_preference == "familiarity":
                most_used_road = await load_most_used_road(user_id, destination)
                preference_value = most_used_road

            state.routes_data, state.primary_route, response = await generate_route_and_response(user_id, session_id, params["origin"], params["destination"], params["option"], params["via"], params["avoid_roads"], params["avoid_features"], state.final_gpt_response, state.navigation_started)
            state.route_created = True
            state.conversation_history.append({"role": "assistant", "content": response.get("heyroute")})
            response["intent_detect_latency"] = intent_detect_latency
            response["history"] = state.conversation_history
            response["turn_number"] = current_turn
            response["intents"] = intents
            asyncio.create_task(log_event(user_id=user_id, session_id=session_id, event_type="ROUTES_CREATED_RESPONSE", response=response.get("heyroute"), turn_number=current_turn))
            asyncio.create_task(log_preference(user_id=user_id, session_id=session_id, 
                preference_type=state.pending_preference, preference_value=preference_value, is_accepted=False
            ))
            state.pending_preference = False
            return response
        
        # ---------- Handle Start Navigation ----------
        elif intents.get("start_nav"):
            if state.route_created and state.primary_route:
                origin = state.final_gpt_response.get("origin")
                destination = state.final_gpt_response["destination"]
                major_road = state.primary_route.get("via", "")
                avoid_list = state.final_gpt_response.get("avoid", [])
                route_option = state.current_route_params["option"]
                primary_route = state.primary_route
                alternatives = [r for r in state.routes_data if r != state.primary_route]

                asyncio.create_task(store_route_familiarity(user_id, destination, major_road))
                if route_option != "recommended":
                    asyncio.create_task(store_route_option_preference(user_id, destination, route_option))    
                if avoid_list:
                    asyncio.create_task(store_route_avoidance(user_id, destination, avoid_list))
                asyncio.create_task(store_trip(
                    user_id=user_id,
                    origin_coords=state.current_route_params["origin"],
                    destination_coords=state.current_route_params["destination"],
                    via_road_name=major_road,
                    route_option=route_option,
                    avoid_roads=avoid_list,
                    origin_name=origin,
                    destination_name=destination
                ))
                response = f"Starting navigation to {destination} now. Safe travels!"
                state.navigation_started = True
                state.conversation_history.append({"role": "assistant", "content": response})

                asyncio.create_task(log_event(user_id=user_id, session_id=session_id, event_type="NAVIGATION_STARTED", response=response, turn_number=current_turn))
                asyncio.create_task(log_route_details(
                    user_id=user_id,
                    session_id=session_id,
                    event_type="NAVIGATION_STARTED",
                    origin=state.final_gpt_response["origin"],
                    destination=state.final_gpt_response["destination"],
                    option=route_option,
                    via=major_road,
                    distance=state.primary_route.get("distance"),
                    duration=state.primary_route.get("duration")
                ))
                return {
                    "heyroute": response,
                    "preferences": {"route_option": route_option, "avoid_list": avoid_list, "major_road": major_road},
                    "history": state.conversation_history,
                    "turn_number": current_turn,
                    "intents": intents,
                    "intent_detect_latency": intent_detect_latency,
                    "navigation_started": True,
                    "route": primary_route,
                    "alternatives": alternatives,
                    "user_id": user_id,
                    "session_id": session_id
                }
            else:
                response = "I still don't have enough details to start navigation."
                state.conversation_history.append({"role": "assistant", "content": response})
                asyncio.create_task(log_event(user_id=user_id, session_id=session_id, event_type="MISSING_DETAILS", response=response, turn_number=current_turn))
                return {"heyroute": response, "history": state.conversation_history, "turn_number": current_turn, "intents": intents, "intent_detect_latency": intent_detect_latency, "user_id": user_id, "session_id": session_id}

        # ---------- Handle Request for Alternate Routes ----------
        elif intents.get("request_alternates") and state.routes_data:
            if state.navigation_started:
                # Generate new routes
                params = state.current_route_params
                state.routes_data, state.primary_route, response = await generate_route_and_response(user_id, session_id, state.current_location, params["destination"], params["option"], params["via"], params["avoid_roads"], params["avoid_features"], state.final_gpt_response, state.navigation_started)
                asyncio.create_task(log_event(user_id=user_id, session_id=session_id, event_type="NEW_ROUTES_CREATED_RESPONSE", response=response.get("heyroute"), turn_number=current_turn))
            
            route_summaries = []
            for idx, route in enumerate(state.routes_data, start=1):
                route_summaries.append({
                    "index": idx,
                    "via": route.get("via"),
                    "distance": route.get("distance"),
                    "duration": route.get("duration")
                })
            response = await format_alternates_response(route_summaries)
            state.conversation_history.append({"role": "assistant", "content": response})
            asyncio.create_task(log_event(user_id=user_id, session_id=session_id, event_type="ALTERNATE_ROUTES_REQUESTED", response=response, turn_number=current_turn))
            return {"heyroute": response, "history": state.conversation_history, "turn_number": current_turn, "intents": intents, "intent_detect_latency": intent_detect_latency, "user_id": user_id, "session_id": session_id}

        # ---------- Handle Route Selection ----------
        elif intents.get("select_route") and state.routes_data:
            select_route_prompt = [
                {"role": "system", "content": "Identify if the user selected a route among alternates."},
                {"role": "user", "content": (
                    f"The conversation so far:\n" +
                    "\n".join(f"User: {m['content']}" if m["role"] == "user"
                            else f"Assistant: {m['content']}" for m in state.conversation_history[1:]) +
                    f"\n\nLatest user message: {user_input}\n\n"
                    "Respond strictly in JSON as:\n"
                    "{ \"route_select\": <number> or null }"
                )}
            ]
            route_select_raw, gpt_latency = await process_with_gpt(select_route_prompt)
            try:
                route_select_data = json.loads(extract_json(route_select_raw))
                selected_index = route_select_data.get("route_select")
            except:
                selected_index = None

            if selected_index and isinstance(selected_index, int) and 1 <= selected_index <= len(state.routes_data):
                selected_route = state.routes_data[selected_index - 1]
                state.primary_route = selected_route
                alternatives = [r for r in state.routes_data if r != state.primary_route]
                
                if not state.navigation_started:
                    route_summary = {
                        "origin": state.final_gpt_response["origin"],
                        "destination": state.final_gpt_response["destination"],
                        "option": state.current_route_params["option"],
                        "via": selected_route.get("via"),
                        "distance": selected_route.get("distance"),
                        "duration": selected_route.get("duration")
                    }
                    response = await format_heyroute_response(route_summary)
                    state.conversation_history.append({"role": "assistant", "content": response})
                    asyncio.create_task(log_event(user_id=user_id, session_id=session_id, event_type="ROUTE_SELECTED", response=response, turn_number=current_turn))
                    asyncio.create_task(log_route_details(
                        user_id=user_id,
                        session_id=session_id,
                        event_type="ROUTE_SELECTED",
                        origin=route_summary.get("origin"),
                        destination=route_summary.get("destination"),
                        option=route_summary.get("option"),
                        via=route_summary.get("via"),
                        distance=route_summary.get("distance"),
                        duration=route_summary.get("duration")
                    ))
                    return {"heyroute": response, "history": state.conversation_history, "turn_number": current_turn, "intents": intents, "intent_detect_latency": intent_detect_latency, "gpt_latency": gpt_latency, "route_preview": True, "route": state.primary_route, "alternatives": alternatives, "user_id": user_id, "session_id": session_id}
                else:
                    response = "Switching to the selected route now."
                    state.conversation_history.append({"role": "assistant", "content": response})
                    asyncio.create_task(log_event(user_id=user_id, session_id=session_id, event_type="ROUTE_SELECTED_MID_NAV", response=response, turn_number=current_turn))
                    asyncio.create_task(log_route_details(
                        user_id=user_id,
                        session_id=session_id,
                        event_type="ROUTE_SELECTED_MID_NAV",
                        origin=state.final_gpt_response["origin"],
                        destination=state.final_gpt_response["destination"],
                        option=state.current_route_params["option"],
                        via=selected_route.get("via"),
                        distance=selected_route.get("distance"),
                        duration=selected_route.get("duration")
                    ))
                    return {"heyroute": response, "history": state.conversation_history, "turn_number": current_turn, "intents": intents, "intent_detect_latency": intent_detect_latency, "navigation_started": True, "switch_route": True, "route": state.primary_route, "alternatives": alternatives}
            else:
                response = "I couldn't understand which route you selected. Please specify the route number clearly."
                state.conversation_history.append({"role": "assistant", "content": response})
                asyncio.create_task(log_event(user_id=user_id, session_id=session_id, event_type="ROUTE_SELECTION_ERROR", response=response, turn_number=current_turn))
                return {"heyroute": response, "history": state.conversation_history, "turn_number": current_turn, "intents": intents, "intent_detect_latency": intent_detect_latency, "user_id": user_id, "session_id": session_id}

        # If the user tries to start a new trip while one is active, prompt them to cancel first
        elif intents.get("start_new_trip"):
            response = "To start a new trip, please cancel the current one first. Do you want me to cancel the current trip?"
            state.conversation_history.append({"role": "assistant", "content": response})
            asyncio.create_task(log_event(user_id=user_id, session_id=session_id, event_type="START_TRIP_MID_NAV", response=response, turn_number=current_turn))
            return {"heyroute": response, "history": state.conversation_history, "turn_number": current_turn, "intents": intents, "intent_detect_latency": intent_detect_latency, "user_id": user_id, "session_id": session_id}
        
        # Default response if no intent matched
        response = "I'm sorry, I don't know that one."
        state.conversation_history.append({"role": "assistant", "content": response})
        asyncio.create_task(log_event(user_id=user_id, session_id=session_id, event_type="NO_INTENTS_DETECTED", response=response, turn_number=current_turn))
        return {"heyroute": response, "history": state.conversation_history, "turn_number": current_turn, "intents": intents, "intent_detect_latency": intent_detect_latency, "user_id": user_id, "session_id": session_id}
    except Exception as e:
        # Capture both the error type and the message for better debugging
        await log_system_error(
            user_id, session_id, "global_heyroute_crash", 
            str(e),
            type(e).__name__,
            {"last_input": user_input, "turn": state.turn_count if 'state' in locals() else None}
        )
        return {"heyroute": "An internal error occurred. Please try again in a moment.", "error": True, "history": state.conversation_history, "turn_number": current_turn, "intents": intents}

# ------------------- Helper Functions -------------------
async def detect_intent(latest_input, mode, conversation_history, semantic_context, user_id, session_id):
    """
    Detects user intent using GPT-based classification.

    Modes:
    - SETUP: Initial trip planning
    - NAVIGATION: Active navigation phase
    - PREFERENCE_CONFIRMATION: Preference handling

    Returns:
        - A dictionary of detected intents (boolean flags)
        - Latency of the intent detection step
    """
    
    check_intents_prompt = []
    if mode == "PREFERENCE_CONFIRMATION":
        check_intents_prompt = [
            {"role": "system", "content": PREFERENCE_INTENTS_PROMPT},
            {"role": "user", "content": (
                f"The conversation so far:\n" +
                "\n".join(
                    f"User: {m['content']}" if m["role"] == "user" else f"Assistant: {m['content']}"
                    for m in conversation_history
                ) +
                f"\n\nLatest user message: {latest_input}")}
        ]
    elif mode == "NAVIGATION":
        check_intents_prompt = [
            {"role": "system", "content": NAVIGATION_INTENTS_PROMPT},
            {"role": "user", "content": (
                f"The user is currently in navigation mode.\n"
                f"The conversation so far:\n" +
                "\n".join(
                    f"User: {m['content']}" if m["role"] == "user" else f"Assistant: {m['content']}"
                    for m in conversation_history
                ) +
                f"\n\nLatest user message: {latest_input}")}
        ]
    elif mode == "SETUP":
        check_intents_prompt = [
            {"role": "system", "content": INTENTS_PROMPT},
            {"role": "system", "content": f"Known semantic places for this user: {semantic_context}"},
            {"role": "user", "content": (
                f"The conversation so far:\n" +
                "\n".join(
                    f"User: {m['content']}" if m["role"] == "user" else f"Assistant: {m['content']}"
                    for m in conversation_history
                ) +
                f"\n\nLatest user message: {latest_input}")}
        ]
    raw_intents, intent_detect_latency = await process_with_gpt(check_intents_prompt)
    
    # Guard: detect error strings from LLM failures
    if raw_intents.startswith("HeyRoute:"):
        print(f"[INTENT] LLM returned error string: {raw_intents}")
        asyncio.create_task(log_system_error(
            user_id=user_id, session_id=session_id,
            function_name="detect_intent_llm_error",
            error_msg=raw_intents, error_type="LLMError",
            payload={"mode": mode}
        ))
        if mode == "PREFERENCE_CONFIRMATION":
            return {"preference_remembering": False, "no_preference_remembering": False}, intent_detect_latency
        elif mode == "NAVIGATION":
            return {"request_alternates": False, "select_route": False, "cancellation": False, "start_new_trip": False}, intent_detect_latency
        else:
            return {k: False for k in ["clarifications","cancellation","generate_routes","trip_changes",
                           "start_nav","request_alternates","select_route"]}, intent_detect_latency

    try:
        parsed = json.loads(extract_json(raw_intents))
        print(f"[INTENT] Detected: {parsed}")
        return parsed, intent_detect_latency
    except Exception as e:
        print(f"[INTENT] JSON parse FAILED. Raw: {raw_intents[:500]}")
        # This logs when GPT returns text instead of the required JSON block
        asyncio.create_task(log_system_error(
            user_id=user_id,
            session_id=session_id,
            function_name="detect_intent_json_parse",
            error_msg=str(e),
            error_type=type(e).__name__,
            payload={"raw_gpt_output": raw_intents, "mode": mode}
        ))
        if mode == "PREFERENCE_CONFIRMATION":
            return {"preference_remembering": False, "no_preference_remembering": False}, intent_detect_latency
        elif mode == "NAVIGATION":
            return {"request_alternates": False, "select_route": False, "cancellation": False, "start_new_trip": False}, intent_detect_latency
        else:
            return {k: False for k in ["clarifications","cancellation","generate_routes","trip_changes",
                           "start_nav","request_alternates","select_route"]}, intent_detect_latency

async def resolve_semantic_places(user_input: str, semantic_context: dict, user_id: str):
    """
    Resolves semantic place references such as "home", "work", or "school".

    It detects labeled locations, retrieves stored coordinates if available, and updates semantic context to imrpove personalization.

    Returns:
        - Updated semantic context with resolved place labels and coordinates 
    """

    text = user_input.lower().translate(str.maketrans('', '', string.punctuation))
    saved_places = await load_saved_places(user_id)

    for place, coords in saved_places.items():
        is_origin, is_destination = await check_label_role(text, place)

        # origin patterns
        if is_origin:
            semantic_context["origin_label"] = place
            semantic_context["origin_known"] = True
            semantic_context["origin_value"] = coords

        # destination patterns
        if is_destination:
            semantic_context["destination_label"] = place
            semantic_context["destination_known"] = True
            semantic_context["destination_value"] = coords
    return semantic_context

async def generate_route_and_response(user_id, session_id, origin, destination, option, via, avoid_roads, avoid_features, final_gpt_response, navigation_started, road=""):
    """
    Fetch routes, prepare summary, generate HeyRoute conversational response.

    Returns: 
        routes_data: List of route options
        primary_route: Selected main route
        response: Conversational output for the user
    """
    routes_data = []
    ors_latency = 0.0
    normalized_option = (option or "recommended").strip().lower()
    if normalized_option not in {"recommended", "fastest", "shortest"}:
        normalized_option = "recommended"

    attempts = [
        {
            "label": "primary",
            "via": via,
            "avoid_roads": avoid_roads,
            "avoid_features": avoid_features,
        }
    ]

    if avoid_roads or avoid_features:
        attempts.append(
            {
                "label": "retry_without_avoid",
                "via": via,
                "avoid_roads": [],
                "avoid_features": [],
            }
        )

    if via:
        attempts.append(
            {
                "label": "retry_without_via",
                "via": [],
                "avoid_roads": [],
                "avoid_features": [],
            }
        )

    for attempt in attempts:
        try:
            active_adapter = ors_adapter if attempt["avoid_roads"] else google_adapter
            routes_data, ors_latency = await active_adapter.get_directions(
                origin=origin,
                destination=destination,
                option=normalized_option,
                via=attempt["via"],
                avoid_roads=attempt["avoid_roads"],
                avoid_features=attempt["avoid_features"],
            )
        except Exception as e:
            asyncio.create_task(
                log_system_error(
                    user_id=user_id,
                    session_id=session_id,
                    function_name="generate_route_exception",
                    error_msg=str(e),
                    error_type=type(e).__name__,
                    payload={
                        "attempt": attempt["label"],
                        "origin": origin,
                        "destination": destination,
                        "option": normalized_option,
                        "via": attempt["via"],
                        "avoid_roads": attempt["avoid_roads"],
                        "avoid_features": attempt["avoid_features"],
                        "ors_latency": ors_latency,
                    },
                )
            )
            response = (
                "I'm sorry, I'm having trouble connecting to the routing service right now. "
                "Please try again later."
            )
            return {"error": str(e)}, {}, {"heyroute": response, "ors_latency": ors_latency, "user_id": user_id, "session_id": session_id}

        if routes_data:
            break

        asyncio.create_task(
            log_system_error(
                user_id=user_id,
                session_id=session_id,
                function_name="generate_route_no_results",
                error_msg="No routes returned from ORS for this attempt",
                error_type="NoRouteFound",
                payload={
                    "attempt": attempt["label"],
                    "origin": origin,
                    "destination": destination,
                    "option": normalized_option,
                    "via": attempt["via"],
                    "avoid_roads": attempt["avoid_roads"],
                    "avoid_features": attempt["avoid_features"],
                    "ors_latency": ors_latency,
                },
            )
        )

    if not routes_data:
        response = "I found the locations, but I couldn't find a drivable route between them."
        return [], {}, {"heyroute": response, "ors_latency": ors_latency, "user_id": user_id, "session_id": session_id}
    
    primary_route = routes_data[0] if routes_data else {}
    if road:
        for route in routes_data:
            if road in route.get("via", "").lower():
                primary_route = route
    alternatives = [r for r in routes_data if r != primary_route]
    origin = final_gpt_response.get("origin")
    destination = final_gpt_response.get("destination")

    route_summary = {
        "origin": origin,
        "destination": destination,
        "option": normalized_option,
        "via": primary_route.get("via"),
        "distance": primary_route.get("distance"),
        "duration": primary_route.get("duration")
    }

    for route in routes_data:
        asyncio.create_task(log_route_details(
            user_id=user_id,
            session_id=session_id,
            event_type="ROUTE_GENERATED",
            origin=origin,
            destination=destination,
            option=normalized_option,
            via=route.get("via"),
            distance=route.get("distance"),
            duration=route.get("duration")
        ))

    response = ""
    if not navigation_started:
        response = await format_heyroute_response(route_summary)
    if origin == "current location":
        origin = "Your location"

    return routes_data, primary_route, {
        "heyroute": response, 
        "ors_latency": ors_latency, 
        "origin": origin, 
        "destination": destination, 
        "route_preview": True, 
        "route": primary_route, 
        "alternatives": alternatives, 
        "user_id": user_id, 
        "session_id": session_id
    }
