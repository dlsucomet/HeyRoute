# Project Setup and Execution Guide
This project consists of a FastAPI backend (ASR and Model (LLM)) and a React Native frontend.

===

## Prerequisites
- Python 3.10+
- Node.js
- Android Studio for a virtual emulator
- ADB (Android Debug Bridge) for physical device

=== 

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

===

## Troubleshooting

**Restarting the ADB Server**

If your Android device is not detected, reset the ADB connection

- adb kill-server
- adb start-server
- adb devices

**Common Fixes**
- **Node Modules**: If the frontend fails to build, try deleting node_modules and running ```npm install`` again.

- **Backend Ports**: Ensure ports 8000 and 8001 are not being used by other applications.