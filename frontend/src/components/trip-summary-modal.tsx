import React, { useState } from "react";
import { View, Text, StyleSheet, Modal, Pressable } from "react-native";
import MaterialIcons from "react-native-vector-icons/MaterialIcons";
import { Colors } from "../theme/colors";

interface TripSummaryModalProps {
  visible: boolean;
  onClose: () => void;
  destination: string;
  distance?: string;
  duration?: string;
  routeVia?: string;
  onSubmitRating?: (rating: number) => void;
}

const TripSummaryModal: React.FC<TripSummaryModalProps> = ({
  visible,
  onClose,
  destination,
  distance,
  duration,
  routeVia,
  onSubmitRating,
}) => {
  const [rating, setRating] = useState<number>(0);
  const [submitted, setSubmitted] = useState<boolean>(false);

  const handleRating = (stars: number) => {
    setRating(stars);
    setSubmitted(true);
    if (onSubmitRating) {
      onSubmitRating(stars);
    }
    // Auto-close after 2 seconds
    setTimeout(() => {
      onClose();
    }, 2000);
  };

  const renderStars = () => {
    return (
      <View style={styles.starsContainer}>
        {[1, 2, 3, 4, 5].map((star) => (
          <Pressable key={star} onPress={() => handleRating(star)} style={styles.starButton}>
            <MaterialIcons
              name={star <= rating ? "star" : "star-border"}
              size={36}
              color={star <= rating ? Colors.warning : Colors.textMuted}
            />
          </Pressable>
        ))}
      </View>
    );
  };

  return (
    <Modal visible={visible} transparent={true} animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.modalContainer} onPress={(e) => e.stopPropagation()}>
          {/* Header Icon */}
          <View style={styles.iconContainer}>
            <MaterialIcons name="check-circle" size={56} color={Colors.success} />
          </View>
          
          <Text style={styles.title}>You have arrived!</Text>
          <Text style={styles.destinationText}>{destination}</Text>

          {/* Stats Row */}
          <View style={styles.statsContainer}>
            {distance && (
              <View style={styles.statBox}>
                <MaterialIcons name="route" size={24} color={Colors.primary} />
                <Text style={styles.statValue}>{distance}</Text>
                <Text style={styles.statLabel}>Distance</Text>
              </View>
            )}
            
            {duration && (
              <View style={styles.statBox}>
                <MaterialIcons name="schedule" size={24} color={Colors.primary} />
                <Text style={styles.statValue}>{duration}</Text>
                <Text style={styles.statLabel}>Duration</Text>
              </View>
            )}
          </View>

          {routeVia && routeVia !== "Main Route" && (
            <Text style={styles.viaText}>Route taken: {routeVia}</Text>
          )}

          {/* Rating Section */}
          <View style={styles.ratingSection}>
            {submitted ? (
              <Text style={styles.ratingThanks}>Thanks for your feedback!</Text>
            ) : (
              <>
                <Text style={styles.ratingPrompt}>How was your route?</Text>
                {renderStars()}
              </>
            )}
          </View>

          {/* Done Button */}
          <Pressable style={styles.doneButton} onPress={onClose}>
            <Text style={styles.doneButtonText}>Done</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end", // Align to bottom like a bottom-sheet
  },
  modalContainer: {
    backgroundColor: Colors.cardBg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 20,
  },
  iconContainer: {
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: Colors.textDark,
    marginBottom: 4,
  },
  destinationText: {
    fontSize: 16,
    color: Colors.textMuted,
    marginBottom: 24,
    textAlign: "center",
  },
  statsContainer: {
    flexDirection: "row",
    justifyContent: "center",
    width: "100%",
    marginBottom: 16,
  },
  statBox: {
    alignItems: "center",
    marginHorizontal: 20,
    backgroundColor: Colors.creamLight,
    padding: 16,
    borderRadius: 16,
    minWidth: 100,
  },
  statValue: {
    fontSize: 18,
    fontWeight: "bold",
    color: Colors.textDark,
    marginTop: 8,
  },
  statLabel: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 4,
  },
  viaText: {
    fontSize: 14,
    color: Colors.textMuted,
    marginBottom: 24,
  },
  ratingSection: {
    alignItems: "center",
    marginBottom: 24,
    minHeight: 80,
    justifyContent: "center",
  },
  ratingPrompt: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.textDark,
    marginBottom: 12,
  },
  ratingThanks: {
    fontSize: 16,
    fontWeight: "bold",
    color: Colors.success,
  },
  starsContainer: {
    flexDirection: "row",
    justifyContent: "center",
  },
  starButton: {
    marginHorizontal: 8,
  },
  doneButton: {
    backgroundColor: Colors.primary,
    paddingVertical: 14,
    paddingHorizontal: 48,
    borderRadius: 30,
    width: "100%",
    alignItems: "center",
  },
  doneButtonText: {
    color: Colors.textOnDark,
    fontSize: 16,
    fontWeight: "bold",
  },
});

export default TripSummaryModal;
