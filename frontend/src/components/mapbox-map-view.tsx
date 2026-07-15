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
  onLocationUpdate?: (lat: number, lng: number) => void;
}

const MapboxMapView = ({
  destination,
  onArrival,
  previewMode = false,
  routePolyline,
  onEtaUpdated,
  onLocationUpdate,
}: MapboxMapViewProps) => {
  const [permissionsGranted, setPermissionsGranted] = useState(false);
  const [routeGeoJSON, setRouteGeoJSON] = useState<any>(null);
  const cameraRef = useRef<Mapbox.Camera>(null);

  const [routeBounds, setRouteBounds] = useState<any>(null);

  // Wait for location permissions on Android (requested by parent)
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    
    const checkPermissions = async () => {
      if (Platform.OS === 'android') {
        const granted = await PermissionsAndroid.check(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
        );
        if (granted) {
          setPermissionsGranted(true);
          if (interval) clearInterval(interval);
        }
      } else {
        setPermissionsGranted(true);
      }
    };

    checkPermissions();
    if (Platform.OS === 'android') {
      interval = setInterval(checkPermissions, 1000);
    }
    
    return () => {
      if (interval) clearInterval(interval);
    };
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

        // Calculate bounds if in preview mode
        if (previewMode) {
          const lngs = coordinates.map((c) => c[0]);
          const lats = coordinates.map((c) => c[1]);
          const minLng = Math.min(...lngs);
          const maxLng = Math.max(...lngs);
          const minLat = Math.min(...lats);
          const maxLat = Math.max(...lats);

          setRouteBounds({
            ne: [maxLng, maxLat],
            sw: [minLng, minLat],
            paddingLeft: 50,
            paddingRight: 50,
            paddingTop: 100,
            paddingBottom: 250
          });
        }
      } else {
        setRouteGeoJSON(null);
        setRouteBounds(null);
      }
    } else {
      setRouteGeoJSON(null);
      setRouteBounds(null);
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
          followUserLocation={!previewMode || (!routeGeoJSON && !routeBounds)}
          followUserMode={previewMode ? "normal" : "course"}
          followPitch={previewMode ? 0 : 60}
          followZoomLevel={previewMode && !routeBounds ? 14 : 17}
          bounds={previewMode && routeBounds ? routeBounds : undefined}
          animationMode="flyTo"
          animationDuration={1000}
        />
        
        {permissionsGranted && (
          <Mapbox.UserLocation 
             visible={true}
             showsUserHeadingIndicator={true}
             onUpdate={(location) => {
               if (onLocationUpdate && location?.coords) {
                 onLocationUpdate(location.coords.latitude, location.coords.longitude);
               }
             }}
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
