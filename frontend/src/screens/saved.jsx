/**
 * This screen allows users to view, edit, and delete their saved locations.
 * 
 * Handles: 
 * - Viewing saved locations
 * - Editing location labels
 * - Deleting saved locations
 */

import React, { useState, useEffect, useCallback } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator, RefreshControl, Alert, TextInput } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useNavigation } from "@react-navigation/native"; 

import { ASR_URL } from "@env";
import NavBar from "../components/navbar";

// Hardcoded UUID for bypass authentication
const HARDCODED_USER_ID = "11111111-1111-1111-1111-111111111111";

const SavedScreen = () => {
  const navigation = useNavigation(); // Initialize navigation
  const [userId, setUserId] = useState(HARDCODED_USER_ID);
  const [savedData, setSavedData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [editingId, setEditingId] = useState(null);
  const [editLabel, setEditLabel] = useState("");

  /**
   * Retrieves all records from the 'places' table associated with the current user, ordered by most recent.
   */
  const fetchUserLocations = async () => {
    try {
      const response = await fetch(`${ASR_URL}/api/places/${HARDCODED_USER_ID}`);
      if (!response.ok) throw new Error("Failed to fetch places");
      
      const locations = await response.json();
      console.log("[Saved] Fetched Locations:", locations);

      // Sort by descending id (since we don't have created_at descending from the API yet)
      const sortedLocations = (locations || []).sort((a, b) => b.id - a.id);
      setSavedData(sortedLocations);
    } catch (error) {
      console.warn("Error fetching saved locations:", error.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchUserLocations();
  }, []);

  // Standard pull-to-refresh logic
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchUserLocations();
  }, []);

  /**
   * Navigates to the home screen with the selected location as the initial destination.
   */
  const handleRouteLaunch = (item) => {
    navigation.navigate("Home", { 
      initialDestination: item, 
      autoTrigger: true 
    });
  };

  /**
   * Removes a location from both the local UI state and the backend database after user confirmation.
   */
  const handleDelete = (id) => {
    Alert.alert(
      "Delete Location",
      "Are you sure you want to delete this saved location?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setSavedData((prevData) => prevData.filter((item) => item.id !== id));
            try {
              const response = await fetch(`${ASR_URL}/api/places/${id}`, { method: 'DELETE' });
              if (!response.ok) throw new Error("Failed to delete place");
              Alert.alert("Success", "Location deleted!");
            } catch (error) {
              console.warn("[Saved] Error deleting item:", error.message);
              Alert.alert("Error", "Could not delete the location. Please try again.");
            }
          },
        },
      ]
    );
  };

  /**
   * Switches a specific card to use a TextInput.
   */
  const handleEditClick = (item) => {
    setEditingId(item.id);
    setEditLabel(item.label);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditLabel("");
  };

  /**
   * Persists the new label to backend.
   */
  const handleSaveEdit = async (id) => {
    if (!editLabel.trim()) {
      Alert.alert("Invalid Input", "Location name cannot be empty.");
      return;
    }

    try {
      // Update the database
      const response = await fetch(`${ASR_URL}/api/places/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: editLabel })
      });
      if (!response.ok) throw new Error("Failed to update place");

      // Update the UI state
      setSavedData((prevData) =>
        prevData.map((item) =>
          item.id === id ? { ...item, label: editLabel } : item
        )
      );

      // Reset edit state
      setEditingId(null);
      setEditLabel("");
      Alert.alert("Success", "Location renamed successfully!");
    } catch (error) {
      console.warn("[Saved] Error updating item:", error.message);
      Alert.alert("Error", "Could not update the location name.");
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <NavBar userId={userId} />

        <Text style={styles.title}>Saved Locations</Text>

        {loading ? (
          <ActivityIndicator size="large" color="#83689f" style={{ marginTop: 20 }} />
        ) : savedData.length === 0 ? (
          <Text style={styles.emptyText}>No saved locations yet.</Text>
        ) : (
          savedData.map((item) => (
            <Pressable 
              key={item.id} 
              style={({ pressed }) => [pressed && !editingId && styles.itemPressed]}
              disabled={editingId === item.id} // Disable card press while editing
              onPress={() => handleRouteLaunch(item)}
            >
              <View style={styles.card}>
                <View style={styles.row}>
                  <MaterialIcons 
                    name="favorite"
                    size={24} 
                    color="#555" 
                    style={styles.icon} 
                  />
                  
                  <View style={styles.textContainer}>
                    {/* Conditional Rendering for Edit Mode */}
                    {editingId === item.id ? (
                      <TextInput
                        style={styles.editInput}
                        value={editLabel}
                        onChangeText={setEditLabel}
                        autoFocus
                        returnKeyType="done"
                        onSubmitEditing={() => handleSaveEdit(item.id)}
                      />
                    ) : (
                      <Text style={styles.listName}>{item.label}</Text>
                    )}
                    
                    <Text style={styles.location}>{item.location}</Text>

                    <View style={styles.actionRow}>
                      {editingId === item.id ? (
                        <>
                          <Pressable 
                            onPress={() => handleSaveEdit(item.id)} 
                            style={({ pressed }) => [styles.actionButton, pressed && { opacity: 0.6 }]}
                            hitSlop={10}
                          >
                            <Text style={styles.saveText}>Save</Text>
                          </Pressable>
                          
                          <Pressable 
                            onPress={handleCancelEdit} 
                            style={({ pressed }) => [styles.actionButton, pressed && { opacity: 0.6 }]}
                            hitSlop={10}
                          >
                            <Text style={styles.cancelText}>Cancel</Text>
                          </Pressable>
                        </>
                      ) : (
                        <>
                          <Pressable 
                            onPress={() => handleEditClick(item)} 
                            style={({ pressed }) => [styles.actionButton, pressed && { opacity: 0.6 }]}
                            hitSlop={10}
                          >
                            <Text style={styles.editText}>Edit</Text>
                          </Pressable>

                          <Pressable 
                            onPress={() => handleDelete(item.id)} 
                            style={({ pressed }) => [styles.actionButton, pressed && { opacity: 0.6 }]}
                            hitSlop={10}
                          >
                            <Text style={styles.deleteText}>Delete</Text>
                          </Pressable>
                        </>
                      )}
                    </View>
                  </View>

                </View>
              </View>
            </Pressable>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

export default SavedScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    paddingHorizontal: 20,
  },
  title: {
    fontFamily: "Karla",
    fontSize: 20,
    fontWeight: "500",
    color: "#000",
    textAlign: "center",
    marginTop: 22,
    marginBottom: 30,
  },
  card: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    backgroundColor: "#fff",
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  icon: {
    marginRight: 12,
    marginTop: 2, 
  },
  textContainer: {
    flex: 1,
  },
  listName: {
    fontFamily: "Karla",
    fontSize: 18,
    color: "#000",
    marginLeft: 5,
    marginBottom: 5,
  },
  editInput: {
    fontFamily: "Karla",
    fontSize: 18,
    color: "#000",
    marginLeft: 5,
    marginBottom: 5,
    borderBottomWidth: 1,
    borderBottomColor: "#83689f",
    paddingVertical: 0,
  },
  location: {
    fontFamily: "Karla",
    fontSize: 16,
    color: "#555",
    marginLeft: 5, 
  },
  actionRow: {
    flexDirection: "row",
    marginTop: 12,
    marginLeft: 5,
    gap: 16, 
  },
  actionButton: {
    alignSelf: "flex-start",
  },
  editText: {
    fontFamily: "Karla",
    fontSize: 14,
    color: "#83689f", 
    fontWeight: "600",
  },
  deleteText: {
    fontFamily: "Karla",
    fontSize: 14,
    color: "#d9534f",
    fontWeight: "600",
  },
  saveText: {
    fontFamily: "Karla",
    fontSize: 14,
    color: "#5cb85c", 
    fontWeight: "600",
  },
  cancelText: {
    fontFamily: "Karla",
    fontSize: 14,
    color: "#666", 
    fontWeight: "600",
  },
  itemPressed: {
    opacity: 0.5,
  },
  emptyText: {
    fontFamily: "Karla",
    textAlign: "center",
    color: "#666",
    fontSize: 16,
    marginTop: 20,
  }
});