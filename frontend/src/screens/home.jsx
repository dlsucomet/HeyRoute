/**
 * This screen serves as the main entry point for users to interact with HeyRoute's voice navigation features.
 * 
 * Handles: 
 * - Wake word detection and voice input through ActiveVoiceModal
 * - Displaying the map with current location and destination
 * - Navigating to the DirectionsCard for manual input
 * - Managing state related to voice interactions, navigation, and UI elements
 */

import React, { useState, useEffect, useRef } from "react";
import { View, StyleSheet, Pressable, Platform, Text, Keyboard, ActivityIndicator, NativeModules, Switch } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import MaterialIcons from "react-native-vector-icons/MaterialIcons";
import { useNavigation, useRoute, useIsFocused } from "@react-navigation/native"
import { customEvent, identifyDevice } from 'vexo-analytics';

import DirectionsCard from "../components/directions-card";
import ActiveVoiceModal from "../components/active-voice-modal";
import NavBar from "../components/navbar";
import MapViewComponent from "../components/map-view-component";
import { useWakeWord } from "../hooks/useWakeWord";
import supabase from '../supabase-client';
import { getLocalSession } from "../utils/session";

import { PermissionsAndroid } from 'react-native';

const { NavigationModule } = NativeModules;

const HomeScreen = () => {
  const navigation = useNavigation();
  const isFocused = useIsFocused();
  const route = useRoute();

  // --- State ---
  const [userId, setUserId] = useState(null);
  const [sessionId, setSessionId] = useState();

  const [heyrouteResponse, setHeyrouteResponse] = useState("");
  const [transcribedText, setTranscribedText] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  const [isModalVisible, setIsModalVisible] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [showHelpPanel, setShowHelpPanel] = useState(false);
  const [isHelpToggled, setIsHelpToggled] = useState(false);

  const [isRecordingInModal, setIsRecordingInModal] = useState(false);
  const [isProcessingInModal, setIsProcessingInModal] = useState(false);
  const [vadModeActive, setVadModeActive] = useState(false);
  const [wakeWordActive, setWakeWordActive] = useState(false);

  const [start, setStart] = useState("");
  const [destination, setDestination] = useState("");
  const [preference, setPreference] = useState("");

  const [autoTriggerNav, setAutoTriggerNav] = useState(false);
  const [fromHistoryNav, setFromHistoryNav] = useState(false);

  // Control refs for passing auto-start triggers to the Modal
  const shouldAutoStartRecording = useRef(false);
  const shouldAutoStartVadMode = useRef(false);
  const isFirstRender = useRef(true);

  /**
   * Sync auth user with analytics and session tracking
   */
  useEffect(() => {
    const fetchId = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserId(user.id);
        identifyDevice(user.id);
      }
      const sId = await getLocalSession();
      setSessionId(sId);
    };
    fetchId();
  }, []);

  /**
   * Android specifically needs RECORD_AUDIO permission for both Wake Word (Porcupine) and ASR (Voice Assistant).
   */
  useEffect(() => {
    const checkMicPermission = async () => {
      if (Platform.OS === 'android') {
        const granted = await PermissionsAndroid.check(
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO
        );
        if (!granted) {
          await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
            {
              title: "Microphone Permission",
              message: "HeyRoute needs microphone access for voice control.",
              buttonPositive: "Allow"
            }
          );
        }
      }
    };
    checkMicPermission();
  }, []);

  useEffect(() => {
    isFirstRender.current = false;
  }, []);

  /**
   * When arriving from the History Screen, pre-populate the navigation state 
   * and automatically trigger the DirectionCard's search logic.
   */
  useEffect(() => {
    if (route.params?.prefillDestination) {
      setDestination(route.params.prefillDestination);
      setStart(route.params.prefillStart || "Current Location");
      setIsHelpToggled(true);
      setAutoTriggerNav(true);
      setFromHistoryNav(route.params.fromHistory || false);

      // Clean up params so a screen refresh doesn't trigger prefill again
      navigation.setParams({ prefillDestination: undefined, prefillStart: undefined, fromHistory: undefined });
    }
  }, [route.params?.prefillDestination]);

  /**
   * Handles deep links or navigation from other screens that want to trigger voice navigation with a specific destination.
   */
  useEffect(() => {
    if (route.params?.initialDestination) {
      setDestination(route.params.initialDestination);
      setIsHelpToggled(true); 
    }
    if (route.params?.autoTrigger) {
      setAutoTriggerNav(route.params.autoTrigger);
    }
  }, [route.params?.initialDestination, route.params?.autoTrigger]);

  /**
   *Listens for "Hey Route". If detected, it sets a ref and opens the Voice Modal.
   */
  const wakeWordVisible = isFocused && !isModalVisible;

  useWakeWord({
    visible: wakeWordVisible,
    isRecording: isRecordingInModal,
    isProcessing: isProcessingInModal,
    vadMode: vadModeActive,
    onWakeWordDetected: () => {
      shouldAutoStartVadMode.current = true; // Tell the modal to start listening immediately
      handleVoicePress();
    },
    onError: (err) => console.error("[HomeScreen] Wake word error:", err),
    onStatusChange: (active) => setWakeWordActive(active),
  });

  /**
   * Used when a user just says a destination without starting a full route calculation.
   */
  const handleDestinationExtracted = async (destinationText) => {
    setIsModalVisible(false);
    setIsHelpToggled(true);
    setDestination(destinationText);
    setStart("Current Location");
    
    // Save the discovery to the history database
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        let profileUserId = userId;
        if (!profileUserId) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("user_id")
            .eq("email", user.email)
            .single();
          profileUserId = profile?.user_id || user.id;
        }
        await supabase.from("trip_history").insert({
          user_id: profileUserId,
          origin_name: "Current Location",
          destination_name: destinationText,
        });
      }
    } catch {}
  };

  /**
   * Reset all voice-related flags whenever the screen regains focus.
   */
  useEffect(() => {
    if (isFocused) {
      setIsModalVisible(false);
      setIsRecordingInModal(false);
      setIsProcessingInModal(false);
      setVadModeActive(false);
    }
  }, [isFocused]);

  /**
   * Processes the data received from the voice navigation and triggers the primary NavigationScreen (Turn-by-turn).
   */
  const handleNavigationTriggered = (heyrouteData) => {
    setIsModalVisible(false);

    if(heyrouteResponse.text) {
      setHeyrouteResponse(heyrouteResponse.text);
    }

    // For analytics
    customEvent('Navigation_Started', {
      destination: heyrouteData.route?.end,
      has_alternatives: (heyrouteData.alternatives?.length > 0)
    });
    
    // Cleanup if switching from an active route to a new one
    if (heyrouteData.switch_route) {
      NavigationModule.stopNavigation();
      setStart("");
      setDestination("");
    }

    // AI extracted a destination but hasn't started full nav yet
    if (heyrouteData.destination && !heyrouteData.auto_navigate) {
      handleDestinationExtracted(heyrouteData.destination);
      return;
    }

    // If navigation is stopped, we reset. 
    if (heyrouteData.navigation_started === false) {
      NativeModules.NavigationModule.stopNavigation();
      setStart(""); 
      setDestination("");
      return;
    }

    const primaryRoute = heyrouteData.route;
    const alternatives = heyrouteData.alternatives || [];
    const preferences = heyrouteData.preferences || heyrouteData.preference || {};

    // Check if primaryRoute exists before navigating
    if (!primaryRoute || !primaryRoute.end) {
      console.error("Route data is missing from backend response");
      return;
    }

    // Pass the parameters directly to the Navigation Screen
    navigation.navigate("NavigationScreen", {
      start: primaryRoute.start,
      destination: primaryRoute.end,
      full_geometry: primaryRoute.full_geometry, 
      alternative_routes: alternatives,
      userId: userId,
      sessionId: heyrouteData.session_id,
      routeDuration: primaryRoute.duration,
      routeDistance: primaryRoute.distance,
      routeVia: primaryRoute.via,
      stepsInstructions: primaryRoute.steps_instructions,
      turnIndices: primaryRoute.turn_indices,
      fromHistory: false,
      routeOption: preferences.route_option,
      avoidList: preferences.avoid_list,
      majorRoad: preferences.major_road
    });
  };

  /**
   * Opens the multi-route selection screen before starting navigation.
   */
  const handleRoutePreview = (heyrouteData) => {
    setIsModalVisible(false);

    const routeStart = heyrouteData.origin;
    const routeDestination = heyrouteData.destination;
    const preferences = heyrouteData.preferences || heyrouteData.preference || {};

    // Pass the parameters directly to the Route Preview Screen
    navigation.navigate("RoutePreview", {
      start: routeStart || "Your location",
      destination: routeDestination || "Destination",
      userId: userId,
      routeData: heyrouteData,
      sessionId: heyrouteData.session_id,
      routeOption: preferences.route_option,
      avoidList: preferences.avoid_list,
      majorRoad: preferences.major_road,
      autoStartMicrophone: heyrouteData.continue_listening,
      micDelay: heyrouteData.speech_delay
    });
  };

  const handleVoicePress = () => {
    if (isModalVisible) return;
    setIsModalVisible(true);
  };

  const closeModal = () => setIsModalVisible(false);

  /**
   * Sets the transcribed text to display in the UI and trigger processing states, and logs the performance of the AI pipeline.
   */
  const handleTranscription = (text, metrics) => {
    if (metrics) {
      customEvent('AI_Response_Received', {
        total_latency_ms: metrics.total_turnaround_ms,
        asr_ms: metrics.asr_ms,
        groq_cleaning_ms: metrics.cleaning_ms,
        gpt_thinking_ms: metrics.heyroute_ms
      });
    }
    setTranscribedText(text);
    setIsProcessing(true);
  };

  // Auto-hide the "Manual Input" help hint after 1 second
  useEffect(() => {
    if (isHelpToggled) {
      const timer = setTimeout(() => setShowHelpPanel(false), 1000);
      return () => clearTimeout(timer);
    }
  }, [isHelpToggled]);

  return (
    <SafeAreaView style={styles.container}>
      
      {/* Map Background - Uses start/destination for geometry */}
      <MapViewComponent
        userId={userId}
        start={start}
        destination={destination}
      />

      <View style={styles.navContainer} pointerEvents="box-none">
        <NavBar userId={userId} />
      </View>

      {isHelpToggled && (
        <View style={styles.overlayContainer}>
          <Pressable 
            style={styles.backdrop} 
            onPress={() => setIsHelpToggled(false)} 
          />
          <View style={styles.cardWrapper}>
            <DirectionsCard
              userId={userId}
              onSetStart={setStart}
              onSetDestination={setDestination}
              onSetPreference={setPreference}
              initialDestination={destination}
              initialStart={start}
              onClose={() => {
                setIsHelpToggled(false);
                setAutoTriggerNav(false);
                setFromHistoryNav(false);
              }}
              autoTrigger={autoTriggerNav}
              fromHistory={fromHistoryNav}
            />
          </View>
        </View>
      )}

       {!keyboardVisible && (
        <View style={styles.micContainer}>
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
      )}

      <ActiveVoiceModal
        userId={userId}
        sessionId={sessionId}
        visible={isModalVisible}
        onClose={closeModal}
        onTranscriptionComplete={handleTranscription}
        onNavigationTriggered={handleNavigationTriggered}
        onRoutePreview={handleRoutePreview}
        autoStartRecording={shouldAutoStartRecording}
        autoStartVadMode={shouldAutoStartVadMode}
        onRecordingStateChange={setIsRecordingInModal}
        onProcessingStateChange={setIsProcessingInModal}
        onVadModeChange={setVadModeActive}
      />

      {showHelpPanel && (
        <View style={styles.helpPanelContainer}>
          <Text style={styles.helpPanelText}> Enable Manual Input </Text>
          <Switch
            trackColor={{ false: "#767577", true: "rgb(65, 47, 86)" }}
            thumbColor={"#ffffff"}
            onValueChange={(val) => {
              setIsHelpToggled(val);
              if (!isFirstRender.current) {
                customEvent('Interaction_Method', { type: 'manual_input_toggled', enabled: val });
              }
            }}
            value={isHelpToggled}
          />
        </View>
      )}

      {!keyboardVisible && (
        <Pressable 
          style={({ pressed }) => [
            styles.helpIconContainer,
            pressed && { opacity: 0.7 }
          ]}
          onPress={() => setShowHelpPanel(!showHelpPanel)}
        >
          <MaterialIcons name="keyboard-alt" color="#9878ab" size={26} />
        </Pressable>
      )}
    </SafeAreaView>
  );
};

