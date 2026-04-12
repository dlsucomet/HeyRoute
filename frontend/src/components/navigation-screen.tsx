/**
 * This module defines the NavigationScreen component, which is responsible for managing the main navigation experience.
 * 
 * Handles: 
 * - Rendering the map with the active route and user location.
 * - Providing turn-by-turn instructions with dynamic distance updates.
 * - Integrating voice commands for hands-free control.
 */

import React, { useState, useEffect, useRef } from "react";
import { useNavigation, useRoute, useIsFocused } from "@react-navigation/native";
import { View, Text, StyleSheet, Dimensions, Pressable, Platform, StatusBar, NativeModules, NativeEventEmitter, PermissionsAndroid, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import MaterialIcons from "react-native-vector-icons/MaterialIcons";
import { Sound } from "react-native-nitro-sound";
import RNFS from "react-native-fs";
import { Buffer } from "buffer";
import { ASR_URL, MODEL_URL } from "@env";
import Geolocation from "react-native-geolocation-service";

import MapViewComponent from "./map-view-component";
import ActiveVoiceModal from "../components/active-voice-modal";
import { useWakeWord } from "../hooks/useWakeWord";
import supabase from "../supabase-client";

const ASR_ANDROID_URL = ASR_URL;
const MODEL_ANDROID_URL = MODEL_URL;
const { width } = Dimensions.get("window");

// helper icons
const getNavIcon = (instruction: string) => {
  if (!instruction) return "arrow-upward";
  const text = instruction.toLowerCase();
  if (text.includes("arrive") || text.includes("destination")) return "place";
  if (text.includes("u-turn")) return "u-turn-left";
  if (text.includes("right")) return "turn-right";
  if (text.includes("left")) return "turn-left";
  if (text.includes("roundabout")) return "roundabout-right";
  if (text.includes("keep right")) return "chevron-right"; 
  if (text.includes("keep left")) return "chevron-left";
  return "arrow-upward"; 
};

interface UserLocation {
  latitude: number;
  longitude: number;
  heading: number;
}

const NavigationScreen = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const isFocused = useIsFocused();
  console.log("!!! PARAMS RECEIVED:", JSON.stringify(route.params, null, 2));

  // Destructure route parameters provided by the Preview screen
  const { 
    start, destination, userId, sessionId, matching_coords, full_geometry, alternative_routes,
    routeDuration, routeDistance, routeVia, routeOption, avoidList, majorRoad, fromHistory,
    stepsInstructions = [], turnIndices = [] 
  } = route.params || {} as any;

 // --- NAVIGATION STATE ---
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const isSpeakingRef = useRef(false); // Prevents overlapping TTS audio
  const [refinedGeometry, setRefinedGeometry] = useState(null);
  const [userLocation, setUserLocation] = useState<any>(null);
  const [routePoints, setRoutePoints] = useState<any[]>([]);
  const [navState, setNavState] = useState({
    direction: stepsInstructions[1] || "Head to destination",
    distance: "Calculating...",
    distanceRemaining: routeDistance || "--",
    durationRemaining: routeDuration || "--",
    preferences: [
      routeOption, 
      (avoidList && avoidList.length > 0) ? `Avoid: ${avoidList.join(", ")}` : null,
      majorRoad
    ]
    .filter(val => val && val !== "") // Removes null, undefined, and empty strings
    .join(" | ") || "None"
  });

    // --- VOICE & MODAL STATE ---
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [isRecordingInModal, setIsRecordingInModal] = useState(false);
  const [isProcessingInModal, setIsProcessingInModal] = useState(false);
  const [vadModeActive, setVadModeActive] = useState(false);
  const [wakeWordActive, setWakeWordActive] = useState(false);

  const shouldAutoStartVadMode = useRef(false);
  const shouldAutoStartRecording = useRef(false);
  
  const lastSpokenRef = useRef("");

  // --- WAKE WORD HOOK ---
  useWakeWord({
    visible: isFocused && !isModalVisible,
    isRecording: isRecordingInModal,
    isProcessing: isProcessingInModal,
    vadMode: vadModeActive,
    onWakeWordDetected: () => {
      console.log("[Navigation] Wake word detected!");
      shouldAutoStartVadMode.current = true;
      setIsModalVisible(true);
    },
    onStatusChange: (active) => setWakeWordActive(active),
    onError: (err) => console.error("[Navigation] Wake word error:", err),
  });

  // --- HELPERS ---

  /**
   * HAVERSINE FORMULA:
   * Calculates the great-circle distance between two points on a sphere.
   */
  const getDistance = (a: {latitude: number, longitude: number}, b: {latitude: number, longitude: number}) => {
    const toRad = (v: number) => (v * Math.PI) / 180;
    const R = 6371000;
    const dLat = toRad(b.latitude - a.latitude);
    const dLon = toRad(b.longitude - a.longitude);
    const lat1 = toRad(a.latitude);
    const lat2 = toRad(b.latitude);
    const aVal = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
    return R * 2 * Math.atan2(Math.sqrt(aVal), Math.sqrt(1 - aVal));
  };

  // Formats distance in meters to a more readable string (e.g., "500 m" or "1.2 km")
  const formatDistance = (meters: number) => {
    if (meters < 1000) return `${Math.round(meters)} m`;
    return `${(meters / 1000).toFixed(1)} km`;
  };

  // Formats duration based on distance, assuming an average speed
  const formatDuration = (meters: number) => {
    // Assuming average city speed of 25km/h (approx 7 meters per second)
    const seconds = meters / 7; 
    const mins = Math.round(seconds / 60);
    
    if (mins < 1) return "Soon";
    if (mins < 60) return `${mins} mins`;
    
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h}h ${m}m`;
  };

  /**
   * MANUAL REROUTE:
   * In case the user goes off-route, call this function to fetch a new route from the backend.
   */
  const fetchManualReroute = async (currentCoords: { lat: number; lng: number }) => {
    try {
      const response = await fetch(`${MODEL_ANDROID_URL}/directions/reroute`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          user_id: userId,
          destination: destination,
          lat: currentCoords.lat,
          lng: currentCoords.lng
        }),
      });

      return await response.json();
    } catch (error) {
      console.error("Reroute API error:", error);
      return null;
    }
  };

  // --- VOICE HANDLERS --

  /**
   * Sends text to the backend ASR/TTS engine, receives a buffer, saves it locally, and plays the audio.
   */
  const playTTS = async (text: string) => {
    if (isSpeakingRef.current || !text) return;
    isSpeakingRef.current = true;
    try {
      const res = await fetch(`${ASR_ANDROID_URL}/speak`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) return;
      const buffer = Buffer.from(await res.arrayBuffer());
      const path = `${RNFS.CachesDirectoryPath}/tts.mp3`;
      await RNFS.writeFile(path, buffer.toString("base64"), "base64");
      await Sound.startPlayer(Platform.OS === 'android' ? `file://${path}` : path);

      // Brief lockout to prevent spamming audio
      setTimeout(() => { isSpeakingRef.current = false; }, 3000);
    } catch { isSpeakingRef.current = false; }
  };

  // --- EFFECTS ---

  // Initial Distance Calculation to First Turn
  useEffect(() => {
    if (routePoints.length > 0 && turnIndices.length > 1) {
      // turnIndices[0] is usually 0 (the start)
      // turnIndices[1] is the location of the FIRST actual turn
      const firstTurnCoord = routePoints[turnIndices[1]];
      const startCoord = routePoints[0];

      if (firstTurnCoord && startCoord) {
        const distToFirstTurn = getDistance(startCoord, firstTurnCoord);
        
        setNavState(prev => ({
          ...prev,
          distance: formatDistance(distToFirstTurn)
        }));
      }
    }
  }, [routePoints, turnIndices]);

  // Decode Route Geometry
  useEffect(() => {
    const source = (full_geometry?.length > 0) ? full_geometry 
                : (matching_coords?.length > 0) ? matching_coords 
                : [];

    const points = source.map((c: any) => ({
      latitude: Array.isArray(c) ? c[1] : c.lat || c.latitude,
      longitude: Array.isArray(c) ? c[0] : c.lng || c.longitude
    }));

    setRoutePoints(points);
  }, [full_geometry, matching_coords]);

  // Save Trip History 
  useEffect(() => {
    const saveTrip = async () => {
      if (!destination || fromHistory) return;
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const originName = (start && typeof start === "string" && !start.includes("Location")) ? start : "Current Location";
        const { data: existing } = await supabase.from("trip_history").select("id").eq("user_id", userId).eq("origin_name", originName).eq("destination_name", destination).limit(1);
        if (existing && existing.length > 0) return;
        await supabase.from("trip_history").insert({ user_id: userId || user.id, origin_name: originName, destination_name: destination });
      } catch {}
    };
    saveTrip();
  }, [destination]);

  /**
   * MAIN NAVIGATION LOOP:
   * Sets up a high-accuracy GPS watch. Every update triggers:
   * 1. Distance Calculation: Finds remaining meters to the destination.
   * 2. Step Logic: Monitors proximity to the NEXT turn index.
   * 3. Proactive Voice: Announces turns at 300m and 100m.
   * 4. Handoff: When < 30m from a turn, it transitions UI to the following step.
   */
  useEffect(() => {
    if (routePoints.length === 0 || stepsInstructions.length === 0) return;
    let watchId: number | null = null;

    const startGps = async () => {
      if (Platform.OS === "android") {
        const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
        if (granted !== PermissionsAndroid.RESULTS.GRANTED) return;
      }

      watchId = Geolocation.watchPosition((pos) => {
          const current = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
          setUserLocation({ ...current, heading: pos.coords.heading || 0 });

          // --- TOTAL DISTANCE REMAINING CALCULATION ---
          // Find the index in routePoints that the user is currently closest to
          let nearestIdx = 0;
          let minDist = Infinity;

          // To save performance, only search near the current step's range
          const searchStart = turnIndices[currentStepIndex] || 0;
          for (let i = searchStart; i < routePoints.length; i++) {
            const d = getDistance(current, routePoints[i]);
            if (d < minDist) {
              minDist = d;
              nearestIdx = i;
            }
            // If distance starts increasing, the closest point has been passed
            if (d > minDist && i > searchStart + 10) break; 
          }

          // Sum up all segments from current position -> next point -> ... -> end
          let totalMetersRemaining = getDistance(current, routePoints[nearestIdx]);
          for (let i = nearestIdx; i < routePoints.length - 1; i++) {
            totalMetersRemaining += getDistance(routePoints[i], routePoints[i+1]);
          }

          // --- UPDATE STATE ---
          // Identify the NEXT turn instruction based on currentStepIndex
          const nextStepIndex = currentStepIndex + 1;

          // Turn-by-Turn fallback logic
          if (nextStepIndex < turnIndices.length) {
            // Find the coordinate in routePoints that matches this turn
            const nextTurnPointIdx = turnIndices[nextStepIndex];
            const nextTurnCoord = routePoints[nextTurnPointIdx];

            if (nextTurnCoord) {
              const step = stepsInstructions[nextStepIndex];
              const distanceToTurn = getDistance(current, nextTurnCoord);
            
              setNavState(prev => ({ 
                ...prev,
                direction: step,
                distance: formatDistance(distanceToTurn),
                distanceRemaining: formatDistance(totalMetersRemaining),
                durationRemaining: formatDuration(totalMetersRemaining)
              }));

              // 300m Alert
              if (distanceToTurn < 300 && distanceToTurn > 100 && lastSpokenRef.current !== `300_${nextStepIndex}`) {
                const newInstruction = `In 300 meters, ${stepsInstructions[nextStepIndex]}`;
                playTTS(newInstruction);
                lastSpokenRef.current = `300_${nextStepIndex}`;
              }

              // We play the TTS early so the user hears it BEFORE the turn.
              if (distanceToTurn < 100 && distanceToTurn > 30 && lastSpokenRef.current !== `100_${nextStepIndex}`) {
                const newInstruction = stepsInstructions[nextStepIndex];
                playTTS(newInstruction);
                lastSpokenRef.current = `100_${nextStepIndex}`;
              }

              // Only switch the UI text and distance tracking to the NEXT turn once the user is AT the current turn (e.g., 10m).
              if (distanceToTurn < 30) {
                const followingStepIdx = nextStepIndex + 1;
                setCurrentStepIndex(nextStepIndex);

                // Look ahead and announce the NEXT instruction immediately
                if (followingStepIdx < stepsInstructions.length) {
                  const currentTurnCoord = routePoints[turnIndices[nextStepIndex]];
                  const followingTurnCoord = routePoints[turnIndices[followingStepIdx]];
                  const nextInstructionText = stepsInstructions[followingStepIdx];

                  if (currentTurnCoord && followingTurnCoord) {
                    // Calculate the length of the road segment we just entered
                    const segmentDist = getDistance(currentTurnCoord, followingTurnCoord);
                    const formattedSegment = formatDistance(segmentDist);

                    // --- THE VOICE COMMAND ---
                    // "In 1.2 km, turn right onto Main Street"
                    const announcement = `In ${formattedSegment}, ${nextInstructionText}`;
                    
                    if (lastSpokenRef.current !== `then_${followingStepIdx}`) {
                      playTTS(announcement);
                      lastSpokenRef.current = `then_${followingStepIdx}`;
                    }
                  }
                } else {
                    // If there is no "following" step, announce the final instruction
                    const finalMsg = stepsInstructions[stepsInstructions.length - 1];
                    playTTS(finalMsg);
                  }
              }
            }
          } else {
            // Handle Arrival logic
            const destinationCoord = routePoints[routePoints.length - 1];
            const distToEnd = getDistance(current, destinationCoord);
            
            if (distToEnd < 50) {
              const arrivalMsg = "You have arrived!";
              setCurrentStepIndex(stepsInstructions.length - 1);
              playTTS(arrivalMsg);
              setTimeout(() => { handleEndTrip(); }, 5000);
            }
          }
        },
        () => {},
        { enableHighAccuracy: true, distanceFilter: 5, interval: 2000 }
      );
    };

    startGps();
    return () => { if (watchId !== null) Geolocation.clearWatch(watchId); };
  }, [routePoints, currentStepIndex, stepsInstructions, turnIndices]);

  /**
   * Calls the backend to clear the current trip session, then navigates back to the previous screen.
   */
  const endTripSession = async () => {
    try {
      console.log("[Navigation] Ending session:", sessionId);
      const response = await fetch(`${MODEL_ANDROID_URL}/end_trip`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Session-ID": sessionId,
        },
      });
      const result = await response.json();
      console.log("[Navigation] Session cleared:", result);
    } catch (error) {
      console.error("[Navigation] Failed to clear session:", error);
    }
  };

  const handleEndTrip = async () => {
    await endTripSession();
    if (navigation.canGoBack()) navigation.goBack();
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      
      <View style={StyleSheet.absoluteFill}>
        <MapViewComponent
          start={start} 
          destination={destination}
          userId={userId}
          previewMode={false}
          followUser={true}
          matchingCoords={refinedGeometry || full_geometry}
          heading={userLocation?.heading}
        />
      </View>

      <SafeAreaView style={styles.topSafeArea} pointerEvents="box-none">
        <View style={styles.instructionContainer}>
          <View style={styles.mainCard}>
            <MaterialIcons name={getNavIcon(navState.direction)} size={36} color={"#ffffff"} style={styles.iconMain} />
            <View style={{ flex: 1 }}>
              <Text style={styles.instructionDistance}>{navState.distance}</Text>
              <Text style={styles.instructionTextBold} numberOfLines={2}>{navState.direction}</Text>
            </View>
          </View>
        </View>
      </SafeAreaView>

      {/* Voice Elements */}
      <View style={styles.micContainer}>
        {wakeWordActive && (
          <View style={styles.wakeWordIndicator}>
            <View style={styles.listeningDot} />
            <Text style={styles.wakeWordText}>Say "Hey Route"</Text>
          </View>
        )}
        <Pressable onPress={() => setIsModalVisible(true)} style={styles.voiceButton}>
          <MaterialIcons name="keyboard-voice" size={28} color="#3e0d73" />
        </Pressable>
      </View>

      <ActiveVoiceModal
        userId={userId}
        sessionId={sessionId}
        visible={isModalVisible}
        onClose={() => setIsModalVisible(false)}
        onTranscriptionComplete={(text) => {
          console.log("[Voice] Transcribed:", text);
        }}
        onNavigationTriggered={(data) => {
          setIsModalVisible(false);
          if (data.navigation_started === false) handleEndTrip();
        }}
        onRoutePreview={() => {
          console.log("[Voice] Route preview requested");
        }}
        autoStartRecording={shouldAutoStartRecording}
        autoStartVadMode={shouldAutoStartVadMode}
        onRecordingStateChange={setIsRecordingInModal}
        onProcessingStateChange={setIsProcessingInModal}
        onVadModeChange={setVadModeActive}
      />

      <View style={styles.preferencesContainer}>
          <Text style={styles.preferencesText}>Preferences: {navState.preferences} </Text>
      </View>

      {/* Bottom Panel */}
      <View style={styles.bottomPanel}>
        <View style={styles.tripInfo}>
          <Text style={styles.timeText}>{navState.durationRemaining}</Text>
          <Text style={styles.remainingDistance}>{navState.distanceRemaining} remaining</Text>
        </View>
        <Pressable style={styles.endButton} onPress={handleEndTrip}>
          <Text style={styles.endButtonText}>End Trip</Text>
        </Pressable>
      </View>
    </View>
  );
};

export default NavigationScreen;

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: "#fff" 
  },
  topSafeArea: { 
    flex: 1, 
    alignItems: 'center' 
  },
  instructionContainer: { 
    width: width * 0.9, 
    marginTop: Platform.OS === 'ios' ? 10 : 40
   },
  mainCard: {
    backgroundColor: "#121236",
    borderRadius: 16,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    elevation: 5,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 5,
  },
  iconMain: { 
    marginRight: 15
  },
  instructionDistance: { 
    fontSize: 24, 
    fontWeight: '800', 
    color: '#fff' 
  },
  instructionTextBold: { 
    fontSize: 18, 
    color: "#ffffff", 
    fontWeight: "700" 
  },
  bottomPanel: {
    position: "absolute",
    bottom: 0,
    height: 180,
    width: "100%",
    backgroundColor: "#8c7cac",
    paddingHorizontal: 25, 
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: Platform.OS === 'ios' ? 30 : 10,
  },
  timeText: { 
    color: "#ffffff", 
    fontSize: 28, 
    fontWeight: "700" 
  },
  remainingDistance: { 
    color: "#FFFFFF", 
    fontSize: 14, 
    fontWeight: "600" 
  },  
  preferencesContainer:{
    position: "absolute",
    bottom: 150, 
    width: "100%",
    backgroundColor: "rgba(223, 222, 222, 0.9)", 
    paddingVertical: 8,
    alignItems: 'center',
    zIndex: 9,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.1)',
  },
  preferencesText: {
    color: "#1d1d1d",
    fontSize: 12,
    fontWeight: "600",
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  endButton: { 
    backgroundColor: "#e2e0e0", 
    paddingVertical: 10,
    paddingHorizontal: 20, 
    borderRadius: 24 
  },
  endButtonText: { 
    color: "#2A2A2A", 
    fontSize: 14, 
    fontWeight: "700" 
  },
  micContainer: { 
    position: 'absolute', 
    right: 20, 
    bottom: 200, 
    alignItems: 'center', 
    zIndex: 40 
  },
  voiceButton: {
    backgroundColor: "#fff",
    width: 56, height: 56, 
    borderRadius: 28,
    justifyContent: "center", 
    alignItems: "center",
    elevation: 5, 
    shadowColor: "#000", 
    shadowOpacity: 0.3, 
    shadowRadius: 5,
  },
  wakeWordIndicator: {
    flexDirection: "row", 
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.9)",
    paddingHorizontal: 10, 
    paddingVertical: 5, 
    borderRadius: 15, 
    marginBottom: 8,
  },
  listeningDot: { 
    width: 6, 
    height: 6, 
    borderRadius: 3, 
    backgroundColor: "#4CAF50", 
    marginRight: 5 
  },
  wakeWordText: { 
    fontSize: 10, 
    color: "#666", 
    fontWeight: "600" 
  },
  tripInfo: { 
    flexDirection: 'column' 
  },
});