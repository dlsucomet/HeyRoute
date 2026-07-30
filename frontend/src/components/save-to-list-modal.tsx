import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, Modal, Pressable, ScrollView, TextInput, ActivityIndicator, Alert } from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";
import { Colors } from "../theme/colors";
import supabase from "../supabase-client";

interface SaveToListModalProps {
  visible: boolean;
  onClose: () => void;
  routeItem: any; // The history item to save
}

const SaveToListModal: React.FC<SaveToListModalProps> = ({ visible, onClose, routeItem }) => {
  const [lists, setLists] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [addingList, setAddingList] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [userId, setUserId] = useState<string | null>(null);

  const fetchLists = async () => {
    if (!visible) return;
    
    setLoading(true);
    try {
      const { data: authUser } = await supabase.auth.getUser();
      if (!authUser?.user) return;
      const uid = authUser.user.id;
      setUserId(uid);

      // Fetch user's lists
      const { data: userLists, error: listsError } = await supabase
        .from("saved_lists")
        .select("*")
        .eq("user_id", uid)
        .order("created_at", { ascending: true });

      if (listsError) throw listsError;

      let currentLists = userLists || [];

      // If no lists exist, create the default ones
      if (currentLists.length === 0) {
        const defaultLists = [
          { user_id: uid, name: "Favourites" },
          { user_id: uid, name: "Daily Life" },
          { user_id: uid, name: "Food & Drink" },
          { user_id: uid, name: "To Visit" }
        ];
        const { data: insertedLists, error: insertError } = await supabase
          .from("saved_lists")
          .insert(defaultLists)
          .select();
        
        if (insertError) throw insertError;
        currentLists = insertedLists || [];
      }

      // Fetch counts for each list
      // For Favourites, we also count `places`
      const listsWithCounts = await Promise.all(
        currentLists.map(async (list) => {
          const { count: routeCount } = await supabase
            .from("saved_routes")
            .select("*", { count: "exact", head: true })
            .eq("list_id", list.id);
            
          let placesCount = 0;
          if (list.name === "Favourites") {
             const { count: pc } = await supabase
               .from("places")
               .select("*", { count: "exact", head: true })
               .eq("user_id", uid);
             placesCount = pc || 0;
          }

          return {
            ...list,
            placeCount: (routeCount || 0) + placesCount
          };
        })
      );

      setLists(listsWithCounts);
    } catch (error) {
      console.error("Error fetching lists:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLists();
  }, [visible]);

  const handleCreateNewList = async () => {
    if (!newListName.trim() || !userId) return;
    
    try {
      const { data, error } = await supabase
        .from("saved_lists")
        .insert([{ user_id: userId, name: newListName.trim() }])
        .select();

      if (error) throw error;
      
      setNewListName("");
      setAddingList(false);
      fetchLists();
    } catch (error) {
      Alert.alert("Error", "Could not create list");
    }
  };

  const handleSaveToGroup = async (listId: string) => {
    if (!routeItem || !userId) return;

    try {
      const { error } = await supabase
        .from("saved_routes")
        .insert([{
          user_id: userId,
          list_id: listId,
          origin_name: routeItem.origin_name,
          destination_name: routeItem.destination_name,
          origin_coords: routeItem.origin_coords,
          destination_coords: routeItem.destination_coords,
          route_option: routeItem.route_option,
          avoid_roads: routeItem.avoid_roads,
          avoid_features: routeItem.avoid_features,
          via_road_name: routeItem.via_road_name
        }]);

      if (error) throw error;
      
      Alert.alert("Success", "Route saved to list!");
      onClose();
    } catch (error) {
      Alert.alert("Error", "Could not save route");
    }
  };

  const getIconForList = (name: string) => {
    const lower = name.toLowerCase();
    if (lower.includes("favourite") || lower.includes("favorite")) return "heart-outline";
    if (lower.includes("daily")) return "time-outline";
    if (lower.includes("food") || lower.includes("drink")) return "fast-food-outline";
    if (lower.includes("visit")) return "car-outline";
    return "folder-outline";
  };

  return (
    <Modal visible={visible} transparent={true} animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.modalContainer} onPress={(e) => e.stopPropagation()}>
          
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Save to list</Text>
            <Pressable onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>Done</Text>
            </Pressable>
          </View>

          {/* Add New List Button / Input */}
          {!addingList ? (
            <Pressable style={styles.addListBtn} onPress={() => setAddingList(true)}>
              <Text style={styles.addListBtnText}>+ Add a new list</Text>
            </Pressable>
          ) : (
            <View style={styles.addListInputContainer}>
              <TextInput
                style={styles.input}
                placeholder="List name..."
                value={newListName}
                onChangeText={setNewListName}
                autoFocus
              />
              <Pressable style={styles.saveNewListBtn} onPress={handleCreateNewList}>
                <Text style={styles.saveNewListBtnText}>Create</Text>
              </Pressable>
              <Pressable style={styles.cancelBtn} onPress={() => { setAddingList(false); setNewListName(""); }}>
                <Ionicons name="close" size={24} color={Colors.textMuted} />
              </Pressable>
            </View>
          )}

          {loading ? (
            <ActivityIndicator size="large" color={Colors.primary} style={{ marginTop: 20 }} />
          ) : (
            <ScrollView style={styles.listContainer} showsVerticalScrollIndicator={false}>
              {lists.map((list) => (
                <View key={list.id} style={styles.listCard}>
                  <View style={styles.cardLeft}>
                    <Ionicons name={getIconForList(list.name)} size={28} color={Colors.navy} style={styles.listIcon} />
                    <View>
                      <Text style={styles.listName}>{list.name}</Text>
                      <Text style={styles.listCount}>{list.placeCount} {list.placeCount === 1 ? 'Place' : 'Places'}</Text>
                    </View>
                  </View>
                  <Pressable style={styles.addButton} onPress={() => handleSaveToGroup(list.id)}>
                    <Text style={styles.addButtonText}>Add</Text>
                  </Pressable>
                </View>
              ))}
              <View style={{ height: 20 }} />
            </ScrollView>
          )}

        </Pressable>
      </Pressable>
    </Modal>
  );
};

export default SaveToListModal;

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  modalContainer: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: "80%",
    minHeight: "50%",
  },
  header: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
    position: 'relative'
  },
  title: {
    fontFamily: "Karla",
    fontSize: 22,
    fontWeight: "bold",
    color: "#000",
  },
  closeBtn: {
    position: 'absolute',
    right: 0,
  },
  closeBtnText: {
    fontFamily: "Karla",
    fontSize: 16,
    fontWeight: "bold",
    color: Colors.navy,
  },
  addListBtn: {
    backgroundColor: "#7986CB", // Matches the purple/blue from the image
    borderRadius: 25,
    paddingVertical: 12,
    alignItems: "center",
    marginBottom: 20,
  },
  addListBtnText: {
    color: "#fff",
    fontFamily: "Karla",
    fontSize: 16,
    fontWeight: "bold",
  },
  addListInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: "Karla",
    fontSize: 16,
  },
  saveNewListBtn: {
    backgroundColor: "#7986CB",
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginLeft: 10,
  },
  saveNewListBtnText: {
    color: "#fff",
    fontFamily: "Karla",
    fontWeight: "bold",
  },
  cancelBtn: {
    marginLeft: 10,
    padding: 5,
  },
  listContainer: {
    flex: 1,
  },
  listCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "#E0E0E0",
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
  },
  cardLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  listIcon: {
    marginRight: 16,
  },
  listName: {
    fontFamily: "Karla",
    fontSize: 16,
    color: "#000",
    marginBottom: 4,
  },
  listCount: {
    fontFamily: "Karla",
    fontSize: 14,
    color: "#666",
  },
  addButton: {
    backgroundColor: "#7986CB",
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 16,
  },
  addButtonText: {
    color: "#fff",
    fontFamily: "Karla",
    fontSize: 14,
    fontWeight: "bold",
  }
});
