"""
This module implements the automatic speech recognition (ASR) functionality for HeyRoute.

Handles:
    - Receiving audio files from the client
    - Transcribing audio using remote Qwen3-ASR GPU server
    - Sending transcriptions to HeyRoute's backend for processing
"""

import asyncio
from datetime import datetime
import time
import os
import httpx
import warnings
import re
import io
import aiofiles
import edge_tts
from fastapi import FastAPI, Header, UploadFile, File
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from db import store_audio_file, store_interactions, store_metrics, log_session_metadata, log_event, log_system_error
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Ignore non-critical warnings
warnings.filterwarnings("ignore")

app = FastAPI()
VOICE = "en-US-AriaNeural"
MODEL_ANDROID_URL = os.getenv("MODEL_URL")

# --- Request Models ---
class TTSRequest(BaseModel):
    text: str

class LocationUpdate(BaseModel):
    lat: float
    lng: float

# -----------------------
# ASR ENGINE
# -----------------------
class ASREngine:
    """
    Handles the entire ASR process:
        - from receiving audio
        - transcribing with remote Qwen3-ASR GPU server
        - sending the final text to HeyRoute's backend. 
    
    It also manages session and user IDs, as well as the current location. 
    """

    def __init__(self):
        # We now point to the external GPU server for Qwen3-ASR
        self.gpu_server_url = os.getenv("REMOTE_ASR_URL", "http://altdsidccf.dlsu.edu.ph:33070")
        self.gpu_api_key = os.getenv("REMOTE_ASR_API_KEY", "")
        self.current_location = None
        self.client = httpx.AsyncClient(timeout=30)

    # -----------------------
    # REMOTE GPU TRANSCRIPTION
    # -----------------------
    async def transcribe_with_remote_gpu(self, audio_file, userId, sessionId):
        """
        Transcribe audio using our self-hosted Qwen3-ASR server.
        Returns the raw transcription text.
        """
        try:
            files = {"file": ("audio.wav", io.BytesIO(audio_file), "audio/wav")}
            headers = {
                "X-API-Key": self.gpu_api_key,
                "X-User-ID": userId,
                "X-Session-ID": sessionId
            }
            
            print(f"DEBUG: Uploading {len(audio_file) / 1024:.2f} KB to Remote GPU ASR")
            start = time.perf_counter()
            response = await self.client.post(
                f"{self.gpu_server_url}/transcribe",
                headers=headers,
                files=files
            )
            end = time.perf_counter()
            total = end - start
            print("Total time taken for GPU ASR: ", total)
            if response.status_code == 200:
                data = response.json()
                return data.get("text", "").strip()
            raise Exception(f"GPU ASR error: {response.text}")
        except Exception as e:
            asyncio.create_task(log_system_error(
                user_id=userId,
                session_id=sessionId,
                function_name="transcribe_with_remote_gpu",
                error_msg=str(e),
                error_type=type(e).__name__,
                payload={"audio_file": "binary_data"}
            ))
            return ""

    # -----------------------
    # SEND TO HEYROUTE LLM
    # -----------------------
    async def send_to_heyroute(self, text, userId, sessionId):
        """
        Sends the cleaned transcription to the backend for processing.

        Returns the response from the backend.
        """

        try:
            headers = {
                'Content-Type': 'application/json',
                'X-User-ID': userId,
                'X-Session-ID': sessionId
            }

            payload = {"transcript": text}
            if hasattr(self, "current_location") and self.current_location:
                payload["origin"] = self.current_location

            response = await self.client.post(
                f"{MODEL_ANDROID_URL}/heyroute/",
                json=payload,
                headers=headers
            )
            data = response.json()
            return data

        except Exception as e:
            error_msg = str(e)
            asyncio.create_task(log_system_error(
                user_id=userId,
                session_id=sessionId,
                function_name="send_to_heyroute",
                error_msg=error_msg,
                error_type=type(e).__name__,
                payload={"enhanced_text": text}
            ))
            return {
                "error": "Failed to reach HeyRoute",
                "heyroute": "System is currently unavailable.",
                "gpt_latency": 0,
                "ors_latency": 0,
                "turn_number": 0
            }

# -----------------------
# Instantiate engine
# -----------------------
asr = ASREngine()

# -----------------------
# API ROUTES
# -----------------------
@app.post("/process_audio")
async def process_audio(
    file: UploadFile = File(...),
    user_id: str = Header(None, alias="X-User-ID"),
    session_id: str = Header(None, alias="X-Session-ID"),
    device_model: str = Header(None, alias="X-Device-Model"),
    connection_type: str = Header(None, alias="X-Connection-Type"),
    current_lat: str = Header(None, alias="X-Current-Lat"),
    current_lng: str = Header(None, alias="X-Current-Lng")
):
    """
    Endpoint to receive audio file, process it through ASR engine, and return results.

    Key Processing Steps:
    1. Save the uploaded audio file (.wav)
    2. Transcribe with our remote Qwen3-ASR GPU server
    3. Send the transcribed text to HeyRoute's backend
    5. Return the original transcription, cleaned transcription, and HeyRoute's response
    """

    if current_lat is not None and current_lng is not None:
        try:
            asr.current_location = {"lat": float(current_lat), "lng": float(current_lng)}
            print(f"DEBUG: Updated current_location from headers: {asr.current_location}")
        except ValueError:
            print(f"WARNING: Invalid coordinates received in headers: lat={current_lat}, lng={current_lng}")

    asyncio.create_task(log_session_metadata(user_id, session_id, device_model, connection_type))
    asyncio.create_task(log_event(user_id=user_id, session_id=session_id, event_type="VOICE_ACTIVATED", response="", turn_number=0))

    # Start the "Master Clock"
    start_time = time.perf_counter()

    # Read the file content
    file_content = await file.read()

    # 1. Save the file uploaded from the phone
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    audio_filename = f"{user_id}_{session_id}_{timestamp}.wav"

    # Put them in a specific folder so your project stays clean
    upload_dir = "recordings" 
    os.makedirs(upload_dir, exist_ok=True)
    audio_file_path = os.path.join(upload_dir, audio_filename)

    async def background_save():
        async with aiofiles.open(audio_file_path, mode="wb") as buffer:
            await buffer.write(file_content)
        await store_audio_file(audio_file_path, file_content)
    
    asyncio.create_task(background_save())
    save_done = time.perf_counter()
    
    try:
        # 2. Transcribe with remote GPU (Qwen3-ASR)
        original_text = await asr.transcribe_with_remote_gpu(file_content, user_id, session_id)
        asr_done = time.perf_counter()

        # No AI cleaning needed since Qwen3 is highly accurate
        enhanced_text = original_text
        cleaning_done = time.perf_counter()

        # 3. Process LLM route
        result = await asr.send_to_heyroute(enhanced_text, user_id, session_id)
        total_done = time.perf_counter()

        response = result.get("heyroute", "No response received.")
        conversation_history = result.get("history")
        turn_number = result.get("turn_number")
        intents = result.get("intents")
        asyncio.create_task(store_interactions(user_id, session_id, audio_file_path, original_text, enhanced_text, response, conversation_history, turn_number, intents))

        save_ms = (save_done - start_time) * 1000
        asr_ms = (asr_done - save_done) * 1000
        cleaning_ms = 0
        gpt_ms = result.get("gpt_latency", 0)
        ors_ms = result.get("ors_latency", 0)
        intent_detect_ms = result.get("intent_detect_latency", 0)
        final_json_ms = result.get("final_json_latency", 0)
        heyroute_total_call_ms = (total_done - cleaning_done) * 1000
        # This is the time lost to moving data between your two backend scripts
        network_overhead_ms = heyroute_total_call_ms - (gpt_ms + ors_ms + intent_detect_ms + final_json_ms)
        total_turnaround_ms = (total_done - start_time) * 1000

        # --- LATENCY CALCULATIONS ---
        # Convert to milliseconds for easier reading
        metrics = {
            "save_ms": save_ms,
            "asr_ms": asr_ms,
            "cleaning_ms": cleaning_ms,
            "gpt_ms": gpt_ms,
            "ors_ms": ors_ms,
            "intent_detect_ms": intent_detect_ms,
            "final_json_ms": final_json_ms,
            "backend_overhead_ms": network_overhead_ms,
            "total_turnaround_ms": total_turnaround_ms
        }
        asyncio.create_task(store_metrics(user_id, session_id, save_ms, asr_ms, cleaning_ms, gpt_ms, ors_ms, intent_detect_ms, final_json_ms, network_overhead_ms, total_turnaround_ms))

        return {
            "transcription_raw": original_text,
            "transcription_enhanced": enhanced_text,
            "heyroute_response": result.get("heyroute", ""),
            "data": result,
            "metrics": metrics
        }
    except Exception as e:
        # Final catch-all for the route itself
        await log_system_error(user_id, session_id, "process_audio_route", str(e), type(e).__name__,)
        return {"error": "Critical process failure"}

@app.post("/speak")
async def speak(req: TTSRequest):
    """
    Endpoint to convert text to speech using edge-tts and return as streaming response.

    Returns an audio stream in MP3 format that can be played on the client side.
    """

    text = req.text
    mp3_fp = io.BytesIO()
    communicate = edge_tts.Communicate(text=text, voice=VOICE)

    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            mp3_fp.write(chunk["data"])

    mp3_fp.seek(0)
    return StreamingResponse(mp3_fp, media_type="audio/mpeg")

@app.post("/get_current_location")
def get_current_location(payload: LocationUpdate):
    """
    Endpoint to receive current location updates from the client and store them in the ASR engine's state.
    """
    
    asr.current_location = {"lat": payload.lat, "lng": payload.lng}
    return {"status": "ok"}