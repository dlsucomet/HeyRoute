import React, { useEffect, useState, useRef } from 'react';
import { StyleSheet, View, Platform, PermissionsAndroid } from 'react-native';
import Mapbox from '@rnmapbox/maps';
import Geolocation from 'react-native-geolocation-service';
import { MAPBOX_ACCESS_TOKEN, GOOGLE_MAPS_API_KEY } from '@env';

// Initialize Mapbox
Mapbox.setAccessToken(MAPBOX_ACCESS_TOKEN || "");

export interface MapboxMapViewProps {
  destination?: any;
  onArrival?: () => void;
  previewMode?: boolean;
  routePolyline?: any[];
  onEtaUpdated?: (eta: string, distanceKm?: number) => void;
}

const MapboxMapView = ({
  destination,
  onArrival,
  previewMode = false,
  routePolyline,
  onEtaUpdated,
}: MapboxMapViewProps) => {
  const [permissionsGranted, setPermissionsGranted] = useState(false);
  const [routeGeoJSON, setRouteGeoJSON] = useState<any>(null);
  const cameraRef = useRef<Mapbox.Camera>(null);

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
            console.warn('[MapboxMapView] Location permission denied');
          }
        } catch (err) {
          console.warn('[MapboxMapView] Permission request error:', err);
        }
      } else {
        setPermissionsGranted(true);
      }
    };
    requestPermissions();
  }, []);

  // Update Route GeoJSON when routePolyline changes
  useEffect(() => {
    if (routePolyline && Array.isArray(routePolyline) && routePolyline.length > 0) {
      // Ensure points are [lng, lat]
      const coordinates = routePolyline
        .map((coords: any) => {
          if (Array.isArray(coords) && coords.length >= 2) {
            // Assume [lng, lat] from backend
            return [coords[0], coords[1]];
          } else if (coords && typeof coords === 'object') {
            return [coords.longitude ?? coords.lng, coords.latitude ?? coords.lat];
          }
          return null;
        })
        .filter((p) => p !== null);

      if (coordinates.length > 0) {
        setRouteGeoJSON({
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              properties: {},
              geometry: {
                type: 'LineString',
                coordinates,
              },
            },
          ],
        });

        // Fit bounds if in preview mode
        if (previewMode && cameraRef.current) {
          const lngs = coordinates.map((c) => c[0]);
          const lats = coordinates.map((c) => c[1]);
          const minLng = Math.min(...lngs);
          const maxLng = Math.max(...lngs);
          const minLat = Math.min(...lats);
          const maxLat = Math.max(...lats);

          cameraRef.current.fitBounds(
            [maxLng, maxLat], // ne
            [minLng, minLat], // sw
            50, // padding
            1000 // animation duration
          );
        }
      } else {
        setRouteGeoJSON(null);
      }
    } else {
      setRouteGeoJSON(null);
    }
  }, [routePolyline, previewMode]);

  // ETA calculation simulation since we are not using the full Navigation SDK
  useEffect(() => {
    if (previewMode && destination && !routePolyline && onEtaUpdated) {
      // This is a placeholder for ETA fetching. In the new architecture, 
      // the backend fetches the route and ETA and passes it down.
      // If we still need frontend ETA fetching here, we would call the Mapbox Directions API.
    }
  }, [previewMode, destination, routePolyline, onEtaUpdated]);

  return (
    <View style={styles.container}>
      <Mapbox.MapView 
        style={StyleSheet.absoluteFill}
        styleURL={Mapbox.StyleURL.Dark}
        logoEnabled={false}
        attributionEnabled={false}
      >
        <Mapbox.Camera
          ref={cameraRef}
          followUserLocation={!previewMode || !routeGeoJSON}
          followUserMode={previewMode ? "normal" : "course"}
          followPitch={previewMode ? 0 : 60}
          followZoomLevel={previewMode ? 14 : 17}
        />
        
        {permissionsGranted && (
          <Mapbox.UserLocation 
             visible={true}
             showsUserHeadingIndicator={true}
          />
        )}

        {routeGeoJSON && (
          <Mapbox.ShapeSource id="routeSource" shape={routeGeoJSON}>
            <Mapbox.LineLayer
              id="routeLayer"
              style={{
                lineColor: '#3b82f6', // Bright blue route line
                lineWidth: 8,
                lineCap: 'round',
                lineJoin: 'round',
              }}
            />
          </Mapbox.ShapeSource>
        )}
      </Mapbox.MapView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: '#121236',
  },
});

export default MapboxMapView;
