/**
 * This module serves as the root entry point for the React Native application.
 * 
 * Handles: 
 * - Navigation routing (Auth vs. Protected)
 * - Supabase authentication state management
 * - Analytics initialization (Vexo)
 * - Session lifecycle tracking (Active/Background)
 */

import React, { useState, useEffect, useRef } from 'react';
import { View, Text, ActivityIndicator, AppState, PermissionsAndroid, Platform } from 'react-native';
import { NavigationContainer as ReactNavigationContainer } from '@react-navigation/native';
import { NavigationProvider } from '@googlemaps/react-native-navigation-sdk';
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { startNewSessionIfNeeded, endSession, updateActivity } from './src/utils/session';
import { vexo } from 'vexo-analytics';
import { VEXO_API_KEY } from '@env';

import HomeScreen from "./src/screens/home";
import SavedScreen from "./src/screens/saved";
import HistoryScreen from "./src/screens/history";
import ProfileScreen from "./src/screens/profile";
import LoginScreen from "./src/screens/login";
import SignupScreen from "./src/screens/signup";
import ActiveVoiceModal from './src/components/active-voice-modal';
import RoutePreview from './src/components/route-preview';
import NavigationScreen from './src/components/navigation-screen'
import TermsScreen from './src/screens/terms';
import PrivacyPolicyScreen from './src/screens/privacy';
import ReportBugScreen from './src/screens/report';

import supabase from './src/supabase-client';

const Stack = createNativeStackNavigator();

if (!__DEV__) { 
  // Only track in production/field tests, not during local coding
  vexo(VEXO_API_KEY);
}

export default function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true); // loading state 
  const appState = useRef(AppState.currentState);

  useEffect(() => {
    // Check session status on initial mount to prevent flickering between login and home screens.
    const startApp = async () => {
      // Listen for auth changes (Login/Logout) to dynamically update the stack and session analytics.
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session?.user) {
        const runtimeSession = await startNewSessionIfNeeded();
        console.log("Session started on app launch:", runtimeSession);
      }

      setSession(session);
      setLoading(false);
    };

    startApp();

    // supabase auth listener
    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (_event, session) => {

        console.log("Auth Event:", _event);

        // start session on login
        if (_event === "SIGNED_IN" && session?.user) {
          const runtimeSession = await startNewSessionIfNeeded();
          console.log("Session started from login:", runtimeSession);
        }

        // end session on logout
        if (_event === "SIGNED_OUT") {
          await endSession();
          console.log("Session ended due to logout.");
        }

        setSession(session);
        setLoading(false);
      }
    );

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
      authListener.subscription.unsubscribe();
      subscription.remove();
    };

  }, []);

  // Show a spinner while Supabase checks the storage for a token
  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#83689f" /> 
      </View>
    );
  }

  return (
    <NavigationProvider
      termsAndConditionsDialogOptions={{
        title: 'HeyRoute Navigation',
        companyName: 'HeyRoute',
      }}
    >
      <ReactNavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          {/* render screens based on session state */}
          {session && session.user ? (
            // If user is logged in, show App Screens
            <>
              <Stack.Screen name="Home" component={HomeScreen} />
              <Stack.Screen name="Saved" component={SavedScreen} />
              <Stack.Screen name="History" component={HistoryScreen} />
              <Stack.Screen name="Profile" component={ProfileScreen} />
              <Stack.Screen name="ActiveVoiceModal" component={ActiveVoiceModal} options={{ presentation: 'modal' }} /> 
              <Stack.Screen name="RoutePreview" component={RoutePreview} />
              <Stack.Screen name="NavigationScreen" component={NavigationScreen} />
              <Stack.Screen name="Terms" component={TermsScreen} />
              <Stack.Screen name="PrivacyPolicy" component={PrivacyPolicyScreen} />
              <Stack.Screen name="ReportBug" component={ReportBugScreen} />
            </>
          ) : (
            // If there is no session, show the Login and Signup screens
            <>
              <Stack.Screen name="Login" component={LoginScreen} />
              <Stack.Screen name="Signup" component={SignupScreen} />
              <Stack.Screen name="Terms" component={TermsScreen} />
              <Stack.Screen name="PrivacyPolicy" component={PrivacyPolicyScreen} />
            </>
          )}
        </Stack.Navigator>
      </ReactNavigationContainer>
    </NavigationProvider>
  );
}
