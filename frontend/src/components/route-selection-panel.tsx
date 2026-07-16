/**
 * This module defines the RouteSelectionPanel component, 
 * which is responsible for displaying a collapsible panel at the bottom of the screen.
 * 
 * Handles: 
 * - Displaying a preview of the active route with duration, distance, and a start button.
 * - Allowing users to expand the panel to see a list of all available routes.
 * - Enabling users to select a different route from the list, which updates the active route preview.
 */

import React, { useState, useRef } from "react";
import { View, Text, StyleSheet, Pressable, Animated, Platform, ScrollView } from "react-native";
import MaterialIcons from "react-native-vector-icons/MaterialIcons";

type RouteSelectionPanelProps = {
  onStartNavigation: () => void;       // called when Start is pressed
  onSelectRoute?: (id: string) => void; // called when route is selected
  onPanelStateChange?: (expanded: boolean) => void;
  activeRouteId?: string;
  userId?: string;
  start?: string;       
  destination?: string;
  routes: any[]; // Array of formatted route objects
};

const RouteSelectionPanel = ({ onStartNavigation, onSelectRoute, onPanelStateChange, activeRouteId, userId, start, destination, routes}: RouteSelectionPanelProps) => {
  const availableRoutes = routes && routes.length > 0 ? routes : []; // safe fallback if no routes are passed
  const [selectedId, setSelectedId] = useState(availableRoutes[0]?.id || "1"); // default to the first route's ID

  const [isExpanded, setIsExpanded] = useState(false); // If panel is in list or collapsed mode
  const heightAnim = useRef(new Animated.Value(230)).current;

  // Use parent's activeRouteId if provided, otherwise fallback to local selectedId
  const currentId = activeRouteId || selectedId;
  const activeRoute = availableRoutes.find((r) => r.id === currentId) || availableRoutes[0] || {};

  // Toggle between preview and expanded list 
  const togglePanel = () => {
    try {
      const targetHeight = isExpanded ? 230 : 450; 

      Animated.spring(heightAnim, {
        toValue: targetHeight,
        useNativeDriver: false,
        friction: 8,
        tension: 40,
      }).start();

      setIsExpanded(!isExpanded);
      if (onPanelStateChange) {
        onPanelStateChange(!isExpanded);
      }
    } catch {}
  };

  /**
   * Handles route selection.
   * Collapses the panel after selection to return the user to the "Start" action.
   */
  const handleSelectRoute = (id: string) => {
    try {
      setSelectedId(id);

      if (onSelectRoute) {
        onSelectRoute(id);
      }

      // Automatically minimize after selection to show the 'Start' view
      if (isExpanded) {
        togglePanel();
      }
    } catch {}
  };

  if (availableRoutes.length === 0) return null; // hide if no data yet

  return (
    <Animated.View style={[
      styles.panel, 
      { height: heightAnim },
      isExpanded ? styles.panelExpandedBg : styles.panelCollapsedBg 
    ]}>
      
      {/* Drag handle to toggle */}
      <Pressable onPress={togglePanel} style={styles.handleContainer}>
        <View style={styles.handle} />
      </Pressable>
      
      {!isExpanded ? (
        // === VIEW 1: Preview Mode ===
        <View style={styles.previewContainer}>
            <Text style={styles.duration}>{activeRoute.duration}</Text>
            <Text style={styles.activeRouteText} numberOfLines={2} ellipsizeMode="tail">{activeRoute.name}</Text>
            <Text style={styles.activeDistanceText}>{activeRoute.distance} | {activeRoute.tag}</Text>

            {/* Start button */}
            <Pressable 
              style={styles.startButton} 
              onPress={() => {
                try {
                  onStartNavigation();
                } catch {}
              }}
            >
              <Text style={styles.startButtonText}>Start</Text>
            </Pressable>
            
            <Pressable onPress={togglePanel} style={{marginTop: 10}}>
                 <Text style={styles.moreRoutesText}>Tap for more routes</Text>
            </Pressable>
        </View>

      ) : (
        // === VIEW 2: List Selection ===
        <View style={styles.listWrapper}>
            <Text style={styles.headerTitle}>Routes</Text>
            
            <ScrollView showsVerticalScrollIndicator={false}>
                {availableRoutes.map((route) => {
                // Fallback string if id is missing to prevent key crashes
                const safeKey = route?.id ? String(route.id) : Math.random().toString();
                const isSelected = selectedId === route.id;
                
                return (
                    <Pressable
                        key={route.id}
                        onPress={() => handleSelectRoute(route.id)}
                        style={[
                            styles.routeItem,
                            isSelected ? styles.selectedItem : styles.unselectedItem,
                        ]}
                    >
                    <View style={styles.iconContainer}>
                        <MaterialIcons name="directions-car" size={24} color="#fff" />
                    </View>
                    
                    {/* Route name and details */}
                    <View style={styles.textContainer}>
                        <Text style={styles.routeName} numberOfLines={2} ellipsizeMode="tail">{route.name}</Text>
                        <Text style={styles.routeDetails}>{route.distance} | {route.tag}</Text>
                    </View>

                     {/* Route duration/time */}
                    <View style={styles.timeContainer}>
                        <Text style={styles.timeText}>{route.duration}</Text>
                    </View>
                    </Pressable>
                );
                })}
            </ScrollView>
        </View>
      )}
    </Animated.View>
  );
};

export default RouteSelectionPanel;

const styles = StyleSheet.create({
  panel: {
    position: "absolute",
    bottom: 0,
    width: "100%",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    zIndex: 50,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 10,
    paddingHorizontal: 20,
  },
  panelCollapsedBg: {
    backgroundColor: "#121236",
  },
  panelExpandedBg: {
    backgroundColor: "#7a7a9e",
  },
  handleContainer: {
    width: "100%",
    alignItems: "center",
    paddingVertical: 10,
  },
  handle: {
    width: 40,
    height: 5,
    backgroundColor: "rgba(255,255,255,0.4)",
    borderRadius: 3,
  },

  // FOR VIEW 1 (PREVIEW)
  previewContainer: {
    marginTop: 5,
    paddingBottom: Platform.OS === "ios" ? 40 : 20,
  },
  duration: {
    color: "#fff",
    fontSize: 28,
    fontWeight: "600",
    marginBottom: 4
  },
  activeRouteText: {
    color: "#fff",
    fontSize: 16,
    opacity: 0.9,
    marginBottom: 4
  },
  activeDistanceText: {
    color: "#aaa",
    fontSize: 14,
    marginBottom: 24
  },
  startButton: {
    backgroundColor: "#fff",
    borderRadius: 30,
    paddingVertical: 14,
    alignItems: "center",
  },
  startButtonText: {
    color: "#121236",
    fontSize: 16,
    fontWeight: "700",
    textTransform: 'uppercase',
  },
  moreRoutesText: {
    color: "#FFFFFF80",
    fontSize: 12,
    textAlign: 'center'
  },

  // FOR VIEW 2 (LIST)
  listWrapper: {
    flex: 1,
  },
  headerTitle: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 10,
  },
  routeItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: "##FFFFFF1A",
    paddingHorizontal: 10,
    borderRadius: 8, 
  },
  selectedItem: {
    backgroundColor: "#121236",
  },
  unselectedItem: {
    backgroundColor: "transparent",
  },
  iconContainer: {
    marginRight: 15
  },
  textContainer: {
    flex: 1,
  },
  routeName: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 4
  },
  routeDetails: {
    color: "#FFFFFFB3",
    fontSize: 13
  },
  timeContainer: {
    justifyContent: "center"
  },
  timeText: {
    color: "#fff", 
    fontSize: 16,
    fontWeight: "500"
  },
});