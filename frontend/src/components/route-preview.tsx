/**
 * This module defines the RoutePreviewScreen component, which is responsible for displaying a map with the selected route,
 * allowing users to preview different route options, and providing options to modify the route or start navigation.
 * 
 * Handles: 
 * - Rendering a map with the active route highlighted.
 * - Displaying a header with start and destination information.
 * - Providing a panel to select between different route options.
 */

import React, { useState, useEffect, useRef } from "react";
import { View, Text, StyleSheet, Pressable, Platform, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { RouteProp, useNavigation, useRoute, useIsFocused } from "@react-navigation/native";
import MaterialIcons from "react-native-vector-icons/MaterialIcons";
import Geolocation from "react-native-geolocation-service";
import { GOOGLE_MAPS_API_KEY } from "@env";

import MapboxMapView from "../components/mapbox-map-view";
import RouteSelectionPanel from "./route-selection-panel";
import ActiveVoiceModal from "../components/active-voice-modal";
import { useWakeWord } from "../hooks/useWakeWord";
import { speakTTS } from "../utils/tts";

const LOG_PREFIX = "[RoutePreviewScreen]";

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
 * Formats a Routes API duration string (e.g. "1425s") into a human-readable string (e.g. "24 mins").
 */
const formatDuration = (durationStr: string) => {
  if (!durationStr) return "-- mins";
  const seconds = parseInt(durationStr.replace("s", ""), 10);
  if (isNaN(seconds)) return "-- mins";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return `${minutes} mins`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMins = minutes % 60;
  return remainingMins > 0 ? `${hours} hr ${remainingMins} mins` : `${hours} hr`;
};

/**
 * Formats a distance in meters to a human-readable string (e.g. "1.5 km").
 */
const formatDistance = (meters: number) => {
  if (meters === undefined || meters === null) return "-- km";
  const km = meters / 1000;
  return `${km.toFixed(1)} km`;
};

/**
 * Parses a coordinate string in the format "lat,lng" if possible.
 */
const parseLatLng = (str: string) => {
  const parts = str.split(",");
  if (parts.length === 2) {
    const lat = parseFloat(parts[0].trim());
    const lng = parseFloat(parts[1].trim());
    if (!isNaN(lat) && !isNaN(lng)) {
      return { latitude: lat, longitude: lng };
    }
  }
  return null;
};

type RoutePreviewParams = {
  RoutePreview: {
    start: string;
    destination: string;
    preference: string;
    userId: string;
    sessionId?: string;
    routeData?: any;
    fromHistory?: boolean;
    routeOption?: string;
    avoidList?: string[];
    majorRoad?: string;
    autoStartMicrophone?: boolean; // Flag to trigger listening immediately on mount
    micDelay?: number; // Delay to prevent the mic from catching the speaker's own voice
  };
};

const RoutePreviewScreen = () => {
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RoutePreviewParams, 'RoutePreview'>>();
  const isFocused = useIsFocused();
  
  const { start, destination, preference, userId, sessionId, routeData, fromHistory,   routeOption, avoidList, majorRoad } = (route.params || {});

  // --- STATE ---
  const getInitialRawRoutes = () => {
    const raw = [];
    if (routeData?.route) {
      raw.push(routeData.route);
      if (routeData?.alternatives) raw.push(...routeData.alternatives);
    } else if (routeData?.routes) {
      raw.push(...routeData.routes);
    }
    return raw;
  };

  const initialRawRoutes = getInitialRawRoutes();
  const [localRoutes, setLocalRoutes] = useState<any[]>(initialRawRoutes);
  const [activeFullGeometry, setActiveFullGeometry] = useState<any>(
    initialRawRoutes[0]?.full_geometry || null
  );
  const [activeRouteId, setActiveRouteId] = useState("1");
  const [navSdkEta, setNavSdkEta] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [currentStart, setCurrentStart] = useState<string>(start);
  const [currentDestination, setCurrentDestination] = useState<string>(destination);
  const hasAnnouncedEtaRef = useRef(false);

  const handleEtaUpdated = (eta: string, distanceKm?: number) => {
    setNavSdkEta(eta);
    if (!hasAnnouncedEtaRef.current && distanceKm !== undefined) {
      hasAnnouncedEtaRef.current = true;
      const speechText = `The route is approximately ${distanceKm} kilometers and will take around ${eta}.`;
      console.log(`${LOG_PREFIX} Announcing route ETA:`, speechText);
      speakTTS(speechText).catch((err) => {
        console.error(`${LOG_PREFIX} TTS announcement error:`, err);
      });
    }
  };

  // --- GOOGLE ROUTES API FALLBACK ---
  const getCurrentPosition = (): Promise<{ latitude: number; longitude: number } | null> => {
    let timeoutId: any;

    const geoPromise = new Promise<{ latitude: number; longitude: number } | null>((resolve) => {
      Geolocation.getCurrentPosition(
        (position) => {
          if (timeoutId) clearTimeout(timeoutId);
          resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude });
        },
        (error) => {
          console.warn("[RoutePreviewScreen] High accuracy location failed, trying low accuracy:", error.code, error.message);
          Geolocation.getCurrentPosition(
            (pos) => {
              if (timeoutId) clearTimeout(timeoutId);
              resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
            },
            (err2) => {
              if (timeoutId) clearTimeout(timeoutId);
              console.error("[RoutePreviewScreen] Low accuracy location failed:", err2.code, err2.message);
              resolve(null);
            },
            { enableHighAccuracy: false, timeout: 15000, maximumAge: 10000 }
          );
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 10000 }
      );
    });

    const timeoutPromise = new Promise<{ latitude: number; longitude: number } | null>((resolve) => {
      timeoutId = setTimeout(() => {
        console.warn("[RoutePreviewScreen] Geolocation.getCurrentPosition JS-level timeout reached (15 seconds). Resolving null.");
        resolve(null);
      }, 15000);
    });

    return Promise.race([geoPromise, timeoutPromise]);
  };

  const buildWaypoint = async (addressStr: string, isOrigin: boolean) => {
    const isCurrentLoc =
      addressStr === "Current Location" ||
      addressStr === "Your location" ||
      addressStr === "Your Location" ||
      addressStr === "CURRENT_LOCATION";

    if (isCurrentLoc && isOrigin) {
      const position = await getCurrentPosition();
      if (position) {
        return {
          location: {
            latLng: {
              latitude: position.latitude,
              longitude: position.longitude,
            },
          },
        };
      }
      return { address: "Manila, Philippines" };
    }

    const parsedCoords = parseLatLng(addressStr);
    if (parsedCoords) {
      return {
        location: {
          latLng: {
            latitude: parsedCoords.latitude,
            longitude: parsedCoords.longitude,
          },
        },
      };
    }

    return { address: addressStr };
  };

  const fetchRoutesFromGoogle = async (startAddr: string, destAddr: string) => {
    try {
      console.log(`${LOG_PREFIX} Requesting Routes API fallback from: "${startAddr}" to: "${destAddr}"`);
      
      const originWaypoint = await buildWaypoint(startAddr, true);
      const destinationWaypoint = await buildWaypoint(destAddr, false);

      const requestBody = {
        origin: originWaypoint,
        destination: destinationWaypoint,
        travelMode: "DRIVE",
        routingPreference: "TRAFFIC_AWARE",
        computeAlternativeRoutes: true,
      };

      const response = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": GOOGLE_MAPS_API_KEY,
          "X-Goog-FieldMask": "routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline,routes.description",
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Routes API HTTP error! status: ${response.status}, details: ${errorText}`);
      }

      const data = await response.json();
      console.log(`${LOG_PREFIX} Routes API response received successfully.`);
      
      if (!data.routes || data.routes.length === 0) {
        console.warn(`${LOG_PREFIX} No routes found in Routes API response.`);
        return [];
      }

      return data.routes.map((route: any) => {
        const decodedCoords = decodePolyline(route.polyline?.encodedPolyline || "");
        return {
          duration: formatDuration(route.duration),
          distance: formatDistance(route.distanceMeters),
          full_geometry: decodedCoords,
          matching_coords: decodedCoords,
          via: route.description || "Main Route",
        };
      });
    } catch (error) {
      console.error(`${LOG_PREFIX} fetchRoutesFromGoogle error:`, error);
      return [];
    }
  };

  // Sync state and fetch fallback route geometry if missing
  useEffect(() => {
    const initAndFetch = async () => {
      const raw = getInitialRawRoutes();
      // Use the precise Mapbox geometry from the backend if available.
      // Do NOT throw it away even if origin is "current location", because the backend already resolved it to exact GPS.
      const hasGeometry = raw.length > 0 && raw[0]?.full_geometry;
      
      if (hasGeometry) {
        setLocalRoutes(raw);
        setActiveFullGeometry(raw[0].full_geometry);
        setActiveRouteId("1");
      } else if (start && destination) {
        console.log(`${LOG_PREFIX} Route geometry missing or needs precise GPS. Fetching fallback routes from Google Routes API...`);
        setIsLoading(true);
        try {
          const googleRoutes = await fetchRoutesFromGoogle(start, destination);
          setLocalRoutes(googleRoutes);
          if (googleRoutes.length > 0) {
            setActiveFullGeometry(googleRoutes[0].full_geometry);
            setActiveRouteId("1");
          } else {
            setActiveFullGeometry(null);
          }
        } catch (err) {
          console.error(`${LOG_PREFIX} Error fetching fallback routes:`, err);
        } finally {
          setIsLoading(false);
        }
      } else {
        setLocalRoutes([]);
        setActiveFullGeometry(null);
      }
    };

    initAndFetch();
  }, [routeData, start, destination]);

  // Voice & Modal State
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [panelExpanded, setPanelExpanded] = useState(false);
  const [transcribedText, setTranscribedText] = useState("");
  const [heyrouteResponse, setHeyrouteResponse] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  // Wake Word & VAD State
  const [isRecordingInModal, setIsRecordingInModal] = useState(false);
  const [isProcessingInModal, setIsProcessingInModal] = useState(false);
  const [vadModeActive, setVadModeActive] = useState(false);
  const [wakeWordActive, setWakeWordActive] = useState(false);

  const shouldAutoStartVadMode = useRef(false);
  const shouldAutoStartRecording = useRef(false);

  /**
   * Constantly listens for "Hey Route" only when the screen is focused and the modal isn't already open.
   */
  const wakeWordVisible = isFocused && !isModalVisible;

  useWakeWord({
    visible: wakeWordVisible,
    isRecording: isRecordingInModal,
    isProcessing: isProcessingInModal,
    vadMode: vadModeActive,
    onWakeWordDetected: () => {
      console.log(`${LOG_PREFIX} Wake word detected! Triggering modal...`);
      shouldAutoStartVadMode.current = true;
      handleVoicePress();
    },
    onStatusChange: (active) => setWakeWordActive(active),
    onError: (err) => console.error(`${LOG_PREFIX} Wake word error:`, err),
  });

  // to catch the active voice detection from the Home Screen
  useEffect(() => {
    if (route.params?.autoStartMicrophone) {
      const delay = route.params?.micDelay || 500;
      console.log(`${LOG_PREFIX} Waiting ${delay}ms for AI to finish speaking before starting mic...`);
      
      const timer = setTimeout(() => {
        // Trigger the modal and recording logic AFTER the AI finishes talking
        shouldAutoStartVadMode.current = true;
        setIsModalVisible(true);
      }, delay);

      // Clear the param immediately
      navigation.setParams({ autoStartMicrophone: undefined, micDelay: undefined } as any);
      
      // Cleanup the timer just in case the user navigates away early
      return () => clearTimeout(timer);
    }
  }, [route.params?.autoStartMicrophone, navigation]);

  // --- HANDLERS ---
  const handleVoicePress = () => {
    if (isModalVisible) return;
    setIsModalVisible(true);
  };

  const closeModal = () => setIsModalVisible(false);

  const handleTranscription = (text: string, metrics: any) => {
    setTranscribedText(text);
    setIsProcessing(true);
    // can also add latency logging here if need
  };

  /**
   * Triggered if the user says something like "Let's go" or "Start" into the Voice Modal.
   */
  const handleNavigationTriggered = (heyrouteData: any) => {
    setIsModalVisible(false);
    
    // Fallback to primary route if voice does not specify a new one
    const selectedRoute = heyrouteData.route || (localRoutes[0] || null);
    const newPrefs = heyrouteData.preferences || heyrouteData.preference || {};

    const payload = {
      start: currentStart,
      destination: currentDestination,
      userId: userId,
      preference: routeOption || "recommended",
      sessionId: heyrouteData.session_id || sessionId,
      full_geometry: selectedRoute?.full_geometry,
      alternative_routes: heyrouteData.alternatives || [],
      routeDuration: selectedRoute?.duration,
      routeDistance: selectedRoute?.distance,
      routeVia: selectedRoute?.via,
      exclude_string: selectedRoute?.exclude_string,
      stepsInstructions: selectedRoute?.steps_instructions,
      turnIndices: selectedRoute?.turn_indices,
      fromHistory: fromHistory || false,
      routeOption: newPrefs?.route_option || routeOption,
      avoidList: newPrefs?.avoid_list || avoidList,
      majorRoad: newPrefs?.major_road || majorRoad
    };

    console.log(`${LOG_PREFIX} Voice triggered navigation payload:`, payload);
    (navigation as any).navigate("NavigationScreen", payload);
  };

  const handleRoutePreviewTriggered = (heyrouteData: any) => {
    setIsModalVisible(false);
    
    if (heyrouteData?.route) {
      const raw = [heyrouteData.route];
      if (heyrouteData.alternatives) {
        raw.push(...heyrouteData.alternatives);
      }
      setLocalRoutes(raw);
      if (raw[0]?.full_geometry) {
        setActiveFullGeometry(raw[0].full_geometry);
      }
      setActiveRouteId("1");
    }

    if (heyrouteData?.destination) {
      setCurrentDestination(heyrouteData.destination);
    }
    
    if (heyrouteData?.origin) {
      setCurrentStart(heyrouteData.origin);
    }

    setHeyrouteResponse(heyrouteData?.heyroute || "Updating routes...");
  };

  // Build formatted routes for the panel
  let formattedRoutes: any[] = [];
  try {
    const rawRoutes = localRoutes;

    // Map raw routes to the format expected by the RouteSelectionPanel
    formattedRoutes = rawRoutes.map((r, index) => ({
      ...r,
      id: String(index + 1),
      name: r.via ? `${r.via}` : `Route ${index + 1}`,
      tag: index === 0 ? "Recommended" : "Alternative Route",
      duration: (index === 0 && navSdkEta) ? navSdkEta : (r.duration || "-- mins"),
      distance: r.distance || "-- km",
    }));
  } catch (error) {
    console.error(`${LOG_PREFIX} Error formatting routes:`, error);
  }

  // Set the first route as active by default
  const formatLocation = (loc: any, fallback: string) => {
    if (!loc) return fallback;
    if (typeof loc === 'string') return loc;
    return "Location Set";
  };

  return (
    <SafeAreaView style={styles.safeArea} pointerEvents="box-none">
      <View style={styles.container}>

        <View style={StyleSheet.absoluteFill}>
          <MapboxMapView
            previewMode={true}
            destination={currentDestination}
            routePolyline={activeFullGeometry}
            onEtaUpdated={handleEtaUpdated}
          />
        </View>

        {/* Header */}
        <View style={styles.headerCard}>
          <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
            <MaterialIcons name="arrow-back" size={24} color="#000" />
          </Pressable>
          <View style={styles.headerTextContainer}>
            <Text style={styles.headerLabel} numberOfLines={1}>
              {formatLocation(currentStart, "Your location")} → {formatLocation(currentDestination, "Destination")}
            </Text>
            {preference ? (
              <View style={styles.preferenceBadge}>
                <MaterialIcons name="tune" size={14} color="#7d52ae" />
                <Text style={styles.preferenceText}>{preference}</Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* Mic Button & Wake Word Indicator */}
        <View
           style={[
            styles.micContainer,
            { 
               bottom: panelExpanded ? 420 : 260,
               zIndex: panelExpanded ? 5 : 20 
             }
          ]}
        >
          {wakeWordActive && (
            <View style={styles.wakeWordIndicator}>
              <View style={styles.listeningDot} />
              <Text style={styles.wakeWordText}>Say "Hey Route"</Text>
            </View>
          )}
          <Pressable
            onPress={handleVoicePress}
            style={({ pressed }) => [
              styles.voiceButton,
              pressed && { opacity: 0.8, transform: [{ scale: 0.95 }] },
            ]}
          >
            <MaterialIcons name="keyboard-voice" size={32} color="#3e0d73" />
          </Pressable>
        </View>

        {/* Voice Modal */}
        <ActiveVoiceModal
          userId={userId}
          sessionId={sessionId}
          visible={isModalVisible}
          onClose={closeModal}
          onTranscriptionComplete={handleTranscription}
          onNavigationTriggered={handleNavigationTriggered}
          onRoutePreview={handleRoutePreviewTriggered}
          autoStartRecording={shouldAutoStartRecording}
          autoStartVadMode={shouldAutoStartVadMode}
          onRecordingStateChange={setIsRecordingInModal}
          onProcessingStateChange={setIsProcessingInModal}
          onVadModeChange={setVadModeActive}
        />

        <RouteSelectionPanel
          start={currentStart}
          destination={currentDestination}
          userId={userId}
          routes={formattedRoutes}
          onStartPress={() => {
            const selectedRoute = formattedRoutes.find(r => r.id === activeRouteId) || formattedRoutes[0];
            (navigation as any).navigate("NavigationScreen", {
              start: currentStart, destination: currentDestination, userId, sessionId,
              full_geometry: selectedRoute?.full_geometry,
              routeOption: selectedRoute?.option || "recommended",
              routeData: { route: selectedRoute },
              alternative_routes: localRoutes.slice(1),
              routeDuration: selectedRoute?.duration,
              routeDistance: selectedRoute?.distance,
              routeVia: selectedRoute?.via,
              exclude_string: selectedRoute?.exclude_string,
              fromHistory: fromHistory || false,
              avoidList,
              majorRoad
            });
          }}
          onRouteSelect={(selectedRoute: any) => {
            setActiveRouteId(selectedRoute?.id);
            if (selectedRoute?.full_geometry) setActiveFullGeometry(selectedRoute.full_geometry);
          }}
        />

        {isLoading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#3e0d73" />
            <Text style={styles.loadingText}>Fetching route geometry...</Text>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
};

export default RoutePreviewScreen;

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, zIndex: 10 },
  headerCard: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 10 : 35,
    left: 16,
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    padding: 12,
    borderRadius: 8,
    elevation: 4,
    zIndex: 10,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  backButton: {
    paddingRight: 12
  },
  headerTextContainer: { 
    flex: 1
  },
  headerLabel: {
    fontSize: 16, 
    fontWeight: "600", 
    color: "#333"
  },
  preferenceBadge: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
    backgroundColor: "#f2ebfa",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: "flex-start",
  },
  preferenceText: { 
    fontSize: 12,
    color: "#7d52ae",
    marginLeft: 4,
    fontWeight: "600",
    fontFamily: "Karla",
  },
  micContainer: {
    position: "absolute",
    right: 20,
    alignItems: "center",
  },
  wakeWordIndicator: {
    zIndex: 20,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.95)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginBottom: 8,
    elevation: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  listeningDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#4CAF50", 
    marginRight: 6
  },
  wakeWordText: {
    fontSize: 11,
    color: "#666",
    fontFamily: "Karla"
  },
  voiceButton: {
    backgroundColor: "#fff",
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: "center",
    alignItems: "center",
    elevation: 5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
  },
  loadingContainer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255, 255, 255, 0.7)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 15,
  },
  loadingText: {
    marginTop: 10,
    fontSize: 14,
    color: "#333",
    fontWeight: "600",
    fontFamily: "Karla",
  },
});
