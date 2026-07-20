import React, { useEffect } from "react";
import { Modal } from "react-native";
import { ActiveVoiceModalProps } from "../types/navigation";
import { ChatScreen } from "./chat/ChatScreen";

const ActiveVoiceModal = (props: ActiveVoiceModalProps) => {
  const { visible, onClose, userId, sessionId } = props;
  
  useEffect(() => {
    console.log("[Modal] Received identity props:", { userId, sessionId });
  }, [userId, sessionId]);

  return (
    <Modal
      animationType="slide"
      transparent={props.hideUI ?? false} // Headless mode (transparent) if hideUI is true
      visible={visible}
      onRequestClose={onClose}
    >
      <ChatScreen {...props} isVisible={visible} headlessMode={props.hideUI} />
    </Modal>
  );
};

export default ActiveVoiceModal;
