import { useEffect, useRef } from 'react';
import { NativeModules, NativeEventEmitter, Platform, DeviceEventEmitter } from 'react-native';
import { customEvent } from 'vexo-analytics';

const { WakeWordModule } = NativeModules;
const wakeWordEmitter = new NativeEventEmitter(WakeWordModule);

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
  const isListeningRef = useRef(false);

  const onWakeWordDetectedRef = useRef(onWakeWordDetected);
  const onStatusChangeRef = useRef(onStatusChange);
  const isRecordingRef = useRef(isRecording);
  const isProcessingRef = useRef(isProcessing);
  const vadModeRef = useRef(vadMode);

  onWakeWordDetectedRef.current = onWakeWordDetected;
  onStatusChangeRef.current = onStatusChange;
  isRecordingRef.current = isRecording;
  isProcessingRef.current = isProcessing;
  vadModeRef.current = vadMode;

  useEffect(() => {
    const subscription = wakeWordEmitter.addListener('onWakeWordDetected', (score) => {
      console.log(`\n======================================================`);
      console.log(`🎙️ [WakeWord] "HEY ROUTE" DETECTED! (Score: ${score})`);
      console.log(`======================================================\n`);

      if (isRecordingRef.current || isProcessingRef.current || vadModeRef.current) {
        console.log("[WakeWord] Blocked — app is busy.");
        return;
      }
      customEvent('Interaction_Method', { type: 'wake_word_detected', keyword: 'hey_route' });
      console.log("[WakeWord] Calling onWakeWordDetected...");
      onWakeWordDetectedRef.current();
    });

    return () => {
      subscription.remove();
      WakeWordModule.stopListening();
    };
  }, []);

  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    let isTtsPlaying = false;

    const toggleListening = () => {
      try {
        if (isRecording || isProcessing || vadMode || isTtsPlaying) {
          if (isListeningRef.current) {
            console.log("[WakeWord] Pausing listener — app is busy.");
            WakeWordModule.stopListening();
            isListeningRef.current = false;
            onStatusChangeRef.current?.(false);
          }
        } else if (visible) {
          if (!isListeningRef.current) {
            timeoutId = setTimeout(() => {
              console.log("[WakeWord] Resuming listener.");
              WakeWordModule.startListening();
              isListeningRef.current = true;
              onStatusChangeRef.current?.(true);
            }, 300);
          }
        } else {
            WakeWordModule.stopListening();
            isListeningRef.current = false;
            onStatusChangeRef.current?.(false);
        }
      } catch (err) {
        console.error("[WakeWord] Failed to toggle wake word listening state:", err);
      }
    };

    toggleListening();
    
    const ttsSub = DeviceEventEmitter.addListener('tts_state_changed', (isPlaying) => {
      isTtsPlaying = isPlaying;
      toggleListening();
    });
    
    return () => {
      ttsSub.remove();
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [isRecording, isProcessing, vadMode, visible]);
};
