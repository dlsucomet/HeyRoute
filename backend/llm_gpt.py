"""
This module implements the GPT-based language model functionality for HeyRoute.

Handles:
    - Interfacing with the OpenRouter API to process user inputs and generate responses.
    - Providing a clean abstraction for sending conversation history and receiving GPT-generated replies.
"""

import httpx
import os
import time
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

async def process_with_gpt(conversation_history, model_name="openai/gpt-4o-mini"):
    """
    Sends a conversation history to the OpenRouter API and returns the generated response.

    Parameters:
        conversation_history: A list of dictionaries representing the conversation that represents the full conversation text and formatted as:
          [
                {"role": "system" | "user" | "assistant", "content": str},
                ...
            ]

        model_name (str, optional): Model name to use for generating the response (default is "openai/gpt-4o-mini"). 

    Returns:
        tuple: (str, float) The generated response from the GPT model and the time taken in milliseconds.
    """

    # Retrieve the API key from .env
    api_key = os.getenv("OPENROUTER_API_KEY")

    # Validate API key existence
    if not api_key:
        print("ERROR: OPENROUTER_API_KEY not found in environment!")
        return "HeyRoute: Sorry, I'm missing my API credentials.", 0.0
    
    start_time = time.perf_counter()

    try:  
        async with httpx.AsyncClient() as client:
            # HTTP headers required by OpenRouter API
            headers = {
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
                "HTTP-Referer": "http://localhost",
                "X-Title": "HeyRoute"
            }

            # Request payload containing model and conversation history
            data = {
                "model": model_name,
                "messages": conversation_history
            }

            # Send POST request to OpenRouter API
            response = await client.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers=headers,
                json=data
            )

            end_time = time.perf_counter()
            gpt_ms = (end_time - start_time) * 1000

            # Handle the API response and errors
            if response.status_code == 200:
                reply = response.json()['choices'][0]['message']['content']
                return reply.strip(), gpt_ms
            else:
                print(f"!!! OPENROUTER ERROR !!! Status: {response.status_code} | Body: {response.text}")
                return "HeyRoute: Sorry, I couldn't process that request.", gpt_ms
    except Exception as e:
        print(f"Unexpected Error: {e}")
        return "HeyRoute: Something went wrong on my end.", 0.0
