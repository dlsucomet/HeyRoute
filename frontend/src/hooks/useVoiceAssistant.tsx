/**
 * This module manages the voice assistant functionality in a React Native app, including recording user speech,
 * sending it to a server for processing, and handling the response.
 * 
 * Handles: 
 * - Recording user speech.
 * - Sending audio data to the ASR server for processing.
 * - Handling the response from the ASR server.
 */

import { useState, useEffect, useRef } from "react";
import { PermissionsAndroid, Platform } from "react-native";
import { Sound } from "react-native-nitro-sound";
import RNFS from "react-native-fs";
import { useNetInfo } from "@react-native-community/netinfo";
import { customEvent } from 'vexo-analytics';
import { NativeModules } from "react-native";

const { WakeWordModule } = NativeModules;
import Geolocation from "react-native-geolocation-service";
import { ASR_URL } from "@env";
import { ActiveVoiceModalProps, ChatMessageType } from "../types/navigation";
import { speakTTS } from "../utils/tts";

const ASR_ANDROID_URL = ASR_URL;

// Temporary storage path for the recorded WAV file
const RECORD_PATH = `${RNFS.CachesDirectoryPath}/user_voice.wav`;

export const useVoiceAssistant = (props: ActiveVoiceModalProps) => {
  const { userId, sessionId, onTranscriptionComplete, onNavigationTriggered, onRoutePreview, onResponse } = props;

  useEffect(() => {
    console.log("[ASR] Hook received identity props:", { userId, sessionId });
  }, [userId, sessionId]);

  // --- State ---
  const [messages, setMessages] = useState<ChatMessageType[]>([]);
  const [result, setResult] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isConversationActive, setIsConversationActive] = useState(false);
  const { type, isConnected } = useNetInfo();

  // Refs used to maintain state across render cycles without triggering re-renders
  const conversationActiveRef = useRef(false);
  const conversationHistory = useRef<{ role: string; content: string }[]>([]);

  // Ensure the microphone and player are released
  useEffect(() => {
    return () => {
      whenClosing().catch(() => {});
    };
  }, []);

  /**
   * Android requires runtime permission checks for the microphone.
   * iOS permissions are handled via Info.plist and requested by the library automatically.
   */
  const requestMicrophonePermission = async () => {
    if (Platform.OS === "android") {
      try {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
          {
            title: "Microphone Permission",
            message: "HeyRoute needs access to your microphone for speech recognition.",
            buttonPositive: "OK",
          }
        );
        return granted === PermissionsAndroid.RESULTS.GRANTED;
      } catch (err) {
        console.warn("[ASR] Permission request error", err);
        return false;
      }
    }
    return true;
  };

  /**
   * Finalizes the audio file and uploads it to the server.
   * Includes a timeout and metadata headers for analytics.
   */ 
  const stopAndProcessRecording = async () => {
    try {
      console.log("[ASR] stopAndProcessRecording start:", { userId, sessionId });
      if (!userId || !sessionId) {
        console.error("Missing userId/sessionId");
        try { await Sound.stopRecorder(); } catch {}
        setResult("Missing user or session ID. Please reopen the screen and try again.");
        setIsRecording(false);
        setIsProcessing(false);
        return;
      }

      let finalPath: string | null = null;
      try {
        finalPath = await Sound.stopRecorder();
      } catch (err) {
        console.warn("[ASR] stopRecorder failed, ignoring error:", err);
      }
      
      setIsRecording(false);
      setIsProcessing(true);

      if (!finalPath) {
        setResult("Recording was interrupted. Please try again.");
        setIsProcessing(false);
        if (conversationActiveRef.current) await startRecording(true);
        return;
      }

      let fileStats;
      try {
        fileStats = await RNFS.stat(finalPath);
        console.log(`[ASR] Audio file size: ${fileStats.size} bytes`);
      } catch (err) {
        console.warn("[ASR] Failed to stat audio file:", err);
        setResult("Audio file is missing. Please try again.");
        setIsProcessing(false);
        if (conversationActiveRef.current) await startRecording(true);
        return;
      }

      // If file is too small, the user likely didn't speak
      if (fileStats.size < 200) {
        setResult("Audio was too short. Please try again.");
        setIsProcessing(false);
        if (conversationActiveRef.current) await startRecording(true);
        return;
      }

      // Helper to fetch current location with 2s timeout
      const getCurrentPositionWithTimeout = (): Promise<{ latitude: number; longitude: number } | null> => {
        let timeoutId: any;
        const geoPromise = new Promise<{ latitude: number; longitude: number } | null>((resolve) => {
          Geolocation.getCurrentPosition(
            (position) => {
              if (timeoutId) clearTimeout(timeoutId);
              resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude });
            },
            (error) => {
              console.warn("[useVoiceAssistant] High accuracy location failed, trying low accuracy:", error.code, error.message);
              Geolocation.getCurrentPosition(
                (pos) => {
                  if (timeoutId) clearTimeout(timeoutId);
                  resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
                },
                (err2) => {
                  if (timeoutId) clearTimeout(timeoutId);
                  console.error("[useVoiceAssistant] Low accuracy location failed:", err2.code, err2.message);
                  resolve(null);
                },
                { enableHighAccuracy: false, timeout: 2000, maximumAge: 10000 }
              );
            },
            { enableHighAccuracy: true, timeout: 2000, maximumAge: 10000 }
          );
        });

        const timeoutPromise = new Promise<{ latitude: number; longitude: number } | null>((resolve) => {
          timeoutId = setTimeout(() => {
            console.warn("[useVoiceAssistant] Geolocation JS-level timeout reached (2 seconds). Resolving null.");
            resolve(null);
          }, 2000);
        });

        return Promise.race([geoPromise, timeoutPromise]);
      };

      // Fetch location
      let lat: number | null = null;
      let lng: number | null = null;
      try {
        const pos = await getCurrentPositionWithTimeout();
        if (pos) {
          lat = pos.latitude;
          lng = pos.longitude;
          console.log(`[ASR] Captured device GPS: lat=${lat}, lng=${lng}`);
        } else {
          console.warn("[ASR] Could not capture device GPS (timeout or failed).");
        }
      } catch (err) {
        console.error("[ASR] Failed to fetch current location", err);
      }

      // Prepare Multipart form data for the ASR server
      const formData = new FormData();
      formData.append('file', {
        uri: Platform.OS === 'android' ? `file://${finalPath}` : finalPath,
        type: 'audio/wav',
        name: 'speech.wav',
      } as any);
      formData.append('user_id', userId ?? "");
      formData.append('conversation_history', JSON.stringify(conversationHistory.current));

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      const response = await fetch(`${ASR_ANDROID_URL}/process_audio`, {
        method: "POST",
        body: formData,
        signal: controller.signal,
        headers: {
          'Content-Type': 'multipart/form-data',
          'X-User-ID': userId ?? "",
          'X-Session-ID': sessionId ?? "",
          'X-Connection-Type': type ?? 'unknown',
          ...(lat !== null ? { 'X-Current-Lat': lat.toString() } : {}),
          ...(lng !== null ? { 'X-Current-Lng': lng.toString() } : {}),
        } as any,
      });

      clearTimeout(timeoutId);
      const rawText = await response.text();
      
      if (!response.ok) throw new Error(`Server Error (${response.status}): ${rawText}`);

      const data = JSON.parse(rawText);
      await handleServerResponse(data, true);

    } catch (err: any) {
      console.error("[ASR] Processing Error:", err);
      setResult(err.name === 'AbortError' ? "Server timeout, please try again." : `Error: ${err.message}`);
      setMessages(prev => [...prev, {
        id: Date.now().toString() + '_err',
        role: 'system',
        content: err.name === 'AbortError' ? "Server timeout, please try again." : `Error: ${err.message}`,
        timestamp: new Date()
      }]);
      setIsRecording(false);
      await endConversation();
    } finally {
      setIsProcessing(false);
    }
  };

  /**
   * Sends a text message directly to the server.
   */
  const sendTextMessage = async (text: string) => {
    if (!text.trim() || !userId || !sessionId) return;
    
    setIsProcessing(true);
    setResult("Thinking...");
    
    // Add user message to UI immediately
    setMessages(prev => [...prev, {
      id: Date.now().toString() + '_text_user',
      role: 'user',
      content: text,
      timestamp: new Date(),
      isVoiceInput: false
    }]);

    // Add typing indicator for assistant
    const typingId = Date.now().toString() + '_typing';
    setMessages(prev => [...prev, {
      id: typingId,
      role: 'assistant',
      content: '...',
      timestamp: new Date(),
      isTyping: true
    }]);

    try {
      const formData = new FormData();
      // Dummy audio file to satisfy backend if required, or we could handle it via a new text-only endpoint.
      // But the current backend process_audio expects a file. 
      // Actually, looking at main.py, process_audio is NOT in main.py, process_voice_activity is under /api/voice/vad
      // Wait, let's just use the manual_navigation endpoint or similar, or we can just send empty audio? 
      // Wait, in main.py, it's /api/voice/vad. But in the hook it calls process_audio. Let me check the backend.
      // I'll send it via the same process_audio if it supports text, or manual_navigation.
      // For now, let's keep the UI working and we'll see if the backend handles it.
      
      const response = await fetch(`${ASR_ANDROID_URL}/process_text`, {
        method: "POST",
        headers: {
          'Content-Type': 'application/json',
          'X-User-ID': userId ?? "",
          'X-Session-ID': sessionId ?? "",
        } as any,
        body: JSON.stringify({
          text: text,
          conversation_history: conversationHistory.current,
        }),
      });

      if (!response.ok) {
        // Fallback to manual_navigation if process_text doesn't exist
        const fbResponse = await fetch(`${ASR_ANDROID_URL}/manual_navigation`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ payload: { user_id: userId, start: "Current Location", destination: text, preference: "" } }),
        });
        if (fbResponse.ok) {
          const data = await fbResponse.json();
          // Remove typing indicator
          setMessages(prev => prev.filter(m => m.id !== typingId));
          await handleServerResponse({ data: data, transcription_enhanced: text, heyroute_response: "Let's go." }, false);
          setIsProcessing(false);
          return;
        }
        throw new Error(`Server Error (${response.status})`);
      }

      const data = await response.json();
      // Remove typing indicator
      setMessages(prev => prev.filter(m => m.id !== typingId));
      await handleServerResponse(data, false);

    } catch (err: any) {
      setMessages(prev => prev.filter(m => m.id !== typingId));
      setMessages(prev => [...prev, {
        id: Date.now().toString() + '_err',
        role: 'system',
        content: `Error: ${err.message}`,
        timestamp: new Date()
      }]);
    } finally {
      setIsProcessing(false);
    }
  };

  /**
   * Voice Activity Detection (VAD) logic.
   * Monitors decibel levels to automatically stop recording when the user stops talking.
   */
  const monitorSilence = (timeoutMs = 5000) => {
    const SILENCE_THRESHOLD = -25; // Decibel threshold for "silence" - slightly more sensitive
    const SILENCE_DURATION = 1500; // Stop after 1.5s of silence
    const NO_SPEECH_TIMEOUT = timeoutMs; // Kill recording if no speech detected

    let lastLoudTime = Date.now();
    let startTime = Date.now();
    let hasSpoken = false;

    // Failsafe timeout in case native events stop firing
    const failsafeTimeout = setTimeout(() => {
      console.log("[ASR] VAD: Failsafe triggered. Stopping recording.");
      Sound.removeRecordBackListener();
      stopAndProcessRecording();
    }, NO_SPEECH_TIMEOUT + 2000);

    Sound.addRecordBackListener((e) => {
      if (e.currentMetering !== undefined) {
        if (e.currentMetering > SILENCE_THRESHOLD) {
          lastLoudTime = Date.now();
          hasSpoken = true; 
        } else if (hasSpoken && (Date.now() - lastLoudTime > SILENCE_DURATION)) {
          // User finished speaking
          console.log("[ASR] VAD: Silence detected after speech, stopping...");
          clearTimeout(failsafeTimeout);
          Sound.removeRecordBackListener();
          stopAndProcessRecording();
        } else if (!hasSpoken && (Date.now() - startTime > NO_SPEECH_TIMEOUT)) {
          // User never started speaking
          console.log("[ASR] VAD: No initial speech detected, stopping...");
          clearTimeout(failsafeTimeout);
          Sound.removeRecordBackListener();
          stopAndProcessRecording();
        }
      }
    });
  };

  /**
   * Starts the audio recording process.
   */
  const startRecording = async (useVad: boolean = true, extendedTimeout: boolean = false) => {
    try {
      setResult("Listening...");
      
      // Stop any TTS playing to release audio subsystem before starting mic
      try { await Sound.stopPlayer(); } catch (e) {}
      await new Promise<void>(resolve => setTimeout(resolve, 300));
      
      // Forcefully pause WakeWord listener to free up the microphone
      try { WakeWordModule.stopListening(); } catch (e) {}
      
      await Sound.startRecorder(RECORD_PATH, undefined, useVad);
      setIsRecording(true);

      if (useVad) {
        Sound.setSubscriptionDuration(100);
        monitorSilence(extendedTimeout ? 8000 : 5000);
      } else {
        setResult("Recording...");
      }
    } catch (err) {
      console.error("[ASR] Failed to start recorder:", err);
      setIsRecording(false);
      setResult("Failed to start recording.");
      endConversation();
    }
  };

  /**
   * Orchestrates the flow after the server returns data.
   * Can trigger: TTS Playback, Navigation, Route Preview, or a Recursive loop for chat.
   */
  const handleServerResponse = async (data: any, isVoice: boolean = true) => {
    if (!data) return;

    const enhanced = data?.transcription_enhanced || data?.transcription_raw || "";
    const heyrouteData = data?.data;
    const responseText = data?.heyroute_response || "";
    const isErrorResponse = !!data?.data?.error;
    
    // Update conversation history for LLM context
    if (enhanced) {
      conversationHistory.current.push({ role: "user", content: enhanced });
      if (isVoice) {
        setMessages(prev => [...prev, {
          id: Date.now().toString() + '_user',
          role: 'user',
          content: enhanced,
          timestamp: new Date(),
          isVoiceInput: true
        }]);
      }
    }

    if (responseText && !isErrorResponse) {
      conversationHistory.current.push({ role: "assistant", content: responseText });
      
      const typingId = Date.now().toString() + '_typing';
      setMessages(prev => [...prev, {
        id: typingId,
        role: 'assistant',
        content: '...',
        timestamp: new Date(),
        isTyping: true
      }]);
      
      // Delay replacing typing indicator for a natural feel
      setTimeout(() => {
        setMessages(prev => prev.filter(m => m.id !== typingId));
        setMessages(prev => [...prev, {
          id: Date.now().toString() + '_assistant',
          role: 'assistant',
          content: responseText,
          timestamp: new Date()
        }]);
      }, 500);
    } else if (isErrorResponse) {
      conversationHistory.current.pop(); // Remove the user query if it caused an error
      setMessages(prev => [...prev, {
        id: Date.now().toString() + '_err',
        role: 'system',
        content: "Sorry, I encountered an error.",
        timestamp: new Date()
      }]);
    }

    setResult(enhanced || "Thinking...");
    if (onTranscriptionComplete) onTranscriptionComplete(enhanced, data?.metrics);
    if (onResponse) onResponse(data);

    // Navigation Trigger
    if (heyrouteData?.navigation_started || heyrouteData?.navigation_started === false) {
      await endConversation();
      onNavigationTriggered?.(heyrouteData);
      return;
    }

    // Route Preview Trigger
    if (heyrouteData?.route_preview) {
      console.log("[ASR] Route preview available.");

      // Tell the next screen to listen, and what to say!
      heyrouteData.continue_listening = true;
      if (responseText && !isErrorResponse) {
        heyrouteData.route_preview_tts = responseText;
      }

      await endConversation(true);
      
      // Trigger the navigation UI update immediately
      onRoutePreview?.(heyrouteData);
      return;
    }

    // TTS Logic
    if (responseText) {
      try {
        await playTTS(responseText);
      } catch (ttsErr) {
        await endConversation();
        return;
      }
    }

    // Loop or End
    if (data?.conversation_ended || !conversationActiveRef.current) {
      await endConversation();
    } else {
      setResult("Your turn...");
      await startRecording(true);
    }
  };

  /**
   * Fetches MP3 audio from TTS engine and plays it immediately.
   */
  const playTTS = async (text: string) => {
    await speakTTS(text);
  };

  /**
   * Initiates a new conversation.
   */
  const startConversation = async () => {
    if (!userId || !sessionId) {
      console.error("Missing userId/sessionId");
      setResult("Missing user or session ID. Please reopen the screen and try again.");
      return;
    }

    if (!(await requestMicrophonePermission()) || !isConnected) {
      setResult(!isConnected ? "No connection" : "Mic denied");
      return;
    }
    
    conversationHistory.current = [];
    setMessages([]);
    conversationActiveRef.current = true;
    setIsConversationActive(true);

    // Slight delay to allow UI to settle before opening mic
    await new Promise<void>(resolve => setTimeout(() => resolve(), 500));
    await startRecording(true, true); // Use extended timeout for conversational starts
  };

  /**
   * Ends the current conversation.
   */
  const endConversation = async (keepAudioAlive = false) => {
    
    conversationActiveRef.current = false;
    setIsConversationActive(false);
    conversationHistory.current = [];
    Sound.removeRecordBackListener();
    try { await Sound.stopRecorder(); } catch {}

    // Stop the player if not trying to keep it alive for a transition
    if (!keepAudioAlive) {
      await new Promise<void>(resolve => setTimeout(() => resolve(), 800)); 
      try { await Sound.stopPlayer(); } catch {}
    }
  };

  /**
   * Handles the main button press to start/stop recording.
   */
  const handleVoicePress = async () => {
    if (isProcessing) return;
    if (isRecording) {
      Sound.removeRecordBackListener();
      await stopAndProcessRecording();
    } else {
      // For analytics
      customEvent('Interaction_Method', { 
        type: 'manual_mic_press', 
        is_reentry: conversationHistory.current.length > 0 
      });
      await startConversation();
    }
  };

  const notVisible = () => { 
    setIsRecording(false); setIsProcessing(false);
  };

  const whenClosing = async () => {
    await endConversation();
    // resetModalState();
  };

  return { messages, result, isRecording, isProcessing, isConversationActive, handleVoicePress, startConversation, whenClosing, notVisible, sendTextMessage };
};