import React, { useEffect, useState } from 'react';
import { StyleSheet, View, PermissionsAndroid, Platform } from 'react-native';
import {
  NavigationView,
  MapView,
  useNavigation,
} from '@googlemaps/react-native-navigation-sdk';
import { GOOGLE_MAPS_API_KEY } from '@env';

const GOOGLE_API_KEY = GOOGLE_MAPS_API_KEY;

/**
 * GoogleNavView: Renders a Google Maps NavigationView.
 * - In previewMode: shows a plain map centered on user's location (no navigation UI).
 * - In navigation mode: geocodes the destination string, sets it as the nav target,
 *   and starts turn-by-turn guidance.
 */
const GoogleNavView = ({ destination, onArrival, previewMode = false }) => {
  const {
    navigationController,
    setOnArrival,
    setOnNavigationReady,
  } = useNavigation();

  const [navReady, setNavReady] = useState(false);
  const [initiated, setInitiated] = useState(false);

  // Request location permissions on Android
  useEffect(() => {
    const requestPermissions = async () => {
      if (Platform.OS === 'android') {
        try {
          const granted = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
          );
          if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
            console.warn('[GoogleNavView] Location permission denied');
          }
        } catch (err) {
          console.warn('[GoogleNavView] Permission request error:', err);
        }
      }
    };
    requestPermissions();
  }, []);

  // Listen for navigation ready event
  useEffect(() => {
    setOnNavigationReady(() => {
      console.log('[GoogleNavView] Navigation is ready');
      setNavReady(true);
    });
    return () => setOnNavigationReady(null);
  }, [setOnNavigationReady]);

  // Initialize navigation session
  useEffect(() => {
    const initNav = async () => {
      if (!navigationController || initiated) return;
      try {
        console.log('[GoogleNavView] Showing ToS and initializing...');
        const termsAccepted = await navigationController.showTermsAndConditionsDialog();
        if (termsAccepted) {
          const status = await navigationController.init();
          console.log('[GoogleNavView] Init status:', status);
          setInitiated(true);
        } else {
          console.warn('[GoogleNavView] Terms not accepted');
        }
      } catch (err) {
        console.error('[GoogleNavView] Init error:', err);
      }
    };
    initNav();
  }, [navigationController, initiated]);

  // Handle arrival callback
  useEffect(() => {
    if (!previewMode) {
      setOnArrival((event) => {
        console.log('[GoogleNavView] Arrival event:', event);
        if (event.isFinalDestination) {
          navigationController?.stopGuidance();
          if (onArrival) onArrival();
        }
      });
    }
    return () => setOnArrival(null);
  }, [setOnArrival, navigationController, onArrival, previewMode]);

  // Geocode destination string and set navigation
  useEffect(() => {
    if (previewMode || !navReady || !initiated || !destination || !navigationController) return;

    const startNavigation = async () => {
      try {
        // If destination is already coords
        if (typeof destination === 'object' && (destination.lat || destination.latitude)) {
          const lat = parseFloat(destination.latitude ?? destination.lat);
          const lng = parseFloat(destination.longitude ?? destination.lng);
          console.log('[GoogleNavView] Setting destination coords:', { lat, lng });

          const routeStatus = await navigationController.setDestinations([
            { position: { lat, lng } }
          ]);
          console.log('[GoogleNavView] Route status:', routeStatus);

          if (routeStatus === 'OK') {
            await navigationController.startGuidance();
            console.log('[GoogleNavView] Guidance started');
          }
          return;
        }

        // If destination is a string, geocode it first
        if (typeof destination === 'string' && destination.trim()) {
          console.log('[GoogleNavView] Geocoding destination:', destination);
          const encoded = encodeURIComponent(destination.trim());
          const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encoded}&key=${GOOGLE_API_KEY}`;

          const response = await fetch(url);
          const data = await response.json();

          if (data.status === 'OK' && data.results?.length > 0) {
            const { lat, lng } = data.results[0].geometry.location;
            console.log('[GoogleNavView] Geocoded to:', { lat, lng });

            const routeStatus = await navigationController.setDestinations([
              { position: { lat, lng } }
            ]);
            console.log('[GoogleNavView] Route status:', routeStatus);

            if (routeStatus === 'OK') {
              await navigationController.startGuidance();
              console.log('[GoogleNavView] Guidance started');
            } else {
              console.error('[GoogleNavView] Route calculation failed:', routeStatus);
            }
          } else {
            console.error('[GoogleNavView] Geocoding failed:', data.status, data.error_message);
          }
        }
      } catch (err) {
        console.error('[GoogleNavView] Navigation error:', err);
      }
    };

    startNavigation();
  }, [navReady, initiated, destination, navigationController, previewMode]);

  // In preview mode, render a plain MapView (no navigation UI)
  if (previewMode) {
    return (
      <View style={styles.container}>
        <MapView
          style={StyleSheet.absoluteFill}
          myLocationEnabled={true}
          myLocationButtonEnabled={true}
          compassEnabled={true}
        />
      </View>
    );
  }

  // In navigation mode, render the full NavigationView
  return (
    <View style={styles.container}>
      <NavigationView
        style={StyleSheet.absoluteFill}
        androidNavigationUiEnabled={true}
        navigationHeaderEnabled={true}
        navigationFooterEnabled={true}
        speedometerEnabled={true}
        speedLimitIconEnabled={true}
        navigationTripProgressBarEnabled={true}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
});

export default GoogleNavView;
