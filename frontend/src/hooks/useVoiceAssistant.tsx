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
import { Buffer } from "buffer";
import { useNetInfo } from "@react-native-community/netinfo";
import { customEvent } from 'vexo-analytics';
import { ASR_URL } from "@env";
import { ActiveVoiceModalProps } from "../types/navigation";

const ASR_ANDROID_URL = ASR_URL;

// Temporary storage path for the recorded WAV file
const RECORD_PATH = `${RNFS.CachesDirectoryPath}/user_voice.wav`;

export const useVoiceAssistant = (props: ActiveVoiceModalProps) => {
  const { userId, sessionId, onTranscriptionComplete, onNavigationTriggered, onRoutePreview } = props;

  // --- State ---
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
      const finalPath = await Sound.stopRecorder();
      setIsRecording(false);
      setIsProcessing(true);

      if (!finalPath) throw new Error("No audio file path returned.");

      const fileStats = await RNFS.stat(finalPath);
      console.log(`[ASR] Audio file size: ${fileStats.size} bytes`);

      // If file is too small, the user likely didn't speak
      if (fileStats.size < 200) {
        setResult("Audio was too short. Please try again.");
        setIsProcessing(false);
        if (conversationActiveRef.current) await startRecording(true);
        return;
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
        } as any,
      });

      clearTimeout(timeoutId);
      const rawText = await response.text();
      
      if (!response.ok) throw new Error(`Server Error (${response.status}): ${rawText}`);

      const data = JSON.parse(rawText);
      await handleServerResponse(data);

    } catch (err: any) {
      console.error("[ASR] Processing Error:", err);
      setResult(err.name === 'AbortError' ? "Server timeout, please try again." : `Error: ${err.message}`);
      setIsRecording(false);
      await endConversation();
    } finally {
      setIsProcessing(false);
    }
  };

  /**
   * Voice Activity Detection (VAD) logic.
   * Monitors decibel levels to automatically stop recording when the user stops talking.
   */
  const monitorSilence = () => {
    const SILENCE_THRESHOLD = -20; // Decibel threshold for "silence"
    const SILENCE_DURATION = 1500; // Stop after 1.5s of silence
    const NO_SPEECH_TIMEOUT = 5000; // Kill recording if no speech detected in first 5s

    let lastLoudTime = Date.now();
    let startTime = Date.now();
    let hasSpoken = false;

    Sound.addRecordBackListener((e) => {
      if (e.currentMetering !== undefined) {
        if (e.currentMetering > SILENCE_THRESHOLD) {
          lastLoudTime = Date.now();
          hasSpoken = true; 
        } else if (hasSpoken && (Date.now() - lastLoudTime > SILENCE_DURATION)) {
          // User finished speaking
          console.log("[ASR] VAD: Silence detected after speech, stopping...");
          Sound.removeRecordBackListener();
          stopAndProcessRecording();
        } else if (!hasSpoken && (Date.now() - startTime > NO_SPEECH_TIMEOUT)) {
          // User never started speaking
          console.log("[ASR] VAD: No initial speech detected after 5s, stopping...");
          Sound.removeRecordBackListener();
          stopAndProcessRecording();
        }
      }
    });
  };

  /**
   * Starts the audio recording process.
   */
  const startRecording = async (useVad: boolean = true) => {
    try {
      setResult("Listening...");
      await Sound.startRecorder(RECORD_PATH, undefined, useVad);
      setIsRecording(true);

      if (useVad) {
        Sound.setSubscriptionDuration(100);
        monitorSilence();
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
  const handleServerResponse = async (data: any) => {
    if (!data) return;

    const enhanced = data?.transcription_enhanced || data?.transcription_raw || "";
    const heyrouteData = data?.data;
    const responseText = data?.heyroute_response || "";
    const isErrorResponse = data?.data?.error === true;
    
    // Update conversation history for LLM context
    if (enhanced) conversationHistory.current.push({ role: "user", content: enhanced });

    if (responseText && !isErrorResponse) {
      conversationHistory.current.push({ role: "assistant", content: responseText });
    } else if (isErrorResponse) {
      conversationHistory.current.pop(); // Remove the user query if it caused an error
    }

    setResult(enhanced || "Thinking...");
    if (onTranscriptionComplete) onTranscriptionComplete(enhanced, data?.metrics);

    // Navigation Trigger
    if (heyrouteData?.navigation_started || heyrouteData?.navigation_started === false) {
      await endConversation();
      onNavigationTriggered(heyrouteData);
      return;
    }

    // Route Preview Trigger
    if (heyrouteData?.route_preview) {
      console.log("[ASR] Route preview available.");

      let estimatedSpeechTime = 500; // Default 0.5s delay

      // Speak the response before ending the local conversation
      if (responseText && !isErrorResponse) {
        try {
          playTTS(responseText);

          // Calculate speaking time: ~300ms per word + 1 second buffer
          estimatedSpeechTime = (responseText.split(" ").length * 300) + 1000;

        } catch (ttsErr) {
          console.error("[ASR] TTS Error during preview handoff:", ttsErr);
        }
      }

      // End the microphone on but set as true to keep the TTS playing
      await endConversation(true);

      // Inject a flag telling the next screen to pick up the microphone
      heyrouteData.continue_listening = true;
      heyrouteData.speech_delay = estimatedSpeechTime;

      // Trigger the navigation
      onRoutePreview(heyrouteData);
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
    const res = await fetch(`${ASR_ANDROID_URL}/speak`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });

    if (!res.ok) throw new Error("TTS Server Error");

    const arrayBuffer = await res.arrayBuffer();
    const path = `${RNFS.CachesDirectoryPath}/tts.mp3`;

    // Save buffer to file then play
    await RNFS.writeFile(path, Buffer.from(arrayBuffer).toString("base64"), "base64");
    await Sound.startPlayer(path);
  };

  /**
   * Initiates a new conversation.
   */
  const startConversation = async () => {
    if (!(await requestMicrophonePermission()) || !isConnected) {
      setResult(!isConnected ? "No connection" : "Mic denied");
      return;
    }
    conversationHistory.current = [];
    conversationActiveRef.current = true;
    setIsConversationActive(true);

    // Slight delay to allow UI to settle before opening mic
    await new Promise<void>(resolve => setTimeout(() => resolve(), 500));
    await startRecording(true);
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

  return { result, isRecording, isProcessing, isConversationActive, handleVoicePress, startConversation, whenClosing, notVisible };
};