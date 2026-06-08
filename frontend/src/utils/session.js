/**
 * This module manages user sessions for the app, including device identification and session lifecycle.
 * 
 * Handles: 
 * - Generating and storing a persistent device ID across app installs.
 * - Creating and refreshing a session ID based on user activity and timeouts.
 * - Providing utilities to end sessions and retrieve current session information.
 */

import uuid from "react-native-uuid";
import AsyncStorage from "@react-native-async-storage/async-storage";

const DEVICE_ID = "device_id";          // persistent install ID
const SESSION_ID = "runtime_session_id"; // per-behavior session
const LAST_ACTIVE = "last_active";
const TIMEOUT = 30 * 60 * 1000; // 30 minutes

// Persistent Device ID
export const initDeviceId = async () => {
  const existing = await AsyncStorage.getItem(DEVICE_ID);
  if (existing) {
    console.log("[Session] initDeviceId existing:", existing);
    return existing;
  }

  const id = uuid.v4();
  await AsyncStorage.setItem(DEVICE_ID, id);
  console.log("[Session] initDeviceId created:", id);
  return id;
};

// Runtime Session 
export const startNewSessionIfNeeded = async () => {
  const now = Date.now();
  const last = await AsyncStorage.getItem(LAST_ACTIVE);
  const existingSession = await AsyncStorage.getItem(SESSION_ID);

  console.log("[Session] startNewSessionIfNeeded current:", {
    existingSession,
    last,
    now,
  });

  // Create new session if:
  // - No session yet
  // - No activity timestamp
  // - Inactive beyond timeout
  if (!existingSession || !last || now - Number(last) > TIMEOUT) {
    const newSession = uuid.v4();

    await AsyncStorage.multiSet([
      [SESSION_ID, newSession],
      [LAST_ACTIVE, now.toString()],
    ]);

    console.log("[Session] startNewSessionIfNeeded created:", newSession);

    return newSession;
  }

  // Otherwise refresh activity timestamp
  await AsyncStorage.setItem(LAST_ACTIVE, now.toString());
  console.log("[Session] startNewSessionIfNeeded reused:", existingSession);
  return existingSession;
};

// End Session 
export const endSession = async () => {
  await AsyncStorage.multiRemove([SESSION_ID, LAST_ACTIVE]);
};

// Get current Session ID
export const getLocalSession = async () => {
  const session = await AsyncStorage.getItem(SESSION_ID);
  console.log("[Session] getLocalSession:", session);
  return session;
};