/**
 * This module defines the SaveLocationModal component, 
 * which is a modal dialog used to save a location with a user-defined name and category.
 * 
 * Handles: 
 * - Displaying a modal with input fields for location name and category.
 * - Validating user input and passing the saved data back to the parent component.
 */

import React, { useState, useEffect } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, StyleSheet, Alert } from 'react-native';

interface SaveLocationModalProps {
  visible: boolean;
  suggestionItem: any; // The raw Google Place object selected by the user
  onClose: () => void;
  onSave: (savedData: any) => void;
}

const SaveLocationModal = ({ visible, suggestionItem, onClose, onSave }: SaveLocationModalProps) => {
  const [locationName, setLocationName] = useState('');
  const [category, setCategory] =  useState('');

  /**
   * When the modal opens, populate the locationName with the address description from Google Places as a default starting point.
   */
  useEffect(() => {
    if (visible && suggestionItem) {
      // Set the default name from the suggestion list 
      setLocationName(suggestionItem.description || '');
      setCategory(""); // rest to default
    }
  }, [visible, suggestionItem]);

  /**
   * Validates that the nickname isn't empty before bundling the metadata and sending it to the parent component's save handler.
   */
  const handleSave = () => {
    if (!locationName.trim()) {
      Alert.alert('Error', 'Enter location nickname.');
      return;
    }
    
    // Pass data back to parent
    onSave({ 
      name: locationName, 
      category: category,
      originalSuggestion: suggestionItem
    });
    console.log('Saved:', { locationName, category });
    
    handleCancel();
  };

  /**
   * Resets local state to prevent "leakage" of data the next time the modal is opened.
   */
  const handleCancel = () => {
    // Reset state and close the modal
    setLocationName('');
    setCategory('home');
    onClose();
  };

 return (
    <Modal
      animationType="fade"
      transparent={true}
      visible={visible}
      onRequestClose={handleCancel}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalView}>
          <Text style={styles.modalTitle}>Save Location</Text>

          {/* Text Input */}
          <Text style={styles.label}>Location Name</Text>
          <Text style={styles.input}>{locationName} </Text>

          {/* Dropdown / Picker */}
          <Text style={styles.label}>Category</Text>
            <TextInput
            style={styles.input}
            placeholder="Enter category name"
            value={category}
            onChangeText={setCategory}
            placeholderTextColor="#999"
          />

          {/* Action Buttons */}
          <View style={styles.buttonContainer}>
            <TouchableOpacity 
              style={[styles.button, styles.cancelButton]} 
              onPress={handleCancel}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.button, styles.saveButton]} 
              onPress={handleSave}
            >
              <Text style={styles.buttonText}>Save</Text>
            </TouchableOpacity>
          </View>

        </View>
      </View>
    </Modal>
  );
};

export default SaveLocationModal;

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  modalView: {
    width: '85%',
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  modalTitle: {
    fontFamily: "Karla", 
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
    color: '#333',
  },
  label: {
    fontFamily: "Karla",
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 8,
    color: '#555',
  },
  input: {
    fontFamily: "Karla",
    borderWidth: 1,
    borderColor: '#CCC',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    marginBottom: 20,
    color: '#333',
    backgroundColor: '#FAFAFA'
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    marginHorizontal: 5,
  },
  cancelButton: {
    backgroundColor: '#E5E5EA',
  },
  saveButton: {
    backgroundColor: '#443068', 
  },
  buttonText: {
    fontFamily: "Karla",
    color: 'white',
    fontWeight: '600',
    fontSize: 16,
    textAlign: 'center',
  },
  cancelButtonText: {
    fontFamily: "Karla",
    color: '#333',
    fontWeight: '600',
    fontSize: 16,
    textAlign: 'center',
  }
});