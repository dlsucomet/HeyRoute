/**
 * This module defines the DirectionsCard component,
 * which provides a UI for users to input their starting point, destination, and trip preferences.
 * 
 * Handles: 
 * - Text input management for start, destination, and preferences
 * - Displaying location suggestions based on user input
 * - Allowing users to save locations to their profile
 * - Swapping start and destination inputs
 */

import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, TextInput, Pressable, useWindowDimensions, Image, Keyboard, FlatList, Alert } from "react-native";
import FontAwesome from 'react-native-vector-icons/FontAwesome';
import { GOOGLE_MAPS_API_KEY } from "@env";

import { useManualInput } from "../hooks/useManualInput";
import { DirectionsCardProps } from "../types/navigation";
import SaveLocationModal from "./save-location-modal";
import { Colors } from "../theme/colors";

// Icons / images 
import StartingDot from "../assets/images/starting-dot.png";
import DestinationIcon from "../assets/images/destination-icon.png";
import ThreeDots from "../assets/images/dots.png";
import SwapIcon from "../assets/images/swap-destination.png";

const GOOGLE_API_KEY = GOOGLE_MAPS_API_KEY;

/**
 * DirectionsCard component for entering start & destination with location recommendations
 */
const DirectionsCard = ({ userId, onSetStart, onSetDestination, onSetPreference, initialDestination, initialStart, onClose, autoTrigger, fromHistory }: DirectionsCardProps) => {
  const { states, actions, setters, refs } = useManualInput({
    userId,
    onSetStart,
    onSetDestination,
    onSetPreference,
    initialDestination,
    initialStart,
    onClose,
    autoTrigger,
    fromHistory
  });

  const { start, destination, preference, suggestions } = states;
  const { handleSelect, handleSwap, startManualInputNav } = actions;
  const { setStart, setDestination, setPreference, setActiveField } = setters;
  const { destInputRef } = refs;

  const { width } = useWindowDimensions();

  const [isModalVisible, setIsModalVisible] = useState(false);
  const [selectedSuggestion, setSelectedSuggestion] = useState(null);
  
  // State to store user's saved locations
  const [savedLocations, setSavedLocations] = useState<any[]>([]);

  // Fetch user's saved locations when the component mounts
  useEffect(() => {
    const fetchSavedLocations = async () => {
      if (!userId) return;
      try {
        const { data, error } = await supabase
          .from('places')
          .select('location') // Only need the location string to compare
          .eq('user_id', userId);

        if (error) throw error;
        setSavedLocations(data || []);
      } catch (err) {
        console.error("Error fetching saved locations for bookmark status:", err);
      }
    };

    fetchSavedLocations();
  }, [userId]);

  /**
   * Helper function to check if a suggestion is already saved.
   */
  const isLocationSaved = (description: string) => {
    return savedLocations.some(saved => saved.location === description);
  };

  // Handlers for input submission to move focus or trigger navigation
  const handleStartSubmit = () => {
    if (destination.length === 0) {
      destInputRef.current?.focus(); // Auto-focus next field if empty
    } else {
      startManualInputNav();
    }
  };

  const handleDestSubmit = () => {
    startManualInputNav();
  };

  const handlePreferenceSubmit = () => {
    startManualInputNav();
  };

  // To handle un-saving directly from the database
  const handleBookmark = async (suggestionItem: any) => {
    const locationDescription = suggestionItem.description;

    if (isLocationSaved(locationDescription)) {
      Alert.alert(
        "Remove Bookmark",
        "Are you sure you want to remove this from your saved locations?",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Remove",
            style: "destructive",
            onPress: async () => {
              try {
                const { error } = await supabase
                  .from('places')
                  .delete()
                  .match({ user_id: userId, location: locationDescription });

                if (error) throw error;

                // Update local state to immediately turn the icon back to outline
                setSavedLocations(prev => prev.filter(item => item.location !== locationDescription));
              } catch (err) {
                console.error("Error removing location:", err);
                Alert.alert("Error", "Could not remove the location.");
              }
            }
          }
        ]
      );
      return;
    }

    // If not saved, open the modal to save it
    setSelectedSuggestion(suggestionItem);
    setIsModalVisible(true);              
  };

  /**
   * Takes the data from the modal, fetches coordinates from Google Details API, and saves the final object to the 'places' table.
   */
  const handleSaveLocation = async (savedData: any) => {
    const { category, originalSuggestion } = savedData;
    const placeId = originalSuggestion?.place_id;

    if (!userId) {
      Alert.alert("Error", "User not authenticated.");
      return;
    }

    if (!placeId) {
      Alert.alert("Error", "Could not find the place ID for this location.");
      setIsModalVisible(false);
      return;
    }

    try {
      // Makes a Details API call to get the geometry for the selected place
      const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=geometry&key=${GOOGLE_API_KEY}`;
      
      const response = await fetch(detailsUrl);
      const data = await response.json();

      if (data.result && data.result.geometry) {
        const { lat, lng } = data.result.geometry.location;
        
        const { error: supabaseError } = await supabase.from('places').insert([
          { 
            user_id: userId, 
            label: category,
            location: originalSuggestion.description, 
            latitude: lat,
            longitude: lng
          }
        ]);

        if (supabaseError) throw supabaseError;
        
        // Update local state immediately so the icon reflects the change
        setSavedLocations(prev => [...prev, { location: originalSuggestion.description }]);
        Alert.alert("Success", "Location saved!");
      }
    } catch (err) {
      console.error("Error saving location:", err);
      Alert.alert("Save Failed", "There was an issue saving your location.");
    } finally {
      setIsModalVisible(false); 
    }
  };

  return (
    <View style={[styles.card, { width: width * 0.9 }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Directions</Text>
        <Pressable onPress={onClose} style={styles.closeButton}>
          <FontAwesome name="times" size={20} color="#666" />
        </Pressable>
      </View>

      <View style={styles.row}>
        <View style={styles.iconColumn}>
          <Image source={StartingDot} style={styles.startingIcon} />
          <Image source={ThreeDots} style={styles.dotsIcon} />
          <Image source={DestinationIcon} style={styles.destinationIcon} />
          <FontAwesome name="star" color="#443068" size={18} style={styles.preferredIcon} />
        </View>

        <View style={styles.inputColumn}>
          <View style={styles.inputWrapper}>
            <TextInput
              placeholder="Enter your starting point"
              value={start}
              onChangeText={(text) => {
                setStart(text);
                onSetStart(text);
              }}
              onFocus={() => setActiveField("start")}
              style={styles.input}
              returnKeyType="next"
              onSubmitEditing={handleStartSubmit} 
            />

            {start.length > 0 && (
              <Pressable 
                onPress={() => {
                  setStart("");
                  onSetStart("");
                  setActiveField(null);
                }} 
                style={styles.clearButton}
              >
                <FontAwesome name="times-circle" size={16} color="#a0a0a0" />
              </Pressable>
            )}
          </View>

          <View style={styles.inputWrapper}>
            <TextInput
              ref={destInputRef}
              placeholder="Enter your destination"
              value={destination}
              onChangeText={(text) => {
                setDestination(text);
                onSetDestination(text);
              }}
              onFocus={() => setActiveField("destination")}
              style={styles.input}
              returnKeyType="go"
              onSubmitEditing={handleDestSubmit}
            />

            {destination.length > 0 && (
              <Pressable 
                onPress={() => {
                  setDestination("");
                  onSetDestination("");
                  setActiveField(null);
                }} 
                style={styles.clearButton}
              >
                <FontAwesome name="times-circle" size={16} color="#a0a0a0" />
              </Pressable>
            )}
          </View>

          <View style={styles.preferenceInputWrapper}>
            <TextInput
              placeholder="Enter your trip preference"
              value={preference}
              onChangeText={(text) => {
                setPreference(text);
                onSetPreference(text);
              }}
              onFocus={() => setActiveField("preference")}
              onBlur={() => {
                setActiveField(null);
              }}
              style={[styles.input, { flex: 1 }]}
              returnKeyType="search" 
              onSubmitEditing={handlePreferenceSubmit}
            />
            
            {preference.length > 0 && (
              <Pressable 
                onPress={() => {
                  setPreference("");
                  onSetPreference("");
                  setActiveField(null);
                }} 
                style={styles.clearButton}
              >
                <FontAwesome name="times-circle" size={16} color="#a0a0a0" />
              </Pressable>
            )}
          </View>
        </View>

        <Pressable onPress={handleSwap} style={styles.swapButton}>
          <Image source={SwapIcon} style={styles.swapIcon}/>
        </Pressable>
      </View>
      
      {suggestions.length > 0 && (
        <FlatList
          data={suggestions}
          keyExtractor={(item, index) =>
            item === "CURRENT_LOCATION"
              ? "current"
              : item.place_id || index.toString()
          }
          style={styles.dropdown}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => {
            const isSaved = item !== "CURRENT_LOCATION" && isLocationSaved(item.description);

            return (
                <View style={styles.suggestionRow}>
                  <Pressable 
                    style={styles.suggestionTextContainer} 
                    onPress={() => handleSelect(item)}
                  >
                    <Text style={styles.suggestionText}>
                      {item === "CURRENT_LOCATION" ? (
                        <Text style={styles.suggestionText}>Current Location</Text>
                      ) : (
                        <View>
                          <Text style={styles.primaryText}>
                            {item.structured_formatting?.main_text || item.description}
                          </Text>
                          {item.structured_formatting?.secondary_text && (
                            <Text style={styles.secondaryText}>
                              {item.structured_formatting.secondary_text}
                            </Text>
                          )}
                        </View>
                      )}
                    </Text>
                  </Pressable>

                  {item !== "CURRENT_LOCATION" && (
                    <Pressable 
                      style={styles.bookmarkButton} 
                      onPress={() => handleBookmark(item)}
                    >
                      <FontAwesome 
                          name={isSaved ? "bookmark" : "bookmark-o"} 
                          color="#000" 
                          size={20} 
                      />
                    </Pressable>
                  )}
                </View>
            )
          }}
        />
      )}

      <SaveLocationModal
        visible={isModalVisible}
        suggestionItem={selectedSuggestion}
        onClose={() => setIsModalVisible(false)}
        onSave={handleSaveLocation}
      />
    </View>
  );
};

export default DirectionsCard;

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.cardBg,
    borderRadius: 16,
    padding: 20,
    alignSelf: "center",
    elevation: 4,
  },
  header: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
    position: "relative",
  },
  title: {
    fontFamily: "Karla",
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
  },
  closeButton: {
    position: "absolute",
    right: 0,
    padding: 4,
  },
  row: {
    flexDirection: "row",
  },
  iconColumn: {
    alignItems: "center",
    paddingRight: 10,
    paddingTop: 15,
  },
  startingIcon: {
    width: 10,
    height: 10,
  },
  dotsIcon: {
    marginTop: 8,
  },
  destinationIcon: {
    marginTop: 6,
    width: 16,
    height: 16,
  },
  preferredIcon: {
    marginTop: 32,
  },
  inputColumn: {
    flex: 1,
    gap: 10,
  },
  inputWrapper: {
    backgroundColor: Colors.creamLight,
    borderRadius: 8,
    paddingHorizontal: 10,
    flexDirection: "row", 
    alignItems: "center",
    justifyContent: "space-between", 
  },
  input: {
    flex: 1,
    fontFamily: "Karla",
    paddingVertical: 10,
    fontSize: 14,
    color: Colors.textOnLight,
  },
  preferenceInputWrapper: {
    backgroundColor: Colors.creamLight,
    borderRadius: 8,
    paddingHorizontal: 10,
    flexDirection: "row", 
    alignItems: "center",
    justifyContent: "space-between", 
  },
  clearButton: {
    padding: 8,
  },
  swapButton: {
    paddingLeft: 10,
    paddingTop: 30,
  },
  swapIcon: {
    width: 22,
    height: 26,
  },
  dropdown: {
    marginTop: 10,
    backgroundColor: Colors.cardBg,
    borderRadius: 8,
    elevation: 4,
  },
  suggestionRow: {
    flexDirection: 'row',       
    alignItems: 'center',        
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderColor: Colors.separator,
  },
  suggestionTextContainer: {
    flex: 1,                    
    paddingTop: 2,
    paddingBottom: 2,
    paddingRight: 10,
    paddingLeft: 10,          
  },
  suggestionText: {
    fontFamily: "Karla",
    fontSize: 14,
    color: Colors.textOnLight,
    textAlign: "justify",
  },
  bookmarkButton: {
    paddingLeft: 8,
    paddingRight: 8,    
  },
  primaryText: {
  fontFamily: "Karla",
  fontSize: 15,
  fontWeight: "700",
  color: Colors.textOnLight,
},
secondaryText: {
  fontFamily: "Karla",
  fontSize: 13,
  color: Colors.textMuted,
  marginTop: 2,
},
});