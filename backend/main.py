from fastapi import FastAPI
from model import app as model_app
from asr import app as asr_app
from manual_navigation import router as manual_router

app = FastAPI(title="HeyRoute Unified Backend")

# Mount your existing apps to specific paths
app.mount("/model", model_app)
app.mount("/asr", asr_app)
app.include_router(manual_router, prefix="/navigation", tags=["Manual Control"])

@app.get("/")
def health_check():
    return {"status": "online", "services": ["/model", "/asr", "/navigation"]}