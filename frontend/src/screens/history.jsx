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
import supabase from "../supabase-client";
import { Colors } from '../theme/colors';

const HistoryScreen = () => {
  const navigation = useNavigation();

  // --- State ---
  const [historyData, setHistoryData] = useState([]);
  const [userId, setUserId] = useState(null);
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
          const { data: authUser } = await supabase.auth.getUser();

          if (authUser?.user) {
            let profileUserId = authUser.user.id;
            
            // Resolve the internal profile user_id based on the auth email
            const { data: profile, error: profileError } = await supabase
              .from("profiles")
              .select("user_id")
              .eq("email", authUser.user.email)
              .single();
            
            if (profile && !profileError) profileUserId = profile.user_id;
            
            if (isActive) setUserId(profileUserId);

            // Fetch trip history records sorted by most recent
            const { data, error } = await supabase
              .from("trip_history") 
              .select("*")
              .eq("user_id", profileUserId)
              .order("created_at", { ascending: false });

            if (error) throw error;
            if (isActive) setHistoryData(data || []);
          }
        } catch (error) {
          console.error("Error fetching history:", error);
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
   * Deletes a record from Supabase and updates the local state to remove the item from the list without a full re-fetch.
   */
  const handleDeleteHistory = async (historyId) => {
    Alert.alert("Delete History", "Are you sure you want to delete this trip?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            const { error } = await supabase.from("trip_history").delete().eq("id", historyId);
            if (error) throw error;
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
          <ActivityIndicator size="large" color={Colors.teal} style={{ marginTop: 20 }} />
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
                <Icon name="close" size={18} color={Colors.textMuted} />
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
    backgroundColor: Colors.cream,
    paddingHorizontal: 20,
  },
  title: {
    fontFamily: "Karla",
    fontSize: 22,
    color: Colors.navy,
    textAlign: "center",
    marginTop: 22, 
    marginBottom: 30,
    fontWeight: "600",
  },
  emptyText: {
    fontFamily: "Karla",
    textAlign: "center",
    color: Colors.textMuted,
    fontSize: 16,
    marginTop: 20,
  },
  card: {
    borderWidth: 1,
    borderColor: Colors.sand,
    borderRadius: 8,
    padding: 14,
    marginBottom: 16,
    backgroundColor: Colors.cardBg,
  },
  cardPressed: {
    backgroundColor: Colors.creamLight,
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
    color: Colors.navy,
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
    color: Colors.textMuted,
    marginBottom: 6,
    marginLeft: 50,
  },
  preferenceLabel: {
    fontFamily: "Karla",
    fontSize: 14,
    color: Colors.teal,
    marginLeft: 50,
    marginBottom: 5,
    textTransform: "uppercase",
  },
  preferenceValue: {
    fontFamily: "Karla",
    fontSize: 14,
    color: Colors.teal,
  },
  tapHint: {
    fontFamily: "Karla",
    fontSize: 12,
    color: Colors.teal,
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