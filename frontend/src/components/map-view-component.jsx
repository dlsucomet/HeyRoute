/**
 * This module defines the MapViewComponent, responsible for rendering the map, handling geolocation,
 * and displaying routes for both preview and live navigation modes.
 * 
 * Handles: 
 * - Geocoding start and destination addresses
 * - Fetching routes from Google Directions API if no backend route is provided
 * - Displaying the route on the map with dynamic fading of passed segments during live navigation
 * - Continuously tracking user's location and sending updates to the backend for ASR processing
 * - Managing map camera to follow user during navigation
 */

import React, { useEffect, useRef, useState } from "react";
import { StyleSheet, View, PermissionsAndroid, Platform } from "react-native";
import MapView, { PROVIDER_GOOGLE, Marker, Polyline } from "react-native-maps";
import Geolocation from "react-native-geolocation-service";
import PolylineDecoder from "@mapbox/polyline";

import { GOOGLE_MAPS_API_KEY, ASR_URL } from "@env";

const GOOGLE_API_KEY = GOOGLE_MAPS_API_KEY;
const ASR_ANDROID_URL = ASR_URL;

const CURRENT_LOCATION_STRINGS = ["CURRENT_LOCATION", "Your location", "Current Location"];

/**
 * Helper to identify if the 'start' point is the user's live position
 */
const isCurrentLocation = (val) => {
  if (!val) return false;
  if (typeof val === 'object') return true;
  return CURRENT_LOCATION_STRINGS.includes(val);
};

