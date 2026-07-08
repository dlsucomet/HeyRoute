import React, { useState, useRef } from "react";
import { useNavigation, useRoute, useIsFocused } from "@react-navigation/native";
import { View, StyleSheet, Pressable, Text } from "react-native";
import MaterialIcons from "react-native-vector-icons/MaterialIcons";

import MapboxMapView from "./mapbox-map-view";
import ActiveVoiceModal from "../components/active-voice-modal";
import { useWakeWord } from "../hooks/useWakeWord";
import { useNavigationEngine } from "../hooks/useNavigationEngine";

const NavigationScreen = () => {
  const navigation = useNavigation() as any;
  const route = useRoute() as any;
  const isFocused = useIsFocused();

  // The backend passes the route details via route.params.
  // The most critical part for Nav SDK is destination.
  const { destination, userId, sessionId, routeData } = route.params || {};

  // --- VOICE & MODAL STATE ---
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [isRecordingInModal, setIsRecordingInModal] = useState(false);
  const [isProcessingInModal, setIsProcessingInModal] = useState(false);
  const [vadModeActive, setVadModeActive] = useState(false);
  const [wakeWordActive, setWakeWordActive] = useState(false);

  const shouldAutoStartVadMode = useRef(false);

  // --- NAVIGATION ENGINE ---
  const { currentInstruction, distanceToNextTurn, onLocationUpdate } = useNavigationEngine(routeData?.route || routeData || null);

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

  const handleArrival = () => {
    console.log("Arrived at destination!");
    // Go back or go to a summary screen
    navigation.navigate("Home");
  };

  return (
    <View style={styles.container}>
      {/* 1. Full-screen Mapbox Navigation View */}
      <MapboxMapView
        destination={destination}
        routePolyline={routeData?.route?.full_geometry || routeData?.full_geometry || []}
        previewMode={false} 
        onArrival={handleArrival} 
        onLocationUpdate={onLocationUpdate}
      />

      {/* 1.5 Custom Top Navigation Banner */}
      <View style={styles.topBanner}>
        <Text style={styles.instructionText} numberOfLines={2}>
          {currentInstruction}
        </Text>
        {distanceToNextTurn !== null && (
          <Text style={styles.distanceText}>
            {distanceToNextTurn > 1000 
              ? `In ${(distanceToNextTurn / 1000).toFixed(1)} km` 
              : `In ${Math.round(distanceToNextTurn)} m`}
          </Text>
        )}
      </View>

      {/* 2. Floating Mic Button for Voice Commands */}
      <View style={styles.micContainer}>
        {wakeWordActive && (
          <View style={styles.wakeWordIndicator}>
            <View style={styles.listeningDot} />
            <Text style={styles.wakeWordText}>Listening for "Hey Route"</Text>
          </View>
        )}
        <Pressable
          style={styles.voiceButton}
          onPress={() => {
            shouldAutoStartVadMode.current = false;
            setIsModalVisible(true);
          }}
        >
          <MaterialIcons name="mic" size={28} color="#8c7cac" />
        </Pressable>
      </View>

      {/* 3. Stop Navigation Button (Top Left) */}
      <Pressable 
        style={styles.stopButton} 
        onPress={() => navigation.navigate("Home")}
      >
        <MaterialIcons name="close" size={24} color="#000" />
      </Pressable>

      {/* 4. Active Voice Modal */}
      <ActiveVoiceModal
        visible={isModalVisible}
        onClose={() => {
          setIsModalVisible(false);
          setVadModeActive(false);
          shouldAutoStartVadMode.current = false;
        }}
        userId={userId}
        sessionId={sessionId}
        autoStartVadMode={shouldAutoStartVadMode}
        onRecordingStateChange={setIsRecordingInModal}
        onProcessingStateChange={setIsProcessingInModal}
        onVadModeChange={setVadModeActive}
        onResponse={(res: any) => {
          // If the AI wants to cancel navigation
          if (res?.intents?.cancellation) {
            navigation.navigate("Home");
          }
          // The Navigation SDK handles rerouting natively, 
          // but we can still listen for trip_changes here if needed.
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  stopButton: {
    position: "absolute",
    top: 130, // move down below banner
    left: 20,
    backgroundColor: "white",
    padding: 10,
    borderRadius: 20,
    elevation: 5,
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 5,
    zIndex: 50,
  },
  micContainer: {
    position: "absolute",
    right: 20,
    bottom: 40,
    alignItems: "center",
    zIndex: 40,
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
    marginRight: 5,
  },
  wakeWordText: {
    fontSize: 10,
    color: "#666",
    fontWeight: "600",
  },
  topBanner: {
    position: "absolute",
    top: 30,
    left: 20,
    right: 20,
    backgroundColor: "#1c1c1c",
    borderRadius: 15,
    padding: 20,
    elevation: 8,
    shadowColor: "#000",
    shadowOpacity: 0.5,
    shadowRadius: 10,
    zIndex: 50,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  instructionText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
    flex: 1,
    marginRight: 10,
  },
  distanceText: {
    color: "#66b3ff",
    fontSize: 16,
    fontWeight: "800",
  },
});

export default NavigationScreen;