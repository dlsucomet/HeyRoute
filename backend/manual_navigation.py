"""
This module implements the manual navigation functionality for HeyRoute.

Handles:
    - Receiving manual navigation requests from the frontend.
    - Using GPT to extract the intent and clean the destination name.
"""

from fastapi import APIRouter
from pydantic import BaseModel
from llm_gpt import process_with_gpt
from helpers import extract_json

# Defines a new FastAPI router for handling manual navigation requests.
router = APIRouter()

# Pydantic model to validate incoming data for manual navigation requests.
class ManualInputNavigation(BaseModel):
    user_id: str
    destination: str

@router.post("/manual_navigation")
def manual_navigation(data: ManualInputNavigation):
    """
    Simple endpoint to handle manual navigation requests.
    It takes a destination as input and uses GPT to extract the intent and clean the destination name.

    Parameters:
        data (ManualInputNavigation): The input data containing user_id and destination. 

    Returns:
        dict: A response indicating the navigation status or any errors encountered.
    """
    
    destination = data.destination.strip()

    if len(destination) < 3:
        return {"error": "Destination too short."}

    # Create prompt for GPT
    conversation = [
        {
            "role": "system",
            "content": """
            You are HeyRoute, a navigation assistant.
            Extract clear travel intent.

            Respond ONLY in JSON:
            {
                "intent": "navigate",
                "destination": "<clean destination name>"
            }
            """
        },
        {
            "role": "user",
            "content": f"Can you take me to {destination}"
        }
    ]

    # Call GPT
    gpt_reply = process_with_gpt(conversation)

    # Try parsing JSON 
    import json
    try:
        parsed = json.loads(extract_json(gpt_reply))
    except:
        return {"error": "Invalid LLM response", "raw": gpt_reply}

    # Now call HeyRoute navigation logic
    if parsed.get("intent") == "navigate":
        return {
            "status": "navigation_started",
            "user_id": data.user_id,
            "destination": parsed.get("destination")
        }

    return {"error": "Could not determine navigation intent"}