import Geolocation from "react-native-geolocation-service";
import { GOOGLE_MAPS_API_KEY, ASR_URL } from "@env";

const GOOGLE_API_KEY = GOOGLE_MAPS_API_KEY;

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
 * Primary navigation trigger. Attempts to use custom backend (ASR) first with a fallback to pure Google Maps logic.
 * This is used for auto-launching routes from history/saved bypassing UI components.
 */
export const fetchRouteForNavigation = async (start: string, destination: string, preference: string, userId: string | null) => {
  if (!destination || destination.trim().length < 3) return null;

  const payload = { user_id: userId, start, destination, preference };

  try {
    const response = await fetch(`${ASR_URL}/manual_navigation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payload }),
    });

    if (!response.ok) throw new Error(`Status: ${response.status}`);

    const data = await response.json();

    // If backend provides a specific route
    if (data.status === "navigation_started" && data.route) {
      return {
        start: data.route.start || start || "Current Location",
        destination: data.route.end || destination || "Destination",
        preference,
        userId,
        routeData: { route: data.route, alternatives: data.alternatives || [], matching_coords: data.route.matching_coords },
        sessionId: data.session_id,
      };
    } else {
      const googleData = await fetchRouteFromGoogle(start, destination);
      if (googleData) {
        return {
          start,
          destination,
          preference,
          userId,
          routeData: googleData,
        };
      }
    }
  } catch {
    const googleData = await fetchRouteFromGoogle(start, destination);
    if (googleData) {
      return {
        start,
        destination,
        preference,
        userId,
        routeData: googleData,
      };
    }
  }
  return null;
};
