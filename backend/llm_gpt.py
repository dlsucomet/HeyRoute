"""
This module implements the LLM functionality for HeyRoute.

Handles:
    - Interfacing with the self-hosted Qwen 2.5 server to process user inputs and generate responses.
    - Providing a clean abstraction for sending conversation history and receiving LLM-generated replies.
"""

import httpx
import os
import time
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Read Qwen server config from environment
QWEN_API_URL = os.getenv("QWEN_API_URL", "http://172.16.3.213:80/v1/chat/completions")
QWEN_MODEL_NAME = os.getenv("QWEN_MODEL_NAME", "Qwen/Qwen2.5-14B-Instruct")

async def process_with_gpt(conversation_history, model_name=None):
    """
    Sends a conversation history to the self-hosted Qwen LLM server and returns the generated response.

    Parameters:
        conversation_history: A list of dictionaries representing the conversation formatted as:
          [
                {"role": "system" | "user" | "assistant", "content": str},
                ...
            ]

        model_name (str, optional): Model name override. Defaults to QWEN_MODEL_NAME from env.

    Returns:
        tuple: (str, float) The generated response from the LLM and the time taken in milliseconds.
    """

    # Use the configured Qwen model unless explicitly overridden
    effective_model = model_name if model_name else QWEN_MODEL_NAME

    start_time = time.perf_counter()

    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            # Request payload — OpenAI-compatible format
            data = {
                "model": effective_model,
                "messages": conversation_history,
                "temperature": 0.0,
                "max_tokens": 1024
            }

            # No auth headers needed for self-hosted server
            headers = {
                "Content-Type": "application/json"
            }

            # Send POST request to self-hosted Qwen server
            response = await client.post(
                QWEN_API_URL,
                headers=headers,
                json=data
            )

            end_time = time.perf_counter()
            gpt_ms = (end_time - start_time) * 1000

            # Handle the API response and errors
            if response.status_code == 200:
                reply = response.json()['choices'][0]['message']['content']
                print(f"[LLM] Raw response: {reply[:300]}")
                return reply.strip(), gpt_ms
            else:
                print(f"!!! QWEN LLM ERROR !!! Status: {response.status_code} | Body: {response.text}")
                return "HeyRoute: Sorry, I couldn't process that request.", gpt_ms
    except httpx.TimeoutException:
        end_time = time.perf_counter()
        gpt_ms = (end_time - start_time) * 1000
        print(f"!!! QWEN LLM TIMEOUT !!! after {gpt_ms:.0f}ms")
        return "HeyRoute: The language model took too long to respond. Please try again.", gpt_ms
    except Exception as e:
        print(f"Unexpected Error contacting Qwen LLM: {e}")
        return "HeyRoute: Something went wrong on my end.", 0.0