const MapViewComponent = (props) => {
  const { start, destination, userId, previewMode, followUser, matchingCoords, heading } = props;
  const mapRef = useRef(null);

  // --- State ---
  const [mapReady, setMapReady] = useState(false);
  const [currentLocation, setCurrentLocation] = useState(null);
  const [startCoords, setStartCoords] = useState(null);
  const [destCoords, setDestCoords] = useState(null);
  const [routeCoords, setRouteCoords] = useState([]);
  const [routeLocked, setRouteLocked] = useState(false);

  const [passedCoords, setPassedCoords] = useState([]);
  const [remainingCoords, setRemainingCoords] = useState([]);
  const headingRef = useRef(heading);

  /**
   * Haversine Distance Helper:
   * Used to filter GPS jitter and determine the user's progress along the polyline.
   */
  const distance = (a, b) => {
    const toRad = (v) => (v * Math.PI) / 180;
    const R = 6371000;

    const dLat = toRad(b.latitude - a.latitude);
    const dLon = toRad(b.longitude - a.longitude);

    const lat1 = toRad(a.latitude);
    const lat2 = toRad(b.latitude);

    const aVal =
        Math.sin(dLat/2)**2 +
        Math.sin(dLon/2)**2 * Math.cos(lat1) * Math.cos(lat2);

    return R * 2 * Math.atan2(Math.sqrt(aVal), Math.sqrt(1-aVal));
  };

  /**
   * Adjusts the camera to show the entire route.
   */
  const fitToRoute = (coords, delay = 500) => {
    setTimeout(() => {
      if (mapRef.current && coords.length > 0) {
        mapRef.current.fitToCoordinates(coords, {
          edgePadding: { top: 120, bottom: 300, left: 60, right: 60 },
          animated: true,
        });
      }
    }, delay);
  };

  /**
   * Send location to backend for ASR processing
   */
  useEffect(() => {
    if (!currentLocation || !userId) return;

    const sendLocationToASR = async () => {
      try {
        const response = await fetch(`${ASR_ANDROID_URL}/get_current_location`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_id: userId,
            lat: currentLocation.latitude,
            lng: currentLocation.longitude,
          }),
        });

        if (!response.ok) {
          throw new Error(`Server responded with status: ${response.status}`);
        }

        console.log("[MapViewComponent] Successfully sent location to ASR.");
      } catch (err) {
        console.error("[MapViewComponent] Failed to send location to ASR:", err.message);
      }
    };

    sendLocationToASR();
  }, [currentLocation, userId]);

  /**
   * Process backend routes — works for both Preview and Live Navigation
   */
  useEffect(() => {
    if (matchingCoords && matchingCoords.length > 0) {
      console.log("[MapViewComponent] Processing matchingCoords from backend...");

      try {
        let coords = [];

        // Case 1: Polyline string
        if (typeof matchingCoords === "string") {
          console.log("[MapViewComponent] Decoding polyline string...");
          coords = PolylineDecoder.decode(matchingCoords, 5).map(([lat, lng]) => ({
            latitude: lat,
            longitude: lng,
          }));
          // Case 2: Nested Arrays [[lng, lat], ...]
        } else if (Array.isArray(matchingCoords)) {
          console.log("[MapViewComponent] Parsing coordinates array...");

          if (Array.isArray(matchingCoords[0])) {
            // Format: [[lng, lat], [lng, lat]]
            coords = matchingCoords.map((point) => ({
              latitude: point[1],
              longitude: point[0],
            }));
            // Case 3: Object Arrays [{lat, lng}, ...]
          } else {
            // Format: [{lat, lng}, {lat, lng}]
            coords = matchingCoords.map((point) => ({
              latitude: point.lat || point.latitude,
              longitude: point.lng || point.longitude,
            }));
          }
        }

        if (coords.length > 0) {
          console.log(`[MapViewComponent] Successfully parsed ${coords.length} coordinates.`);

          setRouteCoords(coords);
          setPassedCoords([]);
          setRemainingCoords(coords);
          setStartCoords(coords[0]);
          setDestCoords(coords[coords.length - 1]);

          fitToRoute(coords, 500);
        } else {
          console.warn("[MapViewComponent] matchingCoords resulted in 0 coordinates.");
        }
      } catch (err) {
        console.error("[MapViewComponent] Error processing matchingCoords:", err.message);
      }
    }
  }, [matchingCoords]);

  /**
   * Re-fit route when map becomes ready, in case coords arrived before mount
   */
  useEffect(() => {
    if (mapReady && routeCoords.length > 0) {
      fitToRoute(routeCoords, 100);
    }
  }, [mapReady]);

  /**
   * Continuously watch user's location
   */
  useEffect(() => {
    let watchId = null;

    const startWatching = async () => {
      try {
        if (Platform.OS === "android") {
          console.log("[MapViewComponent] Requesting Android location permissions...");
          const granted = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
          );
          if (granted !== PermissionsAndroid.RESULTS.GRANTED) return;
        }

        console.log("[MapViewComponent] Starting Geolocation watchPosition...");
        watchId = Geolocation.watchPosition(
          (pos) => {
            const loc = {
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
            };

             // ensures the camera only moves if the user actually moved
            setCurrentLocation(prev => {
              // Filter out GPS jitter (move < 4 meters) to keep camera smooth
              const moveDist = prev ? distance(prev, loc) : Infinity;
              if (moveDist < 4) return prev;

              const updatedLoc = loc;

              // Camera Handling for Live Nav
              if (followUser && mapRef.current) {
                const activeHeading = pos.coords.heading || headingRef.current || 0;

                mapRef.current.animateCamera(
                  { center: updatedLoc, zoom: 18, pitch: 45, heading: heading || 0 },
                  { duration: 250 }
                );
              }

              return updatedLoc;
            });

            // Set start coords from GPS if start is a current location placeholder
            if (isCurrentLocation(start)) {
              if (typeof start === 'object' && start?.lat) {
                setStartCoords({ latitude: start.lat, longitude: start.lng });
              } else {
                setStartCoords(loc);
              }
            }
          },
          (err) => console.log("[MapViewComponent] Geolocation Watch error:", err),
          {
            enableHighAccuracy: true,
            distanceFilter: 1, // trigger every 1 meter
            interval: 1000,
            fastestInterval: 500,
          }
        );
      } catch (err) {
        console.error("[MapViewComponent] Error in startWatching initialization:", err.message);
      }
    };

    startWatching();

    return () => {
      if (watchId !== null) {
        console.log("[MapViewComponent] Clearing Geolocation watchId:", watchId);
        Geolocation.clearWatch(watchId);
      }
    };
  }, [followUser, start]);

  /**
   * Resolve start coordinates — handles string placeholders and coordinate objects
   */
  useEffect(() => {
    if (isCurrentLocation(start)) {
      if (typeof start === 'object' && start?.lat) {
        console.log("[MapViewComponent] Using coordinate object for start.");
        setStartCoords({ latitude: start.lat, longitude: start.lng });
      } else if (currentLocation) {
        console.log("[MapViewComponent] Using live GPS for start coordinates.");
        setStartCoords(currentLocation);
      }
      return;
    }

    if (!previewMode && matchingCoords) return;

    const normalizedStart = typeof start === "string" ? start.trim() : "";
    if (!normalizedStart) {
      console.log("[MapViewComponent] Skipping start geocode because start is empty.");
      return;
    }

    // Geocode start address if it's not a current location placeholder
    const geocodeStart = async () => {
      console.log(`[MapViewComponent] Geocoding start address: ${normalizedStart}`);
      try {
        const res = await fetch(
          `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
            normalizedStart
          )}&key=${GOOGLE_API_KEY}`
        );

        const data = await res.json();

        if (data.error_message) {
          throw new Error(`Google Geocode API Error: ${data.error_message}`);
        }

        const loc = data.results?.[0]?.geometry?.location;

        if (!loc) {
          console.warn("[MapViewComponent] Start geocode failed to return valid geometry.");
          return;
        }

        console.log("[MapViewComponent] Start location geocoded successfully.");
        setStartCoords({ latitude: loc.lat, longitude: loc.lng });
      } catch (err) {
        console.log("[MapViewComponent] Start geocode error:", err);
      }
    };

    geocodeStart();
  }, [start, previewMode, matchingCoords, currentLocation]);

  /**
   * Fetch destination coordinates and route from Google if no backend route exists
   */
  useEffect(() => {
    if (matchingCoords?.length) return;
    if (routeLocked) return;
    if (!startCoords || !destination || destination.length < 3) return;

    // Fetch route from Google Directions API
    const fetchRoute = async () => {
      console.log(`[MapViewComponent] Fetching route for destination: ${destination}`);
      try {
        // Get Destination Coords
        const destRes = await fetch(
          `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
            destination
          )}&key=${GOOGLE_API_KEY}`
        );

        const destData = await destRes.json();

        if (destData.error_message) {
          throw new Error(`[MapViewComponent] Geocoding Dest API Error: ${destData.error_message}`);
        }

        const destLoc = destData.results?.[0]?.geometry?.location;

        if (!destLoc) {
          console.warn("[MapViewComponent] Destination geocode failed to return valid geometry.");
          return;
        }

        const destPoint = { latitude: destLoc.lat, longitude: destLoc.lng };
        setDestCoords(destPoint);

        console.log("[MapViewComponent] Fetching Directions API...");
        
        // Get Route Polyline
        const routeRes = await fetch(
          `https://maps.googleapis.com/maps/api/directions/json?origin=${startCoords.latitude},${startCoords.longitude}&destination=${destPoint.latitude},${destPoint.longitude}&key=${GOOGLE_API_KEY}`
        );

        const routeData = await routeRes.json();

        if (routeData.error_message) {
          throw new Error(`[MapViewComponent] Directions API Error: ${routeData.error_message}`);
        }

        const polyline = routeData.routes?.[0]?.overview_polyline?.points;

        if (!polyline) {
          console.warn("[MapViewComponent] No route found or polyline missing from Directions API.");
          return;
        }

        const coords = PolylineDecoder.decode(polyline).map(([lat, lng]) => ({
          latitude: lat,
          longitude: lng,
        }));

        console.log(`[MapViewComponent] Route fetched successfully with ${coords.length} points.`);

        setRouteCoords(coords);
        setRemainingCoords(coords);
        setRouteLocked(true);

        fitToRoute(coords, 300);
      } catch (err) {
        console.log("[MapViewComponent] Fetch route error:", err);
      }
    };

    fetchRoute();
  }, [startCoords, destination, routeLocked, matchingCoords]);

  const getDistance = (a, b) => {
    try {
      const toRad = (v) => (v * Math.PI) / 180;
      const R = 6371000;
      const dLat = toRad(b.latitude - a.latitude);
      const dLon = toRad(b.longitude - a.longitude);
      const lat1 = toRad(a.latitude);
      const lat2 = toRad(b.latitude);
      const aVal =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
      const c = 2 * Math.atan2(Math.sqrt(aVal), Math.sqrt(1 - aVal));
      return R * c;
    } catch (err) {
      console.error("[MapViewComponent] Error calculating distance:", err.message);
      return 0;
    }
  };

  /**
   * Route fading — track passed vs remaining coordinates during live navigation
   */
  useEffect(() => {
    if (!currentLocation || routeCoords.length === 0) return;
    if (previewMode) return;

    try {
      let closestIndex = 0;
      let minDistance = Infinity;

      // Find the progress point (within a 35m threshold)
      routeCoords.forEach((point, index) => {
        const distance = getDistance(currentLocation, point);
        if (distance < minDistance && distance < 35) {
          minDistance = distance;
          closestIndex = index;
        }
      });

      setPassedCoords(routeCoords.slice(0, closestIndex));
      setRemainingCoords(routeCoords.slice(closestIndex));
    } catch (err) {
      console.error("[MapViewComponent] Error slicing route coordinates:", err.message);
    }
  }, [currentLocation, routeCoords, previewMode]);

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={styles.map}
        showsUserLocation={true}
        showsMyLocationButton={false}
        onMapReady={() => {
          console.log("[MapViewComponent] Map is ready.");
          setMapReady(true);
        }}
        initialRegion={{
          latitude: 14.5995,
          longitude: 120.9842,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        }}
      >
        {startCoords && <Marker coordinate={startCoords} title="Start" />}
        {destCoords && <Marker coordinate={destCoords} title="Destination" />}

        {/* Passed route (faded gray) — only during live navigation */}
        {!previewMode && passedCoords.length > 0 && (
          <Polyline
            coordinates={passedCoords}
            strokeWidth={5}
            strokeColor="rgba(150,150,150,0.6)"
          />
        )}

        {/* Remaining/full route (blue) */}
        {remainingCoords.length > 0 && (
          <Polyline
            coordinates={remainingCoords}
            strokeWidth={6}
            strokeColor="#2E86DE"
          />
        )}
      </MapView>
    </View>
  );
};

export default MapViewComponent;

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
});
