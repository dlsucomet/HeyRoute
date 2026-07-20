import React, { useEffect } from "react";
import { Modal } from "react-native";
import { ActiveVoiceModalProps } from "../types/navigation";
import { ChatScreen } from "./chat/ChatScreen";

const ActiveVoiceModal = (props: ActiveVoiceModalProps) => {
  const { visible, onClose, userId, sessionId } = props;
  
  useEffect(() => {
    console.log("[Modal] Received identity props:", { userId, sessionId });
  }, [userId, sessionId]);

  if (props.hideUI) {
    return null;
  }

  return (
    <Modal
      animationType="slide"
      transparent={false} // Full screen
      visible={visible}
      onRequestClose={onClose}
    >
      <ChatScreen {...props} isVisible={visible} />
    </Modal>
  );
};

export default ActiveVoiceModal;
