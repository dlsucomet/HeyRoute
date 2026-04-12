/**
 * Props expected by the DirectionsCard component
 */
export interface DirectionsCardProps {
  userId: string;
  onSetStart: (value: string) => void;
  onSetDestination: (value: string) => void;
  onSetPreference: (value: string) => void;
  initialDestination?: string;
  initialStart?: string;
  onClose?: () => void;
  autoTrigger?: boolean;
  fromHistory?: boolean;
}

/**
 * Props expected by the ActiveVoiceModal component
 */
export interface ActiveVoiceModalProps {
  visible: boolean; // controls modal visibility
  onClose: () => void; // callback when modal is closed
  onTranscriptionComplete: (text: string, metrics: any) => void; // receives the final transcription text when recording is stopped
  onNavigationTriggered: (routeData: any) => void; // callback for when navigation data is received
  onRoutePreview: (routeData: any) => void; // callback for when a route preview is received
  userId: string | null;
  sessionId: string | undefined;
  autoStartVadMode?: React.MutableRefObject<boolean>;
  autoStartRecording?: React.MutableRefObject<boolean>;
  onRecordingStateChange?: (val: boolean) => void;
  onProcessingStateChange?: (val: boolean) => void;
  onVadModeChange?: (val: boolean) => void;
}
