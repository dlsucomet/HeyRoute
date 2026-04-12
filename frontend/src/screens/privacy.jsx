/**
 * This screen displays the data privacy policy for the "HeyRoute" app.
 */

import { useNavigation } from "@react-navigation/native";
import { View, Text, StyleSheet, Pressable, ScrollView, Linking, TouchableOpacity } from "react-native";
import Ionicons from 'react-native-vector-icons/Ionicons';

const PrivacyPolicyScreen = () => {
    const navigation = useNavigation();

    // Contact information for the research team and adviser
    const contacts = [
        { id: 1, label: 'Jasmine Gayamo', email: 'jasmine_gayamo@dlsu.edu.ph' },
        { id: 2, label: 'Francine Marie Hallar', email: 'francine_hallar@dlsu.edu.ph' },
        { id: 3, label: 'Atasha Dominique Pidlaoan', email: 'atasha_pidlaoan@dlsu.edu.ph' },
        { id: 4, label: 'Alejandro Gabriel Santos', email: 'alejandro_santos@dlsu.edu.ph' },
        { id: 5, label: 'Dr. Briane Paul Samson', email: 'briane.samson@dlsu.edu.ph' }
    ];

    return (
        <View style={styles.container}>
            {/* Back button */}
            <Pressable style={styles.backButton} onPress={() => navigation.goBack()}>
                <Ionicons name="arrow-back-outline" color="#000" size={24} />
            </Pressable>

            <ScrollView 
                contentContainerStyle={styles.scrollContent}
                style={styles.scrollView}
                showsVerticalScrollIndicator={false}
            >
                <Text style={styles.title}>Data Privacy Policy</Text>
                <Text style={styles.lastUpdated}>Last Updated: March 2026</Text>

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>1. Data Collection</Text>
                    <Text style={styles.text}>
                        For this research study, we collect your name, and email address. We also collect usage logs, and bug reports provided within the app.
                    </Text>
                </View>

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>2. Use of Data</Text>
                    <Text style={styles.text}>
                        The data collected is used strictly for the thesis project titled A Multi-Modal, Voice-Driven Navigation Assistance for Smarter Driving. It will be used to analyze how users interact with the voice assistant.
                    </Text>
                </View>

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>3. Confidentiality & Anonymity</Text>
                    <Text style={styles.text}>
                        Your data will be anonymized. Personal identifiers will be removed during the data analysis phase to ensure your privacy.
                    </Text>
                </View>

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>4. Data Storage</Text>
                    <Text style={styles.text}>
                        All data is stored securely in a secured database and Google Drive. Only the researchers will have access to the raw data.
                    </Text>
                </View>

                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>5. Data Retention</Text>
                    <Text style={styles.text}>
                        Data will be retained until the completion of the thesis defense, then all personal data will be deleted by the researchers. 
                    </Text>
                </View>

                 <View style={styles.contactSection}>
                    <Text style={styles.sectionTitle}>6. Contact Information</Text>
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

                <View style={{ height: 40 }} />
            </ScrollView>
        </View>
    );
};

export default PrivacyPolicyScreen;

const styles = StyleSheet.create({
    container: {
        flex: 1,    
        backgroundColor: "#fff",
        paddingTop: 50, 
    }, 
    scrollView: {
        flex: 1,
        width: "100%",
    },
    backButton: {
        paddingHorizontal: 20,
        marginBottom: 10,
    },
    scrollContent: {
        paddingHorizontal: 20,
    },
    title: {
        fontFamily: "Karla",
        fontSize: 28,
        fontWeight: "bold",
        color: "#1a1a1a",
        marginBottom: 5,   
    },
    lastUpdated: {
        fontFamily: "Karla",
        fontSize: 12,
        color: "#666",
        marginBottom: 25,
    },
    section: {
        marginBottom: 20,
    },
    sectionTitle: {
        fontFamily: "Karla",
        fontSize: 16,
        fontWeight: "700",
        color: "#333",
        marginBottom: 8,
    },
    text: {
        fontFamily: "Karla",
        fontSize: 14,
        lineHeight: 22,
        color: "#444",
        textAlign: "justify"
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