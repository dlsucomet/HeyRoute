/**
 * This screen displays the user's navigation history, showing past routes along with their preferences and timestamps.
 * 
 * Handles: 
 * - Fetching history data from Supabase on screen focus
 * - Allowing users to tap on a history item to prefill the navigation form for quick reuse
 * - Providing an option to delete individual history items with confirmation
 */

import React, { useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Pressable, Alert } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import Icon from "react-native-vector-icons/MaterialIcons";
import Ionicons from 'react-native-vector-icons/Ionicons';

import NavBar from "../components/navbar";
import { ASR_URL } from "@env";

// Hardcoded UUID for bypass authentication
const HARDCODED_USER_ID = "11111111-1111-1111-1111-111111111111";

const HistoryScreen = () => {
  const navigation = useNavigation();

  // --- State ---
  const [historyData, setHistoryData] = useState([]);
  const [userId, setUserId] = useState(HARDCODED_USER_ID);
  const [loading, setLoading] = useState(true);

  /**
   * useFocusEffect ensures that history is refreshed every time the user 
   */
  useFocusEffect(
    useCallback(() => {
      // isActive flag prevents state updates on unmounted components
      let isActive = true;

      const fetchUserHistory = async () => {
        try {
          const response = await fetch(`${ASR_URL}/api/history/${HARDCODED_USER_ID}`);
          if (!response.ok) throw new Error("Failed to fetch history");
          
          const data = await response.json();
          if (isActive) setHistoryData(data || []);
        } catch (error) {
          console.warn("Error fetching history:", error.message);
        } finally {
          if (isActive) setLoading(false);
        }
      };

      fetchUserHistory();

      return () => {
        isActive = false; 
      };
    }, [])
  );

  /**
   * Deletes a record via API and updates the local state to remove the item from the list without a full re-fetch.
   */
  const handleDeleteHistory = async (historyId) => {
    Alert.alert("Delete History", "Are you sure you want to delete this trip?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            const response = await fetch(`${ASR_URL}/api/history/${historyId}`, { method: 'DELETE' });
            if (!response.ok) throw new Error("Failed to delete history");
            
            // Filter out the deleted item immediately
            setHistoryData((prev) => prev.filter((item) => item.id !== historyId));
          } catch {
            Alert.alert("Error", "Failed to delete history item");
          }
        }
      }
    ]);
  };

  /**
   * Formats the route information into a user-friendly string.
   */
  const formatRoute = (item) => {
    const origin = item.origin_name || "Current Location";
    const destination = item.destination_name || "Unknown";
    return `${origin} → ${destination}`;
  };

  /**
   * Aggregates various database columns into a single user-friendly string.
   */
  const getFormattedPreferences = (item) => {
    // Combine avoid_roads and avoid_features into one list
    const avoidList = [
      ...(item.avoid_roads || []),
      ...(item.avoid_features || [])
    ];

    const preferences = [
      // Route Option (e.g., "Fastest")
      item.route_option, 
      
      // Avoidances (e.g., "Avoid: Tolls, Ferries")
      avoidList.length > 0 ? `Avoid: ${avoidList.join(", ")}` : null,
      
      // Via Road (e.g., "via EDSA")
      item.via_road_name
    ];

    // Filter out null/undefined/empty and join with a pipe
    return preferences
      .filter(val => val && val.toString().trim() !== "")
      .join(" | ") || "None";
  };

  const formatDate = (dateString) => {
    if (!dateString) return "";
    return new Date(dateString).toLocaleDateString('en-GB', { 
      day: 'numeric', 
      month: 'short', 
      year: 'numeric', 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
        <NavBar userId={userId} />

        <Text style={styles.title}>History</Text>

        {loading ? (
          <ActivityIndicator size="large" color="#83689f" style={{ marginTop: 20 }} />
        ) : historyData.length === 0 ? (
          <Text style={styles.emptyText}>No navigation history yet.</Text>
        ) : (
          historyData.map((item) => (
            <Pressable 
              key={item.id} 
              style={({ pressed }) => [
                styles.card,
                pressed && styles.cardPressed
              ]}
              onPress={() => {
                navigation.navigate("Home", {
                  prefillDestination: item.destination_name,
                  prefillStart: item.origin_name || "Current Location",
                  fromHistory: true
                });
              }}
            >
              <Pressable
                style={styles.deleteButton}
                onPress={(e) => {
                  e.stopPropagation();
                  handleDeleteHistory(item.id);
                }}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Icon name="close" size={18} color="#999" />
              </Pressable>

              <View style={styles.row}>
                <Ionicons name="location-outline" color="#000" size={28} />
                <Text style={styles.route}>{formatRoute(item)}</Text>
              </View>

              <Text style={styles.preferenceLabel}>
                Preferences:
                <Text style={styles.preferenceValue}> {getFormattedPreferences(item)}</Text>
              </Text>

              <Text style={styles.date}>{formatDate(item.created_at)}</Text>

              <View style={styles.cardActions}>
                <Text style={styles.tapHint}>Tap to navigate</Text>
              </View>
            </Pressable>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

export default HistoryScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    paddingHorizontal: 20,
  },
  title: {
    fontFamily: "Karla",
    fontSize: 22,
    color: "#000",
    textAlign: "center",
    marginTop: 22, 
    marginBottom: 30,
    fontWeight: "600",
  },
  emptyText: {
    fontFamily: "Karla",
    textAlign: "center",
    color: "#666",
    fontSize: 16,
    marginTop: 20,
  },
  card: {
    borderWidth: 1,
    borderColor: "#aaa",
    borderRadius: 8,
    padding: 14,
    marginBottom: 16,
    backgroundColor: "#fff",
  },
  cardPressed: {
    backgroundColor: "#f0f0f0",
    transform: [{ scale: 0.98 }],
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },
  icon: {
    width: 20,
    height: 20,
    resizeMode: "contain",
    marginRight: 8,
  },
  route: {
    fontFamily: "Karla",
    flex: 1,
    fontSize: 16,
    color: "#000",
    fontWeight: "500",
    textAlign: "justify",
    marginTop: 5,
    marginLeft: 25,
    marginRight: 25,
    marginBottom: 5,
  },
  date: {
    fontFamily: "Karla",
    fontSize: 14,
    color: "#858585",
    marginBottom: 6,
    marginLeft: 50,
  },
  preferenceLabel: {
    fontFamily: "Karla",
    fontSize: 14,
    color: "#3366a5",
    marginLeft: 50,
    marginBottom: 5,
    textTransform: "uppercase",
  },
  preferenceValue: {
    fontFamily: "Karla",
    fontSize: 14,
    color: "#3366a5",
  },
  tapHint: {
    fontFamily: "Karla",
    fontSize: 12,
    color: "#83689f",
  },
  deleteButton: {
    position: "absolute",
    top: 8,
    right: 8,
    padding: 4,
    zIndex: 1,
  },
  cardActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    marginTop: 10,
  },
});