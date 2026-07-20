/**
 * This module defines the NavBar component, which provides a navigation menu for the app. 
 */

import React, { useState } from "react";
import { View, Pressable, Text, StyleSheet, Modal, Platform } from "react-native";
import { useNavigation, useRoute, NavigationProp, RouteProp } from "@react-navigation/native";
import MaterialIcons from "react-native-vector-icons/MaterialIcons";
import Ionicons from 'react-native-vector-icons/Ionicons';
import { Colors } from '../theme/colors';

// Define the screen in navigation stack
type RootStackParamList = {
  Home: undefined;
  Saved: undefined;
  History: undefined;
  Profile: undefined;
  Login: undefined;
};

// Type for the menu items in the navigation menu
type MenuItem = {
  label: string;
  screen: keyof RootStackParamList; 
  icon: string;
};

// Menu items with their corresponding screen and icon
const menuItems: MenuItem[] = [
  { label: "Home", screen: "Home", icon: "map-outline" },
  { label: "Saved", screen: "Saved", icon: "bookmark-outline" },
  { label: "History", screen: "History", icon: "list-outline" },
  { label: "Profile", screen: "Profile", icon: "person-outline" },
];

interface NavBarProps {
  userId: string | null;
}

// Navigation bar component with a menu button that opens a modal with navigation options
const NavBar = ({ userId }: NavBarProps) => {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();   // Navigate to the chosen screen
  const route = useRoute<RouteProp<RootStackParamList>>();    // Current route object
  const [menuVisible, setMenuVisible] = useState(false);   // State to control the visibility of the menu modal

  // Function to handle navigation when a menu item is pressed
  const handleNavigate = (screen : keyof RootStackParamList) => {
    setMenuVisible(false); // Close the menu modal
    navigation.navigate(screen as any); // Pass the userId to the next screen
  };

  return (
    <>
      {/* Menu Button */}
      <View style={styles.menuButtonContainer}>
        <Pressable onPress={() => setMenuVisible(true)}>
          <MaterialIcons name="menu" size={32} color={Colors.navy} />
        </Pressable>
      </View>

      {/* Menu Modal */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={menuVisible}
        onRequestClose={() => setMenuVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setMenuVisible(false)}>
          <View style={styles.menuContainer}>

            {menuItems.map((item) => {
              const isActive = route.name === item.screen; // Checks if the current screen is the active route
              
              return (
                <Pressable
                  key={item.screen}
                  onPress={() => handleNavigate(item.screen)}
                  style={({ pressed }) => [
                    styles.menuItem,
                    pressed && styles.menuItemPressed,
                    isActive && styles.menuItemActive, 
                  ]}
                >
                  <Ionicons 
                    name={item.icon} 
                    size={22} 
                    color={isActive ? Colors.textOnDark : Colors.textOnLight} 
                  />

                  <Text style={[ styles.menuItemText, isActive && styles.activeText ]}>
                    {item.label}
                  </Text>
                  
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Modal>
    </>
  );
};

export default NavBar;

const styles = StyleSheet.create({
  menuButtonContainer: {
    position: "absolute",
    top: Platform.OS === "ios" ? 50 : 20,
    left: 20,
    zIndex: 100,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: Colors.overlay,
    alignItems: "flex-start",
    justifyContent: "flex-start",
  },
  menuContainer: {
    marginTop: Platform.OS === "ios" ? 90 : 50,
    backgroundColor: Colors.cardBg,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    minWidth: 180,
    elevation: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.5,
    left: 10,
  },
  menuTitle: {
    fontFamily: "Karla",
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 8,
    color: Colors.navy,
  },
  menuItem: {
    flexDirection: 'row', 
    alignItems: 'center', 
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 6, 
  },
  menuItemPressed: {
    backgroundColor: Colors.creamLight,
  },
  menuItemText: {
    fontFamily: "Karla",
    fontSize: 16,
    color: Colors.textOnLight,
    marginLeft: 15, 
  },
  menuItemActive: {
    backgroundColor: Colors.navy, 
  },
  activeText: {
    color: Colors.textOnDark, 
    fontWeight: '600',
  }
});