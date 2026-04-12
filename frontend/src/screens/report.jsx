/**
 * This screen provides a user interface for reporting bugs encountered in the app.
 * 
 * Handles: 
 * - Selecting bug categories via chips
 * - Providing a text description of the issue
 * - Submitting the report to the backend (Supabase)
 */

import { useNavigation } from "@react-navigation/native";
import { useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, KeyboardAvoidingView, Platform, TextInput, ActivityIndicator, Alert } from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";

import supabase from "../supabase-client"; 

const ReportBugScreen = () => {
  const navigation = useNavigation();
  const [selectedChips, setSelectedChips] = useState([]);
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);

  // Derived state for form validation: requires at least one category and a description
  const isFormValid = selectedChips.length > 0 && description.trim().length > 0;

  // List of bug categories
  const chips = [
    "Navigation issue",
    "Map error",
    "Voice command",
    "App crash",
    "Other",
  ];

  /**
   * Toggles the selection state of a category.
   * Allows for multiple categories to be selected at once.
   */
  const toggleChip = (chip) => {
    if (selectedChips.includes(chip)) {
      setSelectedChips(selectedChips.filter((c) => c !== chip));
    } else {
      setSelectedChips([...selectedChips, chip]);
    }
  };

  /**
   * Reusable UI component for the category selector.
   */
  const Chip = ({ label, selected, onPress }) => {
    return (
      <Pressable
        onPress={onPress}
        style={[styles.chip, selected && styles.chipSelected]}
      >
        <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
          {label}
        </Text>
      </Pressable>
    );
  };

  /**
   * Submits the bug report to the backend (Supabase).
   */
  const submitBug = async () => {
    try {
      setLoading(true);

      const { data, error } = await supabase
      .from("bug_reports")
      .insert([
        {
          created_at: new Date(),
          categories: selectedChips,
          description: description,
        },
      ]);

      if (error) throw error;

      console.log("Bug submitted:", data);
      Alert.alert("Bug submitted successfully!");
      setSelectedChips([]);
      setDescription("");
    } catch (err) {
      console.error("Error submitting bug:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
        {/* Back button */}
        <Pressable
            style={styles.backButton}
            onPress={() => navigation.goBack()}
            >
            <Ionicons name="arrow-back-outline" color="#000" size={24} />
        </Pressable>

         <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
            <ScrollView
            contentContainerStyle={styles.scrollContainer}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            >
            <View style={styles.section}>
                <Text style={styles.title}>Report a Bug</Text>
                </View>

                <View style={styles.section}>
                    <Text style={styles.text}>Encountered an issue? Please let us know. We are here to help you! </Text>
                </View>

                <View style={styles.chipContainer}>
                  <View style={styles.section}>
                    <Text style={styles.chipMainText}> What kind of issue did you encounter?
                      <Text style={styles.required}> * </Text>
                    </Text>
                  </View>
                  {chips.map((chip) => (
                      <Chip
                      key={chip}
                      label={chip}
                      selected={selectedChips.includes(chip)}
                      onPress={() => toggleChip(chip)}
                      />
                  ))}
                </View>

                {/* Description */}
                <Text style={styles.descriptionLabel}>Description 
                  <Text style={styles.required}> * </Text>
                </Text>
                <TextInput
                  style={styles.input}
                  placeholder="Describe the issue..."
                  placeholderTextColor="#b5b5b5"
                  multiline
                  value={description}
                  onChangeText={setDescription}
                />

                {/* Submit */}
                <Pressable
                  style={[styles.button, !isFormValid && styles.buttonDisabled]}
                  onPress={submitBug}
                  disabled={!isFormValid || loading}
                >
                  {loading ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.buttonText}>Submit Bug</Text>
                  )}
                </Pressable>
            </ScrollView>
        </KeyboardAvoidingView>
    </View>
  );
};

export default ReportBugScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    paddingTop: 50,
  },
  scrollContainer: {
    paddingBottom: 40,
  },
  backButton: {
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  section: {
    marginBottom: 20,
  },
  title: {
    fontFamily: "Karla",
    fontSize: 30,
    fontWeight: "bold",
    marginLeft: 30,
  },
  text:{ 
    fontFamily: "Karla",
    fontSize: 16,
    marginLeft: 30,
    marginRight: 30, 
    textAlign: "justify",
    color: "#878484",
  },
  chipMainText: {
    fontFamily: "Karla",
    fontSize: 14,
    color: "#878484",
    marginLeft: 12,
  },
  chipContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 14,
  },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 30,
    backgroundColor: "#F2F4F7",
    margin: 6,
  },
  chipSelected: {
    backgroundColor: "#583786",
  },
  chipText: {
    fontFamily: "Karla",
    fontSize: 14,
    color: "#878484",
  },
  chipTextSelected: {
    fontFamily: "Karla",
    color: "#fff",
    fontWeight: "600",
  },
  descriptionLabel: {
    fontFamily: "Karla",
    fontSize: 14,
    fontWeight: "600",
    marginTop: 20,
    marginRight: 30,
    marginLeft: 30,
    color: "#878484"
  },
  input: {
    fontFamily: "Karla",
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    padding: 12,
    marginTop: 8,
    marginLeft: 30,
    marginRight: 30,
    minHeight: 100,
    textAlignVertical: "top",
  },
  button: {
    backgroundColor: "#63448e",
    padding: 16,
    borderRadius: 30,
    marginTop: 30,
    marginRight: 30,
    marginLeft: 30,
    alignItems: "center",
  },
  buttonText: {
    fontFamily: "Karla",
    color: "#fff",
    fontWeight: "bold",
  },
  buttonDisabled: {
    backgroundColor: "#C5BBD6",
  },
  errorText: {
    color: "#D11A2A",
    fontSize: 13,
    marginLeft: 30,
    marginTop: 5,
  },
  required: {
    color: "#D11A2A",
    fontSize: 16,
  }
});