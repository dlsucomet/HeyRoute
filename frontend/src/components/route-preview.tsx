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

import MapViewComponent from "../components/map-view-component";
import RouteSelectionPanel from "./route-selection-panel";
import ActiveVoiceModal from "../components/active-voice-modal";
import { useWakeWord } from "../hooks/useWakeWord";

const LOG_PREFIX = "[RoutePreviewScreen]";

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
  const primaryRoute = routeData?.route || (routeData?.routes && routeData.routes[0]) || null;
  const [activeFullGeometry, setActiveFullGeometry] = useState<any>(primaryRoute?.full_geometry || null);
  const [activeRouteId, setActiveRouteId] = useState("1");

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
    const selectedRoute = heyrouteData.route || primaryRoute;
    const newPrefs = heyrouteData.preferences || heyrouteData.preference || {};

    const payload = {
      start: start,
      destination: destination,
      userId: userId,
      sessionId: heyrouteData.session_id || sessionId,
      full_geometry: selectedRoute?.full_geometry,
      alternative_routes: heyrouteData.alternatives || [],
      routeDuration: selectedRoute?.duration,
      routeDistance: selectedRoute?.distance,
      routeVia: selectedRoute?.via,
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
    setHeyrouteResponse(heyrouteData.heyroute_response || "Updating routes...");
    // Logic to update local route state if AI suggests a different route could go here
  };

  // Build formatted routes for the panel
  let formattedRoutes: any[] = [];
  try {
    const rawRoutes = [];
    if (routeData?.route) {
      rawRoutes.push(routeData.route);
      if (routeData?.alternatives) rawRoutes.push(...routeData.alternatives);
    } else if (routeData?.routes) {
      rawRoutes.push(...routeData.routes);
    }

    // Map raw routes to the format expected by the RouteSelectionPanel
    formattedRoutes = rawRoutes.map((r, index) => ({
      ...r,
      id: String(index + 1),
      name: r.via ? `${r.via}` : `Route ${index + 1}`,
      tag: index === 0 ? "Recommended" : "Alternative Route",
      duration: r.duration || "-- mins",
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

        {/* Map */}
        <View style={StyleSheet.absoluteFill}>
          <MapViewComponent
            userId={userId}
            start={start}
            destination={destination}
            followUser={false}
            previewMode={true}
            matchingCoords={activeFullGeometry}
          />
        </View>

        {/* Header */}
        <View style={styles.headerCard}>
          <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
            <MaterialIcons name="arrow-back" size={24} color="#000" />
          </Pressable>
          <View style={styles.headerTextContainer}>
            <Text style={styles.headerLabel} numberOfLines={1}>
              {formatLocation(start, "Your location")} → {formatLocation(destination, "Destination")}
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
          start={start}
          destination={destination}
          userId={userId}
          routes={formattedRoutes}
          onStartPress={() => {
            const selectedRoute = formattedRoutes.find(r => r.id === activeRouteId) || formattedRoutes[0];
            (navigation as any).navigate("NavigationScreen", {
              start, destination, userId, sessionId,
              full_geometry: selectedRoute?.full_geometry,
              alternative_routes: routeData?.alternatives || [],
              routeDuration: selectedRoute?.duration,
              routeDistance: selectedRoute?.distance,
              routeVia: selectedRoute?.via,
              fromHistory: fromHistory || false,
              routeOption,
              avoidList,
              majorRoad
            });
          }}
          onRouteSelect={(selectedRoute: any) => {
            setActiveRouteId(selectedRoute?.id);
            if (selectedRoute?.full_geometry) setActiveFullGeometry(selectedRoute.full_geometry);
          }}
        />
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
});
