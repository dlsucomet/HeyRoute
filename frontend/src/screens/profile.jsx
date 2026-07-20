/**
 * This screen displays the user's profile information and provides access to general settings and logout functionality.
 * 
 * Handles:
 * - Fetching authenticated user data and associated profile details from Supabase.
 * - Routing to legal documents (Terms, Privacy) and support (Bug reporting).
 * - Managing the session logout process.
 */

import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, Switch, Alert } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "react-native-vector-icons/Ionicons";

import supabase from "../supabase-client"; 
import NavBar from "../components/navbar";
import { Colors } from '../theme/colors';

const ProfileScreen = () => {
  const navigation = useNavigation();
  const [fullName, setFullName] = useState("");
  const [userId, setUserId] = useState(null);

  /**
   * Logs the user out of the current Supabase session.
   */
  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();

    if (error) {
      console.error("Logout error:", error.message);
      Alert.alert("Error", "Failed to log out. Try again.");
      return;
    }
    console.log("Logout successful."); // for checking
  }

  /**
   * Get the ID from Auth, then query the 'profiles' table for the display name.
   */
  useEffect(() => {
    const fetchProfile = async () => {
      try {
        // get currently logged in user 
        const { data: authUser } = await supabase.auth.getUser();

        if (authUser?.user) {
          setUserId(authUser.user.id); // save the ID for the NavBar

          // Query the custom profiles table for the 'full_name'
          const { data: profile, error } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("user_id", authUser.user.id)
          .single();

        if (error) throw error;

        setFullName(profile.full_name);
        }
      } catch (err) {
        console.error("Failed to fetch user profile:", err.message);
        Alert.alert("Error", "Unable to load user profile.");
      }
    };

    fetchProfile();
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={{ paddingBottom: 100 }}>
        <NavBar
          userId={userId}
        />

        {/* Header Name */}
        <Text style={styles.title}>Profile</Text>

        {/* User Profile */}
        <View style={styles.header}>
          <Ionicons name="person-circle-sharp" size={60} color="#373737" style={styles.avatar} />
          <View>
            <Text style={styles.hello}>Hello,</Text>
            <Text style={styles.name}>{fullName || "User"}</Text>
          </View>
        </View>

        {/* General Settings */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>GENERAL</Text>
           <Pressable 
            style={({ pressed }) => [
              styles.option,
              pressed && styles.pressedOption
            ]} 
            onPress={() => navigation.navigate("Terms")}
          >
            <Text style={styles.optionText}> Terms and Conditions </Text>
            <Ionicons name="chevron-forward-outline" size={20} color="#000" />
          </Pressable>

          <Pressable 
            style={({ pressed }) => [
              styles.option,
              pressed && styles.pressedOption
            ]} 
            onPress={() => navigation.navigate("PrivacyPolicy")}
          >
            <Text style={styles.optionText}> Data Privacy Policy </Text>
            <Ionicons name="chevron-forward-outline" size={20} color="#000" />
          </Pressable>

          <Pressable 
            style={({ pressed }) => [
              styles.option,
              pressed && styles.pressedOption // Applies this style only when touched
            ]} 
            onPress={() => navigation.navigate("ReportBug")}
          >
            <Text style={styles.optionText}> Report a Bug </Text>
            <Ionicons name="chevron-forward-outline" size={20} color="#000" />
          </Pressable>
        </View>

        {/* Log Out */}
        <View style={styles.card}>
          <Pressable
            style={({ pressed }) => [
                styles.option,
                pressed && { opacity: 0.6 }
            ]}
            onPress={handleLogout}
          >
            <Ionicons name="exit-outline" size={22} color="#d11a2a" />
            <Text style={styles.logoutText}>Log Out</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

export default ProfileScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.cream,
    paddingHorizontal: 20,
  },
  title: {
    fontSize: 22,
    color: Colors.navy,
    textAlign: "center",
    marginTop: 22,
    marginBottom: 30,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
  },
  avatar: {
    marginLeft: 10,
    marginRight: 10,
  },
  hello: {
    fontFamily: "Karla",
    fontSize: 20,
    fontWeight: "700",
    color: Colors.navy,
  },
  name: {
    fontFamily: "Karla",
    fontSize: 18,
    fontWeight: "500",
    color: "#000",
  },
  card: {
    borderWidth: 1,
    borderColor: "#a3a3a3",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginTop: 15,
  },
  cardTitle: {
    fontFamily: "Karla",
    fontSize: 14,
    color: "#1d1d3d",
    marginBottom: 8,
  },
  pressedOption: {
    backgroundColor: '#f2f2f7', 
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.sand,
    borderRadius: 8,
    marginBottom: 12,
    backgroundColor: Colors.cardBg,
  },
  optionText: {
    fontFamily: "Karla",
    flex: 1,
    marginLeft: 12,
    fontSize: 14,
    color: "#000",
  },
  logoutText: {
    fontFamily: "Karla",
    flex: 1,
    marginLeft: 10,
    fontSize: 14,
    color: "#d11a2a",
  }
});