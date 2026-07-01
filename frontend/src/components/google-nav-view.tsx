import React, { useEffect, useState, useRef } from 'react';
import { StyleSheet, View, PermissionsAndroid, Platform } from 'react-native';
import {
  NavigationView,
  MapView,
  useNavigation,
} from '@googlemaps/react-native-navigation-sdk';
import Geolocation from 'react-native-geolocation-service';
import { GOOGLE_MAPS_API_KEY } from '@env';

const GOOGLE_API_KEY = GOOGLE_MAPS_API_KEY;

// Helper to convert seconds into format e.g. "15 mins" or "1 hr 5 mins"
const formatSecondsToDuration = (seconds: number): string => {
  const mins = Math.ceil(seconds / 60);
  if (mins < 60) {
    return `${mins} mins`;
  }
  const hrs = Math.floor(mins / 60);
  const remainingMins = mins % 60;
  if (remainingMins === 0) {
    return `${hrs} hr`;
  }
  return `${hrs} hr ${remainingMins} mins`;
};

/**
 * GoogleNavView: Renders a Google Maps NavigationView.
 * - In previewMode: shows a plain map centered on user's location (no navigation UI).
 * - In navigation mode: geocodes the destination string, sets it as the nav target,
 *   and starts turn-by-turn guidance.
 */
export interface GoogleNavViewProps {
  destination?: any;
  waypoints?: any[];
  onArrival?: () => void;
  previewMode?: boolean;
  routePolyline?: any[];
  onEtaUpdated?: (eta: string, distanceKm?: number) => void;
}

const GoogleNavView = ({
  destination,
  waypoints,
  onArrival,
  previewMode = false,
  routePolyline,
  onEtaUpdated,
}: GoogleNavViewProps) => {
  const {
    navigationController,
    setOnArrival,
    setOnNavigationReady,
  } = useNavigation();

  const [navReady, setNavReady] = useState(false);
  const [initiated, setInitiated] = useState(false);
  const [mapViewController, setMapViewController] = useState<any>(null);
  const [permissionsGranted, setPermissionsGranted] = useState(false);
  const polylineIdRef = useRef<string | null>(null);
  const lastDestinationRef = useRef<string | null>(null);

  // Request location permissions on Android
  useEffect(() => {
    const requestPermissions = async () => {
      if (Platform.OS === 'android') {
        try {
          const granted = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
          );
          if (granted === PermissionsAndroid.RESULTS.GRANTED) {
            setPermissionsGranted(true);
          } else {
            console.warn('[GoogleNavView] Location permission denied');
          }
        } catch (err) {
          console.warn('[GoogleNavView] Permission request error:', err);
        }
      } else {
        setPermissionsGranted(true);
      }
    };
    requestPermissions();
  }, []);

  // Center camera on user location when map view controller is ready and permissions are granted
  useEffect(() => {
    let active = true;
    const centerOnUserLocation = async () => {
      // Skip if active navigation (startGuidance handles camera automatically)
      if (!previewMode) {
        console.log('[GoogleNavView] Skipping user location centering (active navigation handles camera)');
        return;
      }

      if (!mapViewController || !permissionsGranted) return;

      // In preview mode with a route polyline, the polyline effect handles camera positioning
      if (previewMode && routePolyline && Array.isArray(routePolyline) && routePolyline.length > 0) {
        console.log('[GoogleNavView] Skipping user location centering (route polyline will handle camera)');
        return;
      }
      // Wait for navigation SDK to be fully initialized before trying to get location
      if (!initiated) return;

      console.log('[GoogleNavView] Fetching OS location for map centering (high accuracy)...');
      Geolocation.getCurrentPosition(
        async (position) => {
          if (!active) return;
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;
          console.log('[GoogleNavView] OS location acquired (high accuracy). Panning camera to:', { lat, lng });
          try {
            // DELAY: Wait 500ms to ensure the native map is ready before calling moveCamera
            await new Promise<void>((resolve) => setTimeout(resolve, 500));
            if (!active) return;
            await mapViewController.moveCamera({
              target: { lat, lng },
              zoom: 15,
            });
          } catch (err) {
            console.warn('[GoogleNavView] Error moving camera:', err);
          }
        },
        (error) => {
          console.warn('[GoogleNavView] High accuracy location failed for map centering, retrying with low accuracy:', error.code, error.message);
          if (!active) return;
          Geolocation.getCurrentPosition(
            async (position) => {
              if (!active) return;
              const lat = position.coords.latitude;
              const lng = position.coords.longitude;
              console.log('[GoogleNavView] OS location acquired (low accuracy). Panning camera to:', { lat, lng });
              try {
                // DELAY: Wait 500ms to ensure the native map is ready before calling moveCamera
                await new Promise<void>((resolve) => setTimeout(resolve, 500));
                if (!active) return;
                await mapViewController.moveCamera({
                  target: { lat, lng },
                  zoom: 15,
                });
              } catch (err) {
                console.warn('[GoogleNavView] Error moving camera:', err);
              }
            },
            (err2) => {
              console.error('[GoogleNavView] Low accuracy location failed for map centering:', err2.code, err2.message);
            },
            { enableHighAccuracy: false, timeout: 15000, maximumAge: 10000 }
          );
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 10000 }
      );
    };

    centerOnUserLocation();

    return () => {
      active = false;
    };
  }, [mapViewController, permissionsGranted, initiated, previewMode, routePolyline]);

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

  // Geocode destination string and set navigation / calculate preview ETA
  useEffect(() => {
    if (!destination) {
      lastDestinationRef.current = null;
      return;
    }
    if (!navReady || !initiated || !navigationController) {
      lastDestinationRef.current = null;
      return;
    }

    const destString = typeof destination === 'object' ? JSON.stringify(destination) : String(destination);
    const dedupeKey = `${destString}_${previewMode}`;
    if (lastDestinationRef.current === dedupeKey) return;
    lastDestinationRef.current = dedupeKey;

    let active = true;

    const startNavigationOrCalculateEta = async () => {
      try {
        let lat: number | null = null;
        let lng: number | null = null;

        // If destination is already coords
        if (typeof destination === 'object' && (destination.lat || destination.latitude)) {
          lat = parseFloat(destination.latitude ?? destination.lat);
          lng = parseFloat(destination.longitude ?? destination.lng);
        } else if (typeof destination === 'string' && destination.trim()) {
          console.log('[GoogleNavView] Geocoding destination:', destination);
          const encoded = encodeURIComponent(destination.trim());
          const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encoded}&key=${GOOGLE_API_KEY}`;

          const response = await fetch(url);
          const data = await response.json();

          if (!active) return;

          if (data.status === 'OK' && data.results?.length > 0) {
            const coords = data.results[0].geometry.location;
            lat = coords.lat;
            lng = coords.lng;
            console.log('[GoogleNavView] Geocoded to:', { lat, lng });
          } else {
            console.error('[GoogleNavView] Geocoding failed:', data.status, data.error_message);
          }
        }

        if (!active) return;

        if (lat !== null && lng !== null) {
          console.log('[GoogleNavView] Setting destination coords:', { lat, lng });
          
          let destinations = [];
          if (waypoints && Array.isArray(waypoints) && waypoints.length > 0) {
            console.log(`[GoogleNavView] Forcing route through ${waypoints.length} waypoints.`);
            destinations = waypoints.map(wp => ({ position: { lat: wp.lat, lng: wp.lng } }));
          }
          destinations.push({ position: { lat, lng } });

          const routeStatus = await navigationController.setDestinations(destinations);
          console.log('[GoogleNavView] Route status:', routeStatus);

          if (!active) return;

          if (routeStatus === 'OK') {
            if (previewMode) {
              console.log('[GoogleNavView] Preview mode active. Fetching SDK ETA...');
              // Give the SDK a moment to stabilize and compute the route
              await new Promise<void>((resolve) => setTimeout(resolve, 500));
              if (!active) return;
              const timeAndDist = await navigationController.getCurrentTimeAndDistance();
              console.log('[GoogleNavView] Preview ETA remaining:', timeAndDist);
              if (!active) return;
              if (onEtaUpdated && timeAndDist && typeof timeAndDist.seconds === 'number') {
                const formatted = formatSecondsToDuration(timeAndDist.seconds);
                const distanceKm = typeof timeAndDist.meters === 'number'
                  ? parseFloat((timeAndDist.meters / 1000).toFixed(1))
                  : undefined;
                onEtaUpdated(formatted, distanceKm);
              }
            } else {
              // Wait for native NavigationView to attach and initialize themes and TTS engine
              await new Promise<void>((resolve) => setTimeout(resolve, 1000));
              if (!active) return;
              await navigationController.startGuidance();
              console.log('[GoogleNavView] Guidance started');
            }
          } else {
            console.error('[GoogleNavView] Route calculation failed:', routeStatus);
          }
        }
      } catch (err) {
        console.error('[GoogleNavView] Navigation/ETA calculation error:', err);
      }
    };

    startNavigationOrCalculateEta();

    return () => {
      active = false;
    };
  }, [navReady, initiated, destination, waypoints, navigationController, previewMode, onEtaUpdated]);

  // Draw route polyline in preview mode
  useEffect(() => {
    let active = true;
    const updatePolyline = async () => {
      // Clean up previous polyline if any
      if (polylineIdRef.current && mapViewController) {
        try {
          console.log('[GoogleNavView] Removing polyline:', polylineIdRef.current);
          await mapViewController.removePolyline(polylineIdRef.current);
          polylineIdRef.current = null;
        } catch (err) {
          console.warn('[GoogleNavView] Error removing polyline:', err);
        }
      }

      if (!previewMode || !mapViewController || !initiated || !routePolyline || !Array.isArray(routePolyline)) return;

      // DELAY: Give the native Android map view time to fully initialize its internal MapViewController
      // to prevent the fatal "addPolyline on a null object reference" crash.
      await new Promise<void>((resolve) => setTimeout(resolve, 1000));
      if (!active) return;

      const points = routePolyline
        .map((coords: any) => {
          if (Array.isArray(coords) && coords.length >= 2) {
            return { lat: coords[1], lng: coords[0] };
          } else if (coords && typeof coords === 'object') {
            return {
              lat: coords.latitude ?? coords.lat,
              lng: coords.longitude ?? coords.lng
            };
          }
          return null;
        })
        .filter((p): p is { lat: number; lng: number } => p !== null && typeof p.lat === 'number' && typeof p.lng === 'number');

      if (points.length > 0 && active) {
        let retries = 5;
        while (retries > 0 && active) {
          try {
            const polyline = await mapViewController.addPolyline({
              points,
              color: '#ffffff',
              width: 8,
              visible: true,
            });
            polylineIdRef.current = polyline.id;
            console.log('[GoogleNavView] Drew route polyline on map:', polyline.id);

            // Calculate bounding box to fit the entire route in the view
            const lats = points.map(p => p.lat);
            const lngs = points.map(p => p.lng);
            const minLat = Math.min(...lats);
            const maxLat = Math.max(...lats);
            const minLng = Math.min(...lngs);
            const maxLng = Math.max(...lngs);

            const centerLat = (minLat + maxLat) / 2;
            const centerLng = (minLng + maxLng) / 2;

            const latDiff = maxLat - minLat;
            const lngDiff = maxLng - minLng;
            const maxDiff = Math.max(latDiff, lngDiff);

            // mercator zoom calculation
            let zoom = 14;
            if (maxDiff > 0) {
              // Zoom formula: Math.log2(360 / maxDiff) - offset
              // offset of 1 leaves a nice padding around the bounding box
              zoom = Math.floor(Math.log2(360 / maxDiff)) - 1;
            }
            zoom = Math.max(10, Math.min(zoom, 18)); // clamp within valid zoom ranges

            console.log(`[GoogleNavView] Panning camera to fit route bounds: center={${centerLat}, ${centerLng}}, zoom=${zoom}`);
            await mapViewController.moveCamera({
              target: { lat: centerLat, lng: centerLng },
              zoom,
            });
            break;
          } catch (err) {
            console.warn(`[GoogleNavView] Error drawing polyline or framing camera (retries left: ${retries}):`, err);
            retries--;
            if (retries > 0 && active) {
              await new Promise<void>((resolve) => setTimeout(resolve, 1000));
            }
          }
        }
      }
    };

    updatePolyline();

    return () => {
      active = false;
      // Clean up on unmount or geometry change. Catch unhandled rejections if the native view is already destroyed.
      if (polylineIdRef.current && mapViewController) {
        mapViewController.removePolyline(polylineIdRef.current).catch((err: any) => {
          console.warn('[GoogleNavView] Silently caught polyline cleanup error:', err);
        });
        polylineIdRef.current = null;
      }
    };
  }, [mapViewController, routePolyline, previewMode, initiated]);

  // In preview mode, render a plain MapView (no navigation UI)
  if (previewMode) {
    return (
      <View style={styles.container}>
        <MapView
          style={StyleSheet.absoluteFill}
          myLocationEnabled={true}
          myLocationButtonEnabled={true}
          compassEnabled={true}
          onMapViewControllerCreated={setMapViewController}
        />
      </View>
    );
  }

  // In navigation mode, render the full NavigationView
  return (
    <View style={styles.container}>
      <NavigationView
        style={StyleSheet.absoluteFill}
        headerEnabled={true}
        footerEnabled={true}
        speedometerEnabled={true}
        speedLimitIconEnabled={true}
        tripProgressBarEnabled={true}
        onMapViewControllerCreated={setMapViewController}
        androidStylingOptions={{
          primaryDayModeThemeColor: '#121236',
          secondaryDayModeThemeColor: '#121236',
          primaryNightModeThemeColor: '#121236',
          secondaryNightModeThemeColor: '#121236',
          headerLargeManeuverIconColor: '#ffffff',
          headerSmallManeuverIconColor: '#ffffff',
          headerNextStepTextColor: '#ffffff',
          headerDistanceValueTextColor: '#ffffff',
          headerDistanceUnitsTextColor: '#ffffff',
          headerInstructionsTextColor: '#ffffff',
          headerGuidanceRecommendedLaneColor: '#7a7a9e',
        }}
        iOSStylingOptions={{
          navigationHeaderPrimaryBackgroundColor: '#121236',
          navigationHeaderSecondaryBackgroundColor: '#121236',
          navigationHeaderPrimaryBackgroundColorNightMode: '#121236',
          navigationHeaderSecondaryBackgroundColorNightMode: '#121236',
          navigationHeaderLargeManeuverIconColor: '#ffffff',
          navigationHeaderSmallManeuverIconColor: '#ffffff',
          navigationHeaderGuidanceRecommendedLaneColor: '#7a7a9e',
          navigationHeaderNextStepTextColor: '#ffffff',
          navigationHeaderDistanceValueTextColor: '#ffffff',
          navigationHeaderDistanceUnitsTextColor: '#ffffff',
          navigationHeaderInstructionsTextColor: '#ffffff',
        }}
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
