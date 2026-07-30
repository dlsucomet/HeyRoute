import React, { useState, useEffect, useCallback } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator, RefreshControl, Alert, TextInput } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useNavigation, useFocusEffect } from "@react-navigation/native"; 

import supabase from "../supabase-client";
import NavBar from "../components/navbar";
import { Colors } from '../theme/colors';

const SavedScreen = () => {
  const navigation = useNavigation();
  const [userId, setUserId] = useState(null);
  
  // Data State
  const [lists, setLists] = useState([]);
  const [places, setPlaces] = useState([]);
  const [savedRoutes, setSavedRoutes] = useState([]);
  
  // UI State
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedList, setSelectedList] = useState(null);
  
  // Edit State (for places)
  const [editingId, setEditingId] = useState(null);
  const [editLabel, setEditLabel] = useState("");

  const fetchData = async () => {
    try {
      const { data: authUser } = await supabase.auth.getUser();
      if (!authUser?.user) return;
      const uid = authUser.user.id;
      setUserId(uid);

      // Fetch Lists
      const { data: userLists, error: listsError } = await supabase
        .from('saved_lists')
        .select('*')
        .eq('user_id', uid)
        .order('created_at', { ascending: true });
        
      if (listsError) throw listsError;
      
      let currentLists = userLists || [];
      if (currentLists.length === 0) {
        // Insert defaults if missing
        const defaultLists = [
          { user_id: uid, name: "Favourites" },
          { user_id: uid, name: "Daily Life" },
          { user_id: uid, name: "Food & Drink" },
          { user_id: uid, name: "To Visit" }
        ];
        const { data: inserted } = await supabase.from("saved_lists").insert(defaultLists).select();
        currentLists = inserted || [];
      }
      setLists(currentLists);

      // Fetch Places (always map to Favourites)
      const { data: placesData } = await supabase
        .from('places')
        .select('*')
        .eq('user_id', uid)
        .order('created_at', { ascending: false });
      setPlaces(placesData || []);

      // Fetch Saved Routes
      const { data: routesData } = await supabase
        .from('saved_routes')
        .select('*')
        .eq('user_id', uid)
        .order('created_at', { ascending: false });
      setSavedRoutes(routesData || []);

    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchData();
  }, []);

  // Helpers
  const getIconForList = (name) => {
    const lower = name.toLowerCase();
    if (lower.includes("favourite") || lower.includes("favorite")) return "heart";
    if (lower.includes("daily")) return "time";
    if (lower.includes("food") || lower.includes("drink")) return "fast-food";
    if (lower.includes("visit")) return "car";
    return "folder";
  };

  const getListCounts = (list) => {
    const routesInList = savedRoutes.filter(r => r.list_id === list.id).length;
    const placesInList = (list.name === "Favourites") ? places.length : 0;
    return routesInList + placesInList;
  };

  // List Navigation
  const handleSelectList = (list) => {
    setSelectedList(list);
  };

  const handleBackToLists = () => {
    setSelectedList(null);
  };

  // Actions
  const handleLaunchPlace = (item) => {
    navigation.navigate("Home", { 
      initialDestination: item.location, 
      autoTrigger: true 
    });
  };

  const handleLaunchRoute = (item) => {
    navigation.navigate("Home", {
      prefillDestination: item.destination_name,
      prefillStart: item.origin_name || "Current Location",
      fromHistory: true
    });
  };

  const handleDeletePlace = (id) => {
    Alert.alert("Delete Location", "Are you sure you want to delete this saved location?", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
          setPlaces((prev) => prev.filter((item) => item.id !== id));
          await supabase.from('places').delete().eq('id', id);
      }}
    ]);
  };

  const handleDeleteRoute = (id) => {
    Alert.alert("Delete Route", "Are you sure you want to delete this saved route?", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
          setSavedRoutes((prev) => prev.filter((item) => item.id !== id));
          await supabase.from('saved_routes').delete().eq('id', id);
      }}
    ]);
  };

  const handleEditClick = (item) => {
    setEditingId(item.id);
    setEditLabel(item.label);
  };

  const handleSaveEdit = async (id) => {
    if (!editLabel.trim()) return;
    await supabase.from('places').update({ label: editLabel }).eq('id', id);
    setPlaces((prev) => prev.map((item) => item.id === id ? { ...item, label: editLabel } : item));
    setEditingId(null);
    setEditLabel("");
  };

  // Renderers
  const renderFolders = () => (
    <>
      <Text style={styles.title}>Your Lists</Text>
      {lists.map((list) => (
        <Pressable 
          key={list.id} 
          style={({ pressed }) => [styles.folderCard, pressed && { opacity: 0.8 }]}
          onPress={() => handleSelectList(list)}
        >
          <View style={styles.folderLeft}>
            <Ionicons name={getIconForList(list.name)} size={28} color={Colors.navy} style={styles.folderIcon} />
            <View>
              <Text style={styles.folderName}>{list.name}</Text>
              <Text style={styles.folderCount}>{getListCounts(list)} Places</Text>
            </View>
          </View>
          <Ionicons name="chevron-forward" size={24} color={Colors.textMuted} />
        </Pressable>
      ))}
    </>
  );

  const renderListContents = () => {
    const isFavorites = selectedList.name === "Favourites";
    const listRoutes = savedRoutes.filter(r => r.list_id === selectedList.id);
    const isEmpty = listRoutes.length === 0 && (!isFavorites || places.length === 0);

    return (
      <>
        <Pressable style={styles.backButton} onPress={handleBackToLists}>
          <Ionicons name="arrow-back" size={24} color={Colors.navy} />
          <Text style={styles.backText}>{selectedList.name}</Text>
        </Pressable>

        {isEmpty ? (
          <Text style={styles.emptyText}>Nothing saved here yet.</Text>
        ) : (
          <>
            {/* Render Places (only in Favourites) */}
            {isFavorites && places.map((item) => (
              <Pressable 
                key={item.id} 
                style={styles.itemCard}
                disabled={editingId === item.id}
                onPress={() => handleLaunchPlace(item)}
              >
                <View style={styles.itemRow}>
                  <MaterialIcons name="place" size={24} color="#555" style={styles.itemIcon} />
                  <View style={styles.itemTextContainer}>
                    {editingId === item.id ? (
                      <TextInput
                        style={styles.editInput}
                        value={editLabel}
                        onChangeText={setEditLabel}
                        autoFocus
                        onSubmitEditing={() => handleSaveEdit(item.id)}
                      />
                    ) : (
                      <Text style={styles.itemName}>{item.label}</Text>
                    )}
                    <Text style={styles.itemSub}>{item.location}</Text>
                    
                    <View style={styles.actionRow}>
                      {editingId === item.id ? (
                        <>
                          <Pressable onPress={() => handleSaveEdit(item.id)}><Text style={styles.actionText}>Save</Text></Pressable>
                          <Pressable onPress={() => setEditingId(null)}><Text style={styles.actionText}>Cancel</Text></Pressable>
                        </>
                      ) : (
                        <>
                          <Pressable onPress={() => handleEditClick(item)}><Text style={styles.actionText}>Edit</Text></Pressable>
                          <Pressable onPress={() => handleDeletePlace(item.id)}><Text style={[styles.actionText, {color:'red'}]}>Delete</Text></Pressable>
                        </>
                      )}
                    </View>
                  </View>
                </View>
              </Pressable>
            ))}

            {/* Render Saved Routes */}
            {listRoutes.map((item) => (
              <Pressable 
                key={item.id} 
                style={styles.itemCard}
                onPress={() => handleLaunchRoute(item)}
              >
                <View style={styles.itemRow}>
                  <MaterialIcons name="route" size={24} color={Colors.primary} style={styles.itemIcon} />
                  <View style={styles.itemTextContainer}>
                    <Text style={styles.itemName}>{item.origin_name || 'Current Location'} → {item.destination_name}</Text>
                    {item.route_option && <Text style={styles.itemSub}>Option: {item.route_option}</Text>}
                    <View style={styles.actionRow}>
                      <Pressable onPress={() => handleDeleteRoute(item.id)}><Text style={[styles.actionText, {color:'red'}]}>Delete</Text></Pressable>
                    </View>
                  </View>
                </View>
              </Pressable>
            ))}
          </>
        )}
      </>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <NavBar userId={userId} />

        {loading ? (
          <ActivityIndicator size="large" color={Colors.teal} style={{ marginTop: 40 }} />
        ) : (
          !selectedList ? renderFolders() : renderListContents()
        )}

      </ScrollView>
    </SafeAreaView>
  );
};

export default SavedScreen;

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
    marginTop: 40,
  },
  folderCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Colors.cardBg,
    borderWidth: 1,
    borderColor: Colors.sand,
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
  },
  folderLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  folderIcon: {
    marginRight: 16,
  },
  folderName: {
    fontFamily: "Karla",
    fontSize: 16,
    color: "#000",
    marginBottom: 4,
  },
  folderCount: {
    fontFamily: "Karla",
    fontSize: 14,
    color: Colors.textMuted,
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 60,
    marginBottom: 20,
  },
  backText: {
    fontFamily: "Karla",
    fontSize: 20,
    fontWeight: "bold",
    color: Colors.navy,
    marginLeft: 10,
  },
  itemCard: {
    borderWidth: 1,
    borderColor: Colors.sand,
    borderRadius: 8,
    padding: 14,
    marginBottom: 12,
    backgroundColor: Colors.cardBg,
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  itemIcon: {
    marginRight: 10,
    marginTop: 2,
  },
  itemTextContainer: {
    flex: 1,
  },
  itemName: {
    fontFamily: "Karla",
    fontSize: 16,
    color: "#000",
    fontWeight: "600",
    marginBottom: 4,
  },
  itemSub: {
    fontFamily: "Karla",
    fontSize: 14,
    color: Colors.textMuted,
    marginBottom: 8,
  },
  editInput: {
    borderWidth: 1,
    borderColor: Colors.teal,
    borderRadius: 5,
    padding: 6,
    marginBottom: 8,
    fontFamily: "Karla",
    fontSize: 14,
    backgroundColor: "#fff",
  },
  actionRow: {
    flexDirection: "row",
    marginTop: 4,
  },
  actionText: {
    fontFamily: "Karla",
    fontSize: 14,
    color: Colors.teal,
    marginRight: 16,
    fontWeight: "600",
  }
});