import { useEffect, useRef } from 'react';
import { NativeModules, NativeEventEmitter } from 'react-native';
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
      
      if (Platform.OS === 'android') {
        const { ToastAndroid } = require('react-native');
        ToastAndroid.show(`Wake Word Detected! (Score: ${score})`, ToastAndroid.SHORT);
      }

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
    const toggleListening = () => {
      try {
        if (isRecording || isProcessing || vadMode) {
          if (isListeningRef.current) {
            console.log("[WakeWord] Pausing listener — app is busy.");
            WakeWordModule.stopListening();
            isListeningRef.current = false;
            onStatusChangeRef.current?.(false);
          }
        } else if (visible) {
          if (!isListeningRef.current) {
            console.log("[WakeWord] Resuming listener.");
            WakeWordModule.startListening();
            isListeningRef.current = true;
            onStatusChangeRef.current?.(true);
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
  }, [isRecording, isProcessing, vadMode, visible]);
};
