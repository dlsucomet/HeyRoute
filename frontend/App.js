/**
 * This module serves as the root entry point for the React Native application.
 * 
 * Handles: 
 * - Navigation routing (Protected only)
 * - Analytics initialization (Vexo)
 * - Session lifecycle tracking (Active/Background)
 */

import React, { useState, useEffect, useRef } from 'react';
import { View, Text, ActivityIndicator, AppState, PermissionsAndroid, Platform } from 'react-native';
import { NavigationContainer as ReactNavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import { startNewSessionIfNeeded, endSession } from './src/utils/session';
import { vexo } from 'vexo-analytics';
import { VEXO_API_KEY } from '@env';

import HomeScreen from "./src/screens/home";
import SavedScreen from "./src/screens/saved";
import HistoryScreen from "./src/screens/history";
import ActiveVoiceModal from './src/components/active-voice-modal';
import RoutePreview from './src/components/route-preview';
import NavigationScreen from './src/components/navigation-screen';
import TermsScreen from './src/screens/terms';
import PrivacyPolicyScreen from './src/screens/privacy';
import ReportBugScreen from './src/screens/report';

const Stack = createNativeStackNavigator();

if (!__DEV__) { 
  // Only track in production/field tests, not during local coding
  vexo(VEXO_API_KEY);
}

export default function App() {
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    const startApp = async () => {
      const runtimeSession = await startNewSessionIfNeeded();
      console.log("Session started on app launch:", runtimeSession);
    };

    startApp();

    // detect app close / background
    const subscription = AppState.addEventListener("change", async (nextAppState) => {
      if (
        appState.current === "active" &&
        (nextAppState === "background" || nextAppState === "inactive")
      ) {
        console.log("App moved to background. Ending session.");
        await endSession();
      }

      appState.current = nextAppState;
    });

    return () => {
      subscription.remove();
    };
  }, []);

  return (
    <ReactNavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen name="Saved" component={SavedScreen} />
        <Stack.Screen name="History" component={HistoryScreen} />
        <Stack.Screen name="ActiveVoiceModal" component={ActiveVoiceModal} options={{ presentation: 'modal' }} /> 
        <Stack.Screen name="RoutePreview" component={RoutePreview} />
        <Stack.Screen name="NavigationScreen" component={NavigationScreen} />
        <Stack.Screen name="Terms" component={TermsScreen} />
        <Stack.Screen name="PrivacyPolicy" component={PrivacyPolicyScreen} />
        <Stack.Screen name="ReportBug" component={ReportBugScreen} />
      </Stack.Navigator>
    </ReactNavigationContainer>
  );
}