export default HomeScreen;

const styles = StyleSheet.create({
  container: { flex: 1 },
  navContainer: {
    position: "absolute",
    top: Platform.OS === "ios" ? 45 : 25,
    width: "100%",
    paddingHorizontal: 20,
    zIndex: 30,
  },
  overlayContainer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 50,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.3)",
  },
  cardWrapper: {
    position: "absolute",
    top: Platform.OS === "ios" ? 130 : 90,
    width: "100%",
    paddingHorizontal: 20,
  },
  micContainer: {
    position: "absolute",
    bottom: 150,
    alignSelf: "center",
    zIndex: 45,
    alignItems: "center",
    justifyContent: "center",
  },
  wakeWordIndicator: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.95)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginBottom: 10,
    elevation: 3,
  },
  listeningDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#4CAF50",
    marginRight: 6,
  },
  wakeWordText: {
    fontSize: 12,
    color: "#666",
    fontFamily: "Karla",
  },
  voiceButton: {
    backgroundColor: "rgb(255, 255, 255)",
    width: 70,
    height: 70,
    borderRadius: 40,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 5,
  },
  helpPanelContainer: {
    position: "absolute",
    top: Platform.OS === "ios" ? 100 : 35,
    right: 85,
    backgroundColor: "#ffffff",
    padding: 15,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    zIndex: 50,
    elevation: 5,
  },
  helpPanelText: {
    fontFamily: "Karla",
    fontSize: 14,
    color: "#333",
    fontWeight: "500",
    marginRight: 15,
  },
  helpIconContainer: {
    position: "absolute",
    top: Platform.OS === "ios" ? 45 : 35,
    right: 30,
    zIndex: 50,
    width: 50,             
    height: 50,               
    borderRadius: 25,         
    backgroundColor: "#ffffff", 
    justifyContent: "center",
    alignItems: "center",
    elevation: 5,
  },
});
