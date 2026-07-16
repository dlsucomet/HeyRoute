/**
 * This module defines the ActiveVoiceModal component, which is responsible for managing the voice interaction flow in the app.
 * 
 * Handles: 
 * - Recording & Processing state and UI feedback
 * - Transcription results display
 * - Communication with the useVoiceAssistant hook for ASR interactions
 * - Auto-starting recording when triggered by wake word detection
 */

import React, { useEffect } from "react";
import { StyleSheet, Text, Pressable, Modal, ActivityIndicator, View } from "react-native";
import Icon from "react-native-vector-icons/Ionicons";
import { useVoiceAssistant } from "../hooks/useVoiceAssistant";
import { ActiveVoiceModalProps } from "../types/navigation";
import { ASR_URL } from "@env";

const ASR_ANDROID_URL = ASR_URL;

const ActiveVoiceModal = ({
  visible,
  onClose,
  onTranscriptionComplete,
  onNavigationTriggered,
  onRoutePreview,
  userId,
  sessionId,
  autoStartVadMode,  
  onRecordingStateChange,
  onProcessingStateChange,
  onResponse,
}: ActiveVoiceModalProps) => {
  useEffect(() => {
    console.log("[Modal] Received identity props:", { userId, sessionId });
  }, [userId, sessionId]);

  // Logic is encapsulated in useVoiceAssistant to keep the UI component clean
  const {
    result,
    isRecording,
    isProcessing,
    handleVoicePress,
    whenClosing,
    notVisible,
    startConversation
  } = useVoiceAssistant({
    userId, sessionId, visible, onClose,
    onTranscriptionComplete, onNavigationTriggered, onRoutePreview, onResponse,
  });

  // Bubble recording/processing state up to HomeScreen for wake word management
  useEffect(() => {
    console.log("[Modal] isRecording changed:", isRecording);
    onRecordingStateChange?.(isRecording);
  }, [isRecording]);

  useEffect(() => {
    console.log("[Modal] isProcessing changed:", isProcessing);
    onProcessingStateChange?.(isProcessing);
  }, [isProcessing]);

  // Handle visibility changes — auto-start recording if triggered by wake word
  useEffect(() => {
    console.log("[Modal] visible changed to:", visible, "autoStartVadMode:", autoStartVadMode?.current);
    if (visible) {
      if (autoStartVadMode?.current) {
        console.log("[Modal] Wake word path triggered, scheduling startConversation...");
        autoStartVadMode.current = false;
        setTimeout(() => {
          console.log("[Modal] setTimeout fired, calling startConversation...");
          startConversation();
        }, 300);
      } else {
        console.log("[Modal] Modal opened manually, not auto-starting.");
      }
    } else {
      notVisible();
    }
  }, [visible]);

  /**
   * Ensures the mic is properly released before the modal fully unmounts.
   */
  const handleClose = async () => {
    console.log("[Modal] handleClose called — releasing mic before closing.");
    await whenClosing(); // await so mic is fully released before OpenWakeWord can reinit
    onClose();
  };

  /**
   * Helper to determine the status message displayed to the user
   */
  const getDisplayText = () => {
    if (isProcessing) return "Processing...";
    if (isRecording) return "Listening... (Tap stop to process)";
    if (result) return result;
    return "Tap the mic to start recording";
  };

  return (
    <Modal
      animationType="slide"
      transparent={true}
      visible={visible}
      onRequestClose={handleClose}
    >
      <Pressable style={styles.modalOverlay} onPress={handleClose}>
        <Pressable style={styles.voiceModalContent}>
          <Text style={styles.voiceModalText}>{getDisplayText()}</Text>

          <Pressable
            onPress={handleVoicePress}
            disabled={isProcessing}
            style={({ pressed }) => [
              styles.micButtonContainer,
              isRecording && styles.micListening,
              pressed && !isProcessing ? { opacity: 0.85, transform: [{ scale: 0.96 }] } : null,
              isProcessing && { opacity: 0.7 },
            ]}
          >
            {isProcessing ? (
              <ActivityIndicator size="large" color="#FFF" />
            ) : isRecording ? (
              <Icon name="stop-circle" size={44} color="#FFF" />
            ) : (
              <Icon name="mic-circle" size={44} color="#FFF" />
            )}
          </Pressable>

          <Pressable onPress={handleClose} style={styles.closeButton}>
            <Text style={styles.closeButtonText}>Done</Text>
          </Pressable>

          <View style={styles.footerNote}>
            <Text style={styles.footerText}>ASR server: {ASR_ANDROID_URL}</Text>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

export default ActiveVoiceModal;

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "transparent",
  },
  voiceModalContent: {
    width: "100%",
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 25,
    alignItems: "center",
    paddingTop: 40,
    minHeight: 300,
  },
  voiceModalText: {
    fontSize: 18,
    marginTop: 10,
    marginBottom: 24,
    fontWeight: "500",
    color: "#000",
    textAlign: "center",
  },
  micButtonContainer: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: "#2f2150",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 10,
    marginBottom: 18,
  },
  micListening: {
    backgroundColor: "#ff4d4d",
    transform: [{ scale: 1.05 }],
  },
  closeButton: {
    position: "absolute",
    top: 12,
    right: 16,
    padding: 8,
  },
  closeButtonText: {
    color: "#1e1e8f",
    fontSize: 16,
    fontWeight: "700",
  },
  footerNote: {
    marginTop: 10,
  },
  footerText: {
    fontSize: 12,
    color: "#666",
  },
});
