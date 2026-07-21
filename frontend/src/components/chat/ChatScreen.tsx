import React, { useState, useEffect, useRef } from 'react';
import { 
  View, Text, StyleSheet, Pressable, TextInput, 
  FlatList, KeyboardAvoidingView, Platform, Animated, LayoutAnimation 
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { Colors } from '../../theme/colors';
import { useVoiceAssistant } from '../../hooks/useVoiceAssistant';
import { ActiveVoiceModalProps, ChatMessageType } from '../../types/navigation';
import { ChatMessage } from './ChatMessage';
import { SafeAreaView } from 'react-native-safe-area-context';

export const ChatScreen = (props: ActiveVoiceModalProps & { isVisible: boolean; headlessMode?: boolean }) => {
  const { 
    isVisible, onClose, userId, sessionId, onTranscriptionComplete, 
    onNavigationTriggered, onRoutePreview, onResponse, autoStartVadMode
  } = props;
  
  const [inputText, setInputText] = useState('');
  const flatListRef = useRef<FlatList>(null);
  
  const {
    messages,
    isRecording,
    isProcessing,
    handleVoicePress,
    whenClosing,
    startConversation,
    sendTextMessage
  } = useVoiceAssistant({
    userId, sessionId, visible: isVisible, onClose,
    onTranscriptionComplete, onNavigationTriggered, onRoutePreview, onResponse,
  });

  // Pulse animation for recording state
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (isRecording) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.2, duration: 800, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true })
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
      pulseAnim.stopAnimation();
    }
  }, [isRecording]);

  const startConversationRef = useRef(startConversation);
  
  useEffect(() => {
    startConversationRef.current = startConversation;
  }, [startConversation]);

  useEffect(() => {
    if (isVisible) {
      if (autoStartVadMode?.current) {
        autoStartVadMode.current = false;
      }
      if (!props.openForHistory) {
        setTimeout(() => startConversationRef.current(), 600);
      }
    }
  }, [isVisible, props.openForHistory]);

  const handleClose = async () => {
    await whenClosing();
    onClose();
  };

  const handleSendText = () => {
    if (!inputText.trim() || isProcessing) return;
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    sendTextMessage(inputText.trim());
    setInputText('');
  };

  // Ensure scroll to bottom on new messages
  useEffect(() => {
    if (messages.length > 0 && flatListRef.current) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [messages.length, messages[messages.length - 1]?.isTyping]);

  if (props.headlessMode) {
    return null;
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView 
        style={styles.keyboardView} 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={handleClose} style={styles.closeButton}>
            <Icon name="close" size={26} color={Colors.navy} />
          </Pressable>
          <Text style={styles.headerTitle}>Sparrow</Text>
          <View style={styles.headerRight} />
        </View>

        {/* Chat List */}
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <ChatMessage message={item} />}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          onLayout={() => flatListRef.current?.scrollToEnd({ animated: false })}
        />

        {/* Input Area */}
        <View style={styles.inputArea}>
          <View style={styles.textInputContainer}>
            <TextInput
              style={styles.textInput}
              placeholder={isRecording ? "Listening..." : "Message Sparrow..."}
              placeholderTextColor={Colors.textMuted}
              value={inputText}
              onChangeText={setInputText}
              multiline
              maxLength={200}
              editable={!isRecording && !isProcessing}
              onSubmitEditing={handleSendText}
            />
            {inputText.trim().length > 0 && (
              <Animated.View style={[styles.sendButton, { transform: [{ scale: pulseAnim }] }]}>
                <Icon name="send" size={24} color={Colors.teal} />
              </Animated.View>
            )}
          </View>

          {!inputText.trim() && (
            <Pressable
              onPress={handleVoicePress}
              disabled={isProcessing}
              style={styles.micWrapper}
            >
              <Animated.View style={[styles.micButton, isRecording && styles.micRecording, { transform: [{ scale: pulseAnim }] }]}>
              {isRecording ? (
                <Icon name="stop" size={28} color={Colors.textOnDark} />
              ) : (
                <Icon name="mic" size={28} color={Colors.textOnDark} />
              )}
            </Animated.View>
            </Pressable>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.cream,
  },
  keyboardView: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.separator,
    backgroundColor: Colors.cream,
  },
  closeButton: {
    padding: 4,
  },
  headerTitle: {
    fontFamily: 'Karla',
    fontSize: 18,
    fontWeight: '700',
    color: Colors.navy,
  },
  headerRight: {
    width: 34,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingVertical: 20,
  },
  inputArea: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: Colors.cream,
    borderTopWidth: 1,
    borderTopColor: Colors.separator,
  },
  textInputContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.creamLight,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: Colors.separator,
    paddingLeft: 16,
    paddingRight: 8,
    minHeight: 48,
    marginRight: 12,
  },
  textInput: {
    flex: 1,
    fontFamily: 'Karla',
    fontSize: 15,
    color: Colors.textOnLight,
    maxHeight: 100,
    paddingVertical: 12,
  },
  sendButton: {
    padding: 8,
  },
  micWrapper: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 48,
    height: 48,
  },
  micButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.teal,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 3,
    shadowColor: Colors.navy,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  micRecording: {
    backgroundColor: Colors.recording,
  },
});
