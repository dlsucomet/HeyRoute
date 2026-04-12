/**
 * This screen displays the terms and conditions for using the HeyRoute application.
 */

import { useNavigation } from "@react-navigation/native";
import { View, Text, StyleSheet, Pressable, ScrollView, Linking, TouchableOpacity } from "react-native";
import Ionicons from 'react-native-vector-icons/Ionicons';

const TermsScreen = () => {
    const navigation = useNavigation();

    const contacts = [
        { id: 1, label: 'Jasmine Gayamo', email: 'jasmine_gayamo@dlsu.edu.ph' },
        { id: 2, label: 'Francine Marie Hallar', email: 'francine_hallar@dlsu.edu.ph' },
        { id: 3, label: 'Atasha Dominique Pidlaoan', email: 'atasha_pidlaoan@dlsu.edu.ph' },
        { id: 4, label: 'Alejandro Gabriel Santos', email: 'alejandro_santos@dlsu.edu.ph' },
        { id: 5, label: 'Dr. Briane Paul Samson', email: 'briane.samson@dlsu.edu.ph' }
    ];

    return (
        <View style={styles.container}>
            {/* Header with Back Button */}
            <View style={styles.header}>
                <Pressable style={styles.backButton} onPress={() => navigation.goBack()}>
                    <Ionicons name="arrow-back-outline" color="#000" size={24} />
                </Pressable>
                <Text style={styles.title}>Terms and Conditions</Text>
            </View>

            <ScrollView 
                contentContainerStyle={styles.scrollContent}
                style={styles.scrollView}
                showsVerticalScrollIndicator={false}
            >
                <Text style={styles.mainText}>
                    Welcome to <Text style={{fontWeight: 'bold'}}>HeyRoute</Text>! These Terms and Conditions explain your participation in this research study and the use of the application developed by undergraduate students from De La Salle University - Manila, under the supervision of Dr. Briane Paul V. Samson.
                </Text>

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>1. Purpose of the Study</Text>
                    <Text style={styles.subtext}>
                        The purpose of this study is to evaluate the effectiveness and usability of HeyRoute, a multi-modal voice navigation assistance application designed to provide real-time navigation guidance through voice commands and visual cues.
                    </Text>
                </View>

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>2. Acceptance of Terms</Text>
                    <Text style={styles.subtext}>
                        By using the application, you hereby agree to the terms and conditions and data privacy policy. If you do not wish to continue using the app, please discontinue use.
                    </Text>
                </View>

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>3. Eligibility</Text>
                    <Text style={styles.subtext}>
                        To be eligible, you must be at least 18 years old, hold a driver's license, have experience using navigation apps, and have access to a smartphone with internet. You must also provide signed informed consent.
                    </Text>
                </View>

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>4. Proper Use</Text>
                    <Text style={styles.subtext}>
                        This application is for research purposes only. The voice assistant functions solely for routing scenarios and will not entertain non-routing recommendations.
                    </Text>
                </View>

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>5. Data Logging and Confidentiality</Text>
                    <Text style={styles.subtext}>
                       The application records location data and timestamps. Data collected will be protected, anonymized, and used solely for ethical study analysis. Personally identifiable or unrelated information will not be stored.
                    </Text>
                </View>

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>6. Cost</Text>
                    <Text style={styles.subtext}>
                        There are no costs for participating. Data collection is focused on your daily commutes for research purposes.
                    </Text>
                </View>

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>7. Liability</Text>
                    <Text style={styles.subtext}>
                        Researchers will not be held liable for damages arising from use. It is your responsibility to follow traffic laws. Reporting bugs is encouraged but not mandatory.
                    </Text>
                </View>

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>8. Withdrawal and Termination</Text>
                    <Text style={styles.subtext}>
                        Participants may withdraw at any time. However, once data analysis has begun, data may be retained to preserve research integrity. Researchers reserve the right to revoke access for misconduct.
                    </Text>
                </View>

                <View style={styles.contactSection}>
                    <Text style={styles.sectionTitle}>9. Contact Information</Text>
                    <Text style={styles.subtext}>
                        If you have any questions, please contact the research team or our adviser:
                    </Text>

                    {contacts.map((item) => (
                        <View key={item.id} style={styles.contactCard}>
                            <Text style={styles.label}>{item.label}</Text>
                            <TouchableOpacity onPress={() => Linking.openURL(`mailto:${item.email}`)}>
                                <Text style={styles.emailText}>{item.email}</Text>
                            </TouchableOpacity>
                        </View>
                    ))}
                </View>

                <View style={{ height: 60 }} />
            </ScrollView>
        </View>
    );
};

export default TermsScreen;

const styles = StyleSheet.create({
    container: {
        flex: 1,    
        backgroundColor: "#fff",
    }, 
    header: {
        paddingTop: 50,
        paddingBottom: 20,
        paddingHorizontal: 20,
        backgroundColor: '#fff',
    },
    backButton: {
        marginBottom: 15,
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        paddingHorizontal: 20,
    },
    title: {
        fontFamily: "Karla",
        fontSize: 26,
        fontWeight: "bold",
        color: "#1a1a1a",
    },
    mainText: {
        fontFamily: "Karla",
        fontSize: 15,
        lineHeight: 22,
        marginBottom: 25,
        color: '#444',
        textAlign: "justify",
    },
    section: {
        marginBottom: 22,
    },
    sectionTitle: {
        fontFamily: "Karla",
        fontSize: 17,
        fontWeight: "bold",
        color: "#000",
        marginBottom: 6,
    },
    subtext: {
        fontFamily: "Karla",
        fontSize: 14,
        lineHeight: 20,
        color: "#555",
        textAlign: "justify",
    },
    contactSection: {
        marginTop: 10,
        paddingTop: 20,
        borderTopWidth: 1,
        borderTopColor: '#eee',
    },
    contactCard: {
        marginTop: 10,
        marginBottom: 12,
    },
    label: {
        fontFamily: "Karla",
        fontSize: 14,   
        fontWeight: '600',
        color: '#333',
    },
    emailText: {
        fontFamily: "Karla",
        fontSize: 14,   
        color: "#007AFF",
        textDecorationLine: 'underline',
    },
});