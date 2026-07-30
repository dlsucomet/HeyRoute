from abc import ABC, abstractmethod
from typing import List

class APIAdapter(ABC):
    @abstractmethod
    async def geocode(self, place_name: str, bias_lat: float = None, bias_lng: float = None) -> dict:
        """Convert a place name to coordinates, optionally biased by a location."""
        pass

    @abstractmethod
    async def reverse_geocode(self, lat: float, lng: float) -> str:
        """Convert coordinates to a readable address."""
        pass

    @abstractmethod
    async def get_directions(
        self, 
        origin: dict, 
        destination: dict,
        option: dict,
        via: List[dict] = None, 
        avoid_roads: List[str] = None,
        avoid_features: List[str] = None,
    ) -> dict:
        """Return routing directions from origin to destination."""
        pass

def format_duration_mins(minutes: int) -> str:
    hours = minutes // 60
    remaining_mins = minutes % 60
    if hours > 0:
        return f"{hours} hr {remaining_mins} mins" if remaining_mins > 0 else f"{hours} hr"
    return f"{minutes} mins"
