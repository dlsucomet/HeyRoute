import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { Colors } from '../../theme/colors';
import { ChatMessageType } from '../../types/navigation';

interface ChatMessageProps {
  message: ChatMessageType;
}

const TypingIndicator = () => {
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animateDot = (dot: Animated.Value, delay: number) => {
      Animated.loop(
        Animated.sequence([
          Animated.timing(dot, { toValue: 1, duration: 300, delay, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0, duration: 300, useNativeDriver: true }),
          Animated.delay(400)
        ])
      ).start();
    };

    animateDot(dot1, 0);
    animateDot(dot2, 200);
    animateDot(dot3, 400);
  }, []);

  const getStyle = (dot: Animated.Value) => ({
    transform: [{
      translateY: dot.interpolate({
        inputRange: [0, 1],
        outputRange: [0, -4]
      })
    }],
    opacity: dot.interpolate({
      inputRange: [0, 1],
      outputRange: [0.4, 1]
    })
  });

  return (
    <View style={styles.typingContainer}>
      <Animated.View style={[styles.dot, getStyle(dot1)]} />
      <Animated.View style={[styles.dot, getStyle(dot2)]} />
      <Animated.View style={[styles.dot, getStyle(dot3)]} />
    </View>
  );
};

export const ChatMessage = ({ message }: ChatMessageProps) => {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';

  if (isSystem) {
    return (
      <View style={styles.systemContainer}>
        <Text style={styles.systemText}>{message.content}</Text>
      </View>
    );
  }

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <View style={[styles.container, isUser ? styles.userContainer : styles.assistantContainer]}>
      {!isUser && (
        <View style={styles.assistantAvatar}>
          <MaterialIcons name="assistant-navigation" size={16} color={Colors.textOnDark} />
        </View>
      )}
      
      <View style={styles.messageContent}>
        {!isUser && <Text style={styles.assistantName}>HeyRoute</Text>}
        
        <View style={[
          styles.bubble, 
          isUser ? styles.userBubble : styles.assistantBubble,
          isUser ? styles.userBubbleShape : styles.assistantBubbleShape
        ]}>
          {message.isTyping ? (
            <TypingIndicator />
          ) : (
            <Text style={isUser ? styles.userText : styles.assistantText}>
              {message.content}
            </Text>
          )}
        </View>
        
        <View style={[styles.footer, isUser ? styles.footerUser : styles.footerAssistant]}>
          <Text style={styles.timeText}>{formatTime(message.timestamp)}</Text>
          {isUser && message.isVoiceInput && (
            <MaterialIcons name="mic" size={12} color={Colors.textMuted} style={styles.micIcon} />
          )}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    marginBottom: 20,
    width: '100%',
  },
  userContainer: {
    justifyContent: 'flex-end',
    paddingLeft: 40,
  },
  assistantContainer: {
    justifyContent: 'flex-start',
    paddingRight: 40,
  },
  systemContainer: {
    alignItems: 'center',
    marginVertical: 10,
  },
  systemText: {
    fontFamily: 'Karla',
    fontSize: 12,
    color: Colors.textMuted,
    backgroundColor: Colors.creamLight,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 10,
  },
  assistantAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.teal,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
    marginTop: 18,
  },
  messageContent: {
    maxWidth: '85%',
  },
  assistantName: {
    fontFamily: 'Karla',
    fontSize: 12,
    color: Colors.textMuted,
    marginBottom: 4,
    marginLeft: 4,
  },
  bubble: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  userBubble: {
    backgroundColor: Colors.navy,
  },
  assistantBubble: {
    backgroundColor: Colors.cardBg,
    borderWidth: 1,
    borderColor: Colors.separator,
  },
  userBubbleShape: {
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 4,
  },
  assistantBubbleShape: {
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderBottomLeftRadius: 4,
    borderBottomRightRadius: 18,
  },
  userText: {
    fontFamily: 'Karla',
    fontSize: 15,
    color: Colors.textOnDark,
    lineHeight: 22,
  },
  assistantText: {
    fontFamily: 'Karla',
    fontSize: 15,
    color: Colors.textOnLight,
    lineHeight: 22,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  footerUser: {
    justifyContent: 'flex-end',
    paddingRight: 4,
  },
  footerAssistant: {
    justifyContent: 'flex-start',
    paddingLeft: 4,
  },
  timeText: {
    fontFamily: 'Karla',
    fontSize: 11,
    color: Colors.textMuted,
  },
  micIcon: {
    marginLeft: 4,
  },
  typingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 22,
    paddingHorizontal: 8,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.textMuted,
    marginHorizontal: 3,
  }
});
