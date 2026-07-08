import { useState, useEffect, useRef } from 'react';
import { speakTTS } from '../utils/tts';

// Haversine formula to calculate distance between two coordinates in meters
const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371e3; // Earth radius in meters
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
            Math.cos(phi1) * Math.cos(phi2) *
            Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // in meters
};

export interface RouteData {
  full_geometry: [number, number][]; // [lng, lat]
  steps_instructions?: string[];
  turn_indices?: number[];
}

export const useNavigationEngine = (routeData: RouteData | null) => {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [distanceToNextTurn, setDistanceToNextTurn] = useState<number | null>(null);
  const [currentInstruction, setCurrentInstruction] = useState<string>("Follow the route");
  
  const hasAnnouncedRef = useRef<boolean>(false);

  useEffect(() => {
    // Reset state when route changes
    setCurrentStepIndex(0);
    setDistanceToNextTurn(null);
    hasAnnouncedRef.current = false;
    
    if (routeData?.steps_instructions && routeData.steps_instructions.length > 0) {
      setCurrentInstruction(routeData.steps_instructions[0]);
    } else {
      setCurrentInstruction("Follow the route");
    }
  }, [routeData]);

  const onLocationUpdate = (lat: number, lng: number) => {
    if (!routeData || !routeData.full_geometry || !routeData.steps_instructions || !routeData.turn_indices) {
      return;
    }

    if (currentStepIndex >= routeData.steps_instructions.length) {
      setCurrentInstruction("You have arrived at your destination.");
      setDistanceToNextTurn(null);
      return;
    }

    const nextTurnIndex = routeData.turn_indices[currentStepIndex];
    const turnCoord = routeData.full_geometry[nextTurnIndex]; // [lng, lat]
    
    if (!turnCoord) return;

    const distance = calculateDistance(lat, lng, turnCoord[1], turnCoord[0]);
    setDistanceToNextTurn(distance);

    // If within 70 meters of the turn, announce it (only once per step)
    if (distance < 70 && !hasAnnouncedRef.current) {
      hasAnnouncedRef.current = true;
      const instruction = routeData.steps_instructions[currentStepIndex];
      speakTTS(instruction).catch(e => console.error("[NavEngine] TTS Error:", e));
    }

    // If within 20 meters, consider the turn completed and move to next step
    if (distance < 20) {
      const nextIndex = currentStepIndex + 1;
      setCurrentStepIndex(nextIndex);
      hasAnnouncedRef.current = false; // Reset announcement flag for next step
      
      if (nextIndex < routeData.steps_instructions.length) {
        setCurrentInstruction(routeData.steps_instructions[nextIndex]);
      } else {
        setCurrentInstruction("You have arrived at your destination.");
        speakTTS("You have arrived at your destination.");
      }
    }
  };

  return {
    currentInstruction,
    distanceToNextTurn,
    onLocationUpdate,
    currentStepIndex
  };
};
