/**
 * This module manages the state and logic for a manual navigation input form in a React Native app.
 * 
 * Handles: 
 * - Managing the state of the start, destination, and preference inputs.
 * - Fetching and displaying autocomplete suggestions for the start and destination fields.
 * - Handling user interactions with the input fields and suggestions.
 */

import { useState, useEffect, useRef } from "react";
import { Keyboard, TextInput } from "react-native";
import { useNavigation } from "@react-navigation/core";
import Geolocation from "react-native-geolocation-service";
import { GOOGLE_MAPS_API_KEY, ASR_URL } from "@env";
import { DirectionsCardProps } from "../types/navigation";

const GOOGLE_API_KEY = GOOGLE_MAPS_API_KEY;

// --- Types ---
interface PlacePrediction {
  description: string;
  place_id: string;
  structured_formatting?: {
    main_text: string;
    secondary_text: string;
  };
}
type SuggestionItem = PlacePrediction | "CURRENT_LOCATION";

export const useManualInput = (props: DirectionsCardProps) => {
  const { onSetStart, onSetDestination, onSetPreference, userId, initialDestination, initialStart, onClose, autoTrigger, fromHistory } = props;
  const navigation = useNavigation();

  // Ref tracking to prevent infinite loops during auto-navigation triggers
  const hasAutoTriggered = useRef(false);
  const destInputRef = useRef<TextInput>(null);

  // --- State ---
  const [start, setStart] = useState(initialStart || "Your Location");
  const [destination, setDestination] = useState(initialDestination || "");
  const [preference, setPreference] = useState("");
  const [suggestions, setSuggestions] = useState<SuggestionItem[]>([]);
  const [activeField, setActiveField] = useState<"start" | "destination" | "preference" | null>(null);

  // Sync destination if initialDestination prop changes
  useEffect(() => {
    if (initialDestination && initialDestination !== destination) {
      setDestination(initialDestination);
      setActiveField("destination");
    }
  }, [initialDestination]);

  // Sync start if initialStart prop changes
  useEffect(() => {
    if (initialStart && initialStart !== start) {
      setStart(initialStart);
    }
  }, [initialStart]);

  // Google Places Autocomplete Logic
  useEffect(() => {
    // Don't fetch if no field is focused or if user is typing preferences
    if (!activeField || activeField === "preference") { setSuggestions([]); return; }
    const query = activeField === "start" ? start || "Metro Manila" : destination || "Metro Manila";
    
    // Special handling for "Current Location" option in start field
    const fetchSuggestions = async () => {
      if (query === "Your Location" || query === "Current Location") {
        if (activeField === "start") setSuggestions(["CURRENT_LOCATION"]);
        return;
      }

      try {
        const res = await fetch(`https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(query)}&components=country:ph&types=establishment&key=${GOOGLE_API_KEY}`);
        if (!res.ok) return;
        const data = await res.json();
        let results: SuggestionItem[] = (data.predictions as PlacePrediction[])?.slice(0, 3) || [];

        // If user is typing in the start field, prepend "Current Location" option
        if (activeField === "start") results = ["CURRENT_LOCATION", ...results];
        setSuggestions(results);
      } catch {}
    };

    fetchSuggestions();
  }, [start, destination, activeField]);

  // --- Handlers ---
  const handleSelect = (item: SuggestionItem) => {
    if (item === "CURRENT_LOCATION") {
      setStart("Your Location");
      onSetStart("CURRENT_LOCATION");
    } else if (activeField === "start") {
      setStart(item.description);
      onSetStart(item.description);
    } else if (activeField === "destination") {
      setDestination(item.description);
      onSetDestination(item.description);
    }
    setSuggestions([]);
    setActiveField(null);
  };

  const handleSwap = () => {
    const oldStart = start;
    const oldDest = destination;
    setStart(oldDest);
    setDestination(oldStart);
    onSetStart(oldDest);
    onSetDestination(oldStart);
  };

  // Utility to get current position
  const getCurrentPosition = (): Promise<{latitude: number, longitude: number} | null> => {
    return new Promise((resolve) => {
      Geolocation.getCurrentPosition(
        (position) => resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
        () => resolve(null),
        { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 }
      );
    });
  };

  /**
   * Decodes Google Maps Encoded Polyline Strings into an array of [lng, lat] coordinates.
   * Required for rendering the route line on the Map component.
   */
  const decodePolyline = (encoded: string) => {
    if (!encoded) return [];
    const poly = [];
    let index = 0, len = encoded.length;
    let lat = 0, lng = 0;

    while (index < len) {
      let b, shift = 0, result = 0;
      do {
        b = encoded.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      let dlat = ((result & 1) !== 0 ? ~(result >> 1) : (result >> 1));
      lat += dlat;

      shift = 0;
      result = 0;
      do {
        b = encoded.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      let dlng = ((result & 1) !== 0 ? ~(result >> 1) : (result >> 1));
      lng += dlng;
      poly.push([lng / 1e5, lat / 1e5]);
    }
    return poly;
  };

  /**
   * Direct fallback to Google Directions API if the custom ASR backend fails or doesn't provide a specialized route.
   */
  const fetchRouteFromGoogle = async (startAddr: string, destAddr: string) => {
    try {
      let startQuery: string;
      
      // Handle coordinate-based origin if "Your Location" is selected
      if (startAddr === "Current Location" || startAddr === "Your Location" || startAddr === "CURRENT_LOCATION") {
        const position = await getCurrentPosition();
        startQuery = position ? `${position.latitude},${position.longitude}` : "Manila, Philippines";
      } else {
        startQuery = encodeURIComponent(startAddr);
      }
      
      const response = await fetch(`https://maps.googleapis.com/maps/api/directions/json?origin=${startQuery}&destination=${encodeURIComponent(destAddr)}&alternatives=true&departure_time=now&key=${GOOGLE_API_KEY}`);
      const data = await response.json();
      
      if (data.status === "OK" && data.routes?.length > 0) {
        const primaryRoute = data.routes[0];
        const leg = primaryRoute.legs[0];
        const decodedPrimaryCoords = decodePolyline(primaryRoute.overview_polyline?.points || "");
        
        return {
          route: {
            start: leg.start_address,
            end: leg.end_address,
            duration: leg.duration_in_traffic?.text || leg.duration?.text || "-- mins",
            distance: leg.distance?.text || "-- km",
            full_geometry: decodedPrimaryCoords,
            matching_coords: decodedPrimaryCoords, 
            via: primaryRoute.summary ? primaryRoute.summary : "Main Route",
          },
          alternatives: data.routes.slice(1).map((r: any, i: number) => {
             const decodedAltCoords = decodePolyline(r.overview_polyline?.points || "");
             const altLeg = r.legs[0];
             return {
              start: altLeg.start_address,
              end: altLeg.end_address,
              duration: altLeg.duration_in_traffic?.text || altLeg.duration?.text || "-- mins",
              distance: altLeg.distance?.text || "-- km",
              full_geometry: decodedAltCoords,
              matching_coords: decodedAltCoords,
              via: r.summary ? r.summary : `Alt Route ${i + 1}`,
             };
          })
        };
      }
      console.warn("[Google Fetch] Failed to find route. Status:", data.status);
      return null;
    } catch (err) { 
        console.error("[Google Fetch] Error:", err);
        return null; 
    }
  };

  /**
   * Finalizes inputs and transitions to the RoutePreview screen.
   */
  const attemptNavigation = async (currentStart: string, currentDest: string) => {
    if (currentStart.trim().length > 0 && currentDest.trim().length > 0) {
      Keyboard.dismiss();
      const googleRouteData = await fetchRouteFromGoogle(currentStart, currentDest);
      onClose?.();
      
      // Small timeout ensures the keyboard/modal closing animation completes smoothly
      setTimeout(() => {
        (navigation as any).navigate("RoutePreview", {
          start: currentStart,
          destination: currentDest,
          preference,
          userId,
          routeData: googleRouteData,
          fromHistory,
        });
      }, 100);
    }
  };

  /**
   * Primary navigation trigger. Attempts to use custom backend (ASR) first with a fallback to pure Google Maps logic.
   */
  const startManualInputNav = async () => {
    if (destination.trim().length < 3) return;

    const payload = { user_id: userId, start, destination, preference };

    try {
      const response = await fetch(`${ASR_URL}/api/navigation/manual_navigation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payload }),
      });

      if (!response.ok) throw new Error(`Status: ${response.status}`);

      const data = await response.json();

      // If backend provides a specific route
      if (data.status === "navigation_started" && data.route) {
        Keyboard.dismiss();
        onClose?.();
        
        setTimeout(() => {
          (navigation as any).navigate("RoutePreview", {
            start: data.route.start || start || "Current Location",
            destination: data.route.end || destination || "Destination",
            preference,
            userId,
            routeData: { route: data.route, alternatives: data.alternatives || [], matching_coords: data.route.matching_coords },
            sessionId: data.session_id,
            fromHistory,
          });
        }, 100);
      } else {
        attemptNavigation(start, destination);
      }
    } catch {
      attemptNavigation(start, destination);
    }
  };

  // Trigger navigation automatically if requested
  useEffect(() => {
    if (autoTrigger && !hasAutoTriggered.current && destination && destination.length > 0) {
      hasAutoTriggered.current = true;
      setTimeout(() => { startManualInputNav(); }, 500);
    }
  }, [autoTrigger, destination]);

  const actions = { handleSelect, handleSwap, startManualInputNav, attemptNavigation };
  const states = { start, destination, preference, suggestions, activeField };
  const setters = { setStart, setDestination, setPreference, setActiveField, setSuggestions };
  const refs = { destInputRef };

  return { actions, states, setters, refs };
};