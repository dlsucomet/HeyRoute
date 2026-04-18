# Overview 

HeyRoute is a conversational, voice-driven navigation prototype designed to provide a safe,
hands-free driving experience. Unlike traditional GPS applications that rely on manual touch
inputs, HeyRoute utilizes a context-aware assistant that interprets natural language to deliver
personalized routes, adapt to dynamic user preferences, and support multi-turn dialogue.

The primary goal of the system is to minimize driver distraction and enhance safety, specifically
addressing the risks associated with manual phone interaction while navigating complex road
networks. The target users include daily commuters and private vehicle drivers navigating
high-traffic urban corridors, such as Metro Manila.

## Key features include:
**1. Dual-Trigger Voice Activation and Multi-Turn Continuity** <br>
Supports true hands-free operation through either a "Hey Route" wake-phrase or a
manual microphone trigger. The system maintains session state, allowing users to issue
follow-up commands (e.g., "Actually, take the faster one") without re-stating the entire
destination.

**2. LLM-Based Intent Recognition and Parameter Extraction** <br>
Employs a Large Language Model (LLM) pipeline to parse natural language into structured
navigation data. This allows the system to identify complex intents, resolve ambiguities
through proactive clarification, and extract multiple constraints from a single spoken
sentence.

**3. Context-Aware Routing Engine with Layer-Aware Avoidance** <br>
Integrates an OpenRouteService-based algorithm that translates user preferences into
precise geographic avoidance polygons. This ensures high geospatial accuracy, such as
distinguishing between crossing over a highway and entering it, while strictly adhering to
user-defined constraints.

**4. Multimodal Feedback and Session Management** <br>
Provides immediate auditory confirmation via a Text-to-Speech (TTS) module and visual
feedback through a live conversation transcript. The system tracks the session state
(origin, current progress, and previous preferences) to handle dynamic modifications,
such as adding waypoints or changing destinations mid-route.

# Project Setup and Execution Guide
This project consists of a FastAPI backend (ASR and Model (LLM)) and a React Native frontend.

## Prerequisites
- Python 3.10+
- Node.js
- Android Studio for a virtual emulator
- ADB (Android Debug Bridge) for physical device

# Android Setup and Execution (Windows)

1. First-time Setup

Run these commands once to initialize the virtual environment and install independencies.

```
# Navigate to the backend folder
cd backend
python -m venv venv
.\venv\Scripts\activate

# Install dependencies
python -m pip install fastapi uvicorn edge-tts pydub prompt_toolkit requests python-dotenv polyline shapely
```

2. Running the Application

You will need to create four separate terminal windows:

- **Terminal 1: Model**

```
cd backend
.\venv\Scripts\activate
uvicorn model:app --host 0.0.0.0 --port 8000 --reload
```

- **Terminal 2: ASR**

```
cd backend
.\venv\Scripts\activate
uvicorn asr:app --host 0.0.0.0 --port 8001 --reload
```

- **Terminal 3: React Native Metro Bundler**

```
cd frontend
npm install

# Note: Ensure @mapbox/polyline and react-native-geolocation-service are installed
npx react-native start
```

- **Terminal 4: Android Launch**

```
cd frontend
npx react-native run-android
```

## Troubleshooting

**Restarting the ADB Server**

If your Android device is not detected, reset the ADB connection

- adb kill-server
- adb start-server
- adb devices

**Common Fixes**
- **Node Modules**: If the frontend fails to build, try deleting node_modules and running "npm install" again.

- **Backend Ports**: Ensure ports 8000 and 8001 are not being used by other applications.
