from fastapi import APIRouter
from pydantic import BaseModel
from datetime import datetime

router = APIRouter()

class StatusResponse(BaseModel):
    status: str
    message: str
    timestamp: str
    version: str

@router.get("/health", response_model=StatusResponse)
async def health_check():
    return StatusResponse(
        status="healthy",
        message="Mindfries FastAPI service is online!",
        timestamp=datetime.utcnow().isoformat(),
        version="1.0.0"
    )

@router.get("/status")
async def get_status():
    return {
        "status": "online",
        "service": "Mindfries Backend API",
        "environment": "development"
    }
