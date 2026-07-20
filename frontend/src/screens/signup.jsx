/**
 * This screen serves as the main entry point for users to sign up for an account in the app.
 * 
 * Handles: 
 * - User registration and profile creation
 */

import React, { useState } from "react";
import { View, Text, StyleSheet, TextInput, Pressable, Image, Alert, KeyboardAvoidingView, ScrollView, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "react-native-vector-icons/Ionicons"; 
import { useNavigation } from "@react-navigation/native";

import supabase from '../supabase-client'; 
import Logo from '../assets/images/logo-icon.png';
import { Colors } from '../theme/colors';

const SignUpScreen = () => {
  const navigation = useNavigation();
  
  const [showPassword, setShowPassword] = useState(false);
  const [focusedInput, setFocusedInput] = useState(null); 

  // form states
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  /**
   * Handles user sign-up by validating input, creating a new user with Supabase's authentication method,
   * and inserting the user's profile data into the 'profiles' table.
   */
  const handleSignUp = async () => {
    if (!fullName || !email || !password) {
      Alert.alert("Error", "Please fill in all fields");
      return;
    }   

    try {
      // get new user data info and sign up user supabase auth
      const { data: profileData, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { fullName }
        }
      });

      if (signUpError) {
        Alert.alert("Error", signUpError.message);
        console.error("Error signing up: ", signUpError.message);
        return;
      }

      const newUser = profileData?.user;
      console.log(newUser); // for checking

      // insert new user data in the profiles table
      const { error: profileError } = await supabase.from('profiles').insert([
        {
          user_id: newUser.id, // must match auth.users.id
          full_name: fullName,
          email: email,
        }
      ]);

     if (profileError) {
      console.error("Error creating profile: ", profileError.message);
      Alert.alert("Error", "Failed to create profile");
      return;
    }
    
      Alert.alert("Success", "Sign up succesful!");
    } catch (err) {
      console.error(err);
      Alert.alert("Sign up not sucessful. Try again later...");
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={{ flex: 1, width: "100%" }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={{ alignItems: "center", paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* App logo*/}
          <Image source={Logo} style={styles.logo}/>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>SIGN-UP</Text>

            {/* Full Name */}
            <TextInput
              placeholder="Full Name"
              value={fullName}
              onChangeText={setFullName}
              style={[ styles.input, styles.halfInput, focusedInput === 'name' && styles.inputFocused ]}
              placeholderTextColor={Colors.textMuted}
              onFocus={() => setFocusedInput('name')} 
              onBlur={() => setFocusedInput(null)} 
            />

            {/* Email */}
            <TextInput
              placeholder="Email Address"
              value = {email}
              onChangeText = {setEmail}
              style={[ styles.input, focusedInput === 'email' && styles.inputFocused ]}
              placeholderTextColor={Colors.textMuted}
              onFocus={() => setFocusedInput('email')}
              onBlur={() => setFocusedInput(null)} 
            />

            {/* Password */}
            <View style={[ styles.passwordWrapper, focusedInput === 'password' && styles.inputFocused ]}>
              <TextInput
                placeholder="Password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                style={styles.passwordInput}
                placeholderTextColor={Colors.textMuted}
                onFocus={() => setFocusedInput('password')} 
                onBlur={() => setFocusedInput(null)}
              />
              <Pressable onPress={() => setShowPassword(!showPassword)}>
                <Ionicons
                  name={showPassword ? "eye-off" : "eye"}
                  size={20}
                  color={Colors.textMuted}
                  style={styles.icon}
                />
              </Pressable>
            </View>

            {/* Terms and Conditions */}
            <View>
              <Text style={styles.termsText}>
                By registering, you have read and understood the{" "}
                <Text
                  style={styles.linkText}
                  onPress={() => navigation.navigate("Terms")}
                >
                  Terms & Conditions
                </Text>
                {" "}and{" "}
                <Text
                  style={styles.linkText}
                  onPress={() => navigation.navigate("PrivacyPolicy")}
                >
                  Data Privacy Policy
                </Text>
              </Text>
            </View>

            {/* Sign Up Button */}
            <Pressable style={styles.loginButton} onPress={handleSignUp}>
              <Text style={styles.loginButtonText}>Sign Up</Text>
            </Pressable>

            {/* Footer */}
            <Text style={styles.footerText}>
              Already have an account?{" "}
              <Text style={styles.signUpText} onPress={() => navigation.navigate("Login")}>
                Log In
              </Text>
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

export default SignUpScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.cream,
    alignItems: "center",
  },
  logo: {
    width: 150,
    height: 150,
    borderRadius: 20,
    marginTop: 40,
    alignSelf: "center",
  },
  card: {
    width: "90%",
    borderRadius: 50,
    padding: 20,
    alignItems: "center",
  },
  cardTitle: {
    fontFamily: "Karla",
    fontSize: 24,
    fontWeight: '700', 
    marginTop: 30,
    marginBottom: 30,
    color: Colors.navy,
  },
  input: {
    fontFamily: "Karla",
    width: "100%",
    backgroundColor: Colors.creamLight,
    padding: 12,
    borderRadius: 10,
    marginBottom: 12,
    borderWidth: 2, 
    borderColor: Colors.creamLight, 
  },
  passwordInput: {
    fontFamily: "Karla",
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 10,
    fontSize: 14,
    color: Colors.textOnLight,
  },
  passwordWrapper: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 10,
    marginBottom: 12,
    backgroundColor: Colors.creamLight,
    width: "100%",
    paddingRight: 10,
    borderWidth: 2, 
    borderColor: Colors.creamLight, 
  },
  inputFocused: {
    borderColor: Colors.teal,
    backgroundColor: Colors.cardBg, 
  },
  icon: {
    paddingHorizontal: 8,
  },
  loginButton: {
    backgroundColor: Colors.teal,
    borderRadius: 30,
    paddingVertical: 12,
    paddingHorizontal: 40,
    marginTop: 30,
    marginBottom: 20,
  },
  loginButtonText: {
    fontFamily: "Karla",
    color: Colors.textOnDark,
    fontSize: 16,
  },
  footerText: {
    fontFamily: "Karla",
    color: Colors.textOnLight,
    fontSize: 14,
    marginTop: 5
  },
  signUpText: {
    fontFamily: "Karla",
    fontWeight: "700",
    color: Colors.textOnLight,
    textDecorationLine: "underline",
  },
  linkText: {
    fontFamily: "Karla",
    textDecorationLine: "underline",
    fontWeight: "600",
    color: Colors.teal,
    fontSize: 12,
    textAlign: "justify",
  },
  termsText: {
    fontFamily: "Karla",
    fontSize: 12,
    color: Colors.textOnLight,
    marginTop: 5,
    marginLeft: 20,
  },
});