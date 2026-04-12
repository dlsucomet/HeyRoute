/**
 * This module manages the wake word detection functionality in a React Native app using the Picovoice Porcupine engine.
 * It initializes the wake word listener, handles detection events, manages the listener's lifecycle based on app state,
 * and provides error handling and status updates to the parent component.
 * 
 * Handles: 
 * - Initializing the Porcupine wake word engine when the component becomes visible.
 * - Listening for wake word detections and invoking a callback when detected.
 * - Pausing the listener when the app is busy (e.g., recording or processing) and resuming when idle.
 */

import { useEffect, useRef, useCallback } from 'react';
import { Platform } from 'react-native';
import RNFS from 'react-native-fs';
import { PorcupineManager } from '@picovoice/porcupine-react-native';
import { PICOVOICE_API_KEY } from '@env';
import { customEvent } from 'vexo-analytics';

interface UseWakeWordProps {
  visible: boolean;
  isRecording: boolean;
  isProcessing: boolean;
  vadMode?: boolean;
  onWakeWordDetected: () => void;
  onError: (errorMsg: string) => void;
  onStatusChange?: (active: boolean) => void;
}

export const useWakeWord = ({
  visible,
  isRecording,
  isProcessing,
  vadMode = false,
  onWakeWordDetected,
  onError,
  onStatusChange,
}: UseWakeWordProps) => {
  // --- Refs for Native Instance ---
  const managerRef = useRef<PorcupineManager | null>(null);
  const isListeningRef = useRef(false);
  const isStoppingRef = useRef(false);

  // Store latest callback values in refs to avoid stale closures
  // without adding them as effect dependencies
  const onWakeWordDetectedRef = useRef(onWakeWordDetected);
  const onErrorRef = useRef(onError);
  const onStatusChangeRef = useRef(onStatusChange);
  const isRecordingRef = useRef(isRecording);
  const isProcessingRef = useRef(isProcessing);
  const vadModeRef = useRef(vadMode);

  // Keep refs in sync with latest prop values on every render
  onWakeWordDetectedRef.current = onWakeWordDetected;
  onErrorRef.current = onError;
  onStatusChangeRef.current = onStatusChange;
  isRecordingRef.current = isRecording;
  isProcessingRef.current = isProcessing;
  vadModeRef.current = vadMode;

  /**
   * Helper to locate the custom .ppn (Porcupine Keyword) file.
   * Android looks in 'assets', while iOS requires a path from the Main Bundle.
   */
  const getKeywordPath = () => {
    if (Platform.OS === 'android') return 'heyroute.ppn';
    return `${RNFS.MainBundlePath}/heyroute.ppn`;
  };

  // Initialize once when visible becomes true, tear down when false
  useEffect(() => {
    let isMounted = true;

    /**
     * Initializes the PorcupineManager with the specified keyword and starts listening.
     */
    const initPorcupine = async () => {
      console.log("[WakeWord] initPorcupine called. visible:", visible, "managerRef:", !!managerRef.current, "isStopping:", isStoppingRef.current);
      isStoppingRef.current = false;

      try {
        if (managerRef.current) {
          console.log("[WakeWord] Already initialized, skipping.");
          return;
        }

        const keywordPath = getKeywordPath();
        console.log("[WakeWord] Creating PorcupineManager with path:", keywordPath);

        // Create the manager. The 3rd argument is the detection callback.
        const manager = await PorcupineManager.fromKeywordPaths(
          PICOVOICE_API_KEY,
          [keywordPath],
          (keywordIndex) => {
            // Read from refs to always have fresh values
            console.log("[WakeWord] RAW detection event. Index:", keywordIndex, "isRecording:", isRecordingRef.current, "isProcessing:", isProcessingRef.current, "vadMode:", vadModeRef.current);
            if (isRecordingRef.current || isProcessingRef.current || vadModeRef.current) {
              console.log("[WakeWord] Blocked — app is busy.");
              return;
            }
            // For analytics
            customEvent('Interaction_Method', { type: 'wake_word_detected', keyword_index: keywordIndex });
            console.log("[WakeWord] Calling onWakeWordDetected...");
            onWakeWordDetectedRef.current();
          },
          (err) => {
            console.error("[WakeWord] Runtime error:", err);
            onErrorRef.current("Wake word engine encountered an error.");
          }
        );

        console.log("[WakeWord] Manager created successfully.");

        // If the user closed the modal before the async init finished, delete the manager.
        if (!isMounted) {
          console.log("[WakeWord] Unmounted before start, deleting.");
          manager.delete();
          return;
        }

        managerRef.current = manager;
        await manager.start();
        isListeningRef.current = true;
        onStatusChangeRef.current?.(true);
        console.log("[WakeWord] Wake word listener started.");
      } catch (err: any) {
        console.error("[WakeWord] Wake word init failed:", err);
        if (err.message?.includes("Activation")) {
          onErrorRef.current("Wake word activation failed. Check your API key.");
        } else {
          onErrorRef.current(err.message || "Failed to start wake word engine.");
        }
        onStatusChangeRef.current?.(false);
      }
    };

    /**
     * Stops the PorcupineManager and deletes it.
     */
    const stopPorcupine = async () => {
      console.log("[WakeWord] stopPorcupine called. managerRef:", !!managerRef.current, "isStopping:", isStoppingRef.current);
      if (!managerRef.current || isStoppingRef.current) return;
      
      isStoppingRef.current = true; // Lock immediately to prevent double-stop
      
      try {
        console.log("[WakeWord] Stopping and deleting manager...");
        await managerRef.current.stop();
        managerRef.current.delete();
        managerRef.current = null;
        isListeningRef.current = false;
        isStoppingRef.current = false;
        onStatusChangeRef.current?.(false);
        console.log("[WakeWord] Wake word listener stopped and deleted.");
      } catch (e) {
        isStoppingRef.current = false;
        console.error("[WakeWord] Error stopping Porcupine:", e);
      }
    };

    if (visible) {
      initPorcupine();
    } else {
      stopPorcupine();
    }

    return () => {
      isMounted = false;
      stopPorcupine();
    };
  }, [visible]); // Only re-run when visibility changes — NOT on every render

  // Pause/resume listening based on recording or processing state
  // This effect does NOT reinitialize Porcupine, just pauses/resumes it
  useEffect(() => {
    const toggleListening = async () => {
      if (!managerRef.current) return;

      try {
        // If busy, stop the listener but keep the manager in memory
        if (isRecording || isProcessing || vadMode) {
          if (isListeningRef.current) {
            console.log("[WakeWord] Pausing listener — app is busy.");
            await managerRef.current.stop();
            isListeningRef.current = false;
            onStatusChangeRef.current?.(false);
          }
        } 
        // If idle and screen is visible, resume listening
        else if (visible) {
          if (!isListeningRef.current) {
            console.log("[WakeWord] Resuming listener.");
            await managerRef.current.start();
            isListeningRef.current = true;
            onStatusChangeRef.current?.(true);
          }
        }
      } catch (err) {
        console.error("[WakeWord] Failed to toggle wake word listening state:", err);
      }
    };

    toggleListening();
  }, [isRecording, isProcessing, vadMode, visible]);
};
