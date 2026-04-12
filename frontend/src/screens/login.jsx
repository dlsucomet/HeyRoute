/**
 * This screen serves as the main entry point for users to log in to the app.
 * 
 * Handles: 
 * - User authentication
 */

import React, { useState } from "react";
import { View, Text, StyleSheet, TextInput, Pressable, ScrollView, KeyboardAvoidingView, Platform, Image, Alert, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import Ionicons from 'react-native-vector-icons/Ionicons';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';

import supabase from '../supabase-client';
import Logo from '../assets/images/logo-icon.png';

const LoginScreen = () => {
  const navigation = useNavigation();
  const [rememberMe, setRememberMe] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [focusedInput, setFocusedInput] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const focusColor = '#83689f';
  const defaultColor = '#8c8c8c';

  // form states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  /**
   * Handles user login by validating input and using Supabase's authentication method.
   */
  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert("Error", "Please fill in both email and password");
      return;
    }

    setIsLoading(true);

    try {
      const { error: loginError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (loginError) {
        console.error("Login error: ", loginError.message);
        Alert.alert("Login Failed", loginError.message);
        return;
      }
      
      console.log("Login successful.");
    } catch (err) {
      console.error(err);
      Alert.alert("Login Failed", "Something went wrong. Please try again later.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={{ flex: 1, width: "100%" }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView 
          style={{ flex: 1, width: "100%" }} 
          contentContainerStyle={{ 
            flexGrow: 1, 
            alignItems: "center",
            paddingTop: 60,
            paddingBottom: 40 
          }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* App logo*/}
          <Image source={Logo} style={styles.logo}/>

          {/* Login Card */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>LOGIN</Text>

            {/* Email Input */}
            <View style={[
              styles.wrapper,
              focusedInput === 'email' && styles.inputFocused
            ]}>
              <MaterialIcons name="email" size={25} marginLeft={10}
                color={focusedInput === 'email' ? focusColor : defaultColor}
               />
              <TextInput
                placeholder="Email Address"
                value={email}
                onChangeText={setEmail}
                style={styles.input}
                placeholderTextColor="#757575ff"
                onFocus={() => setFocusedInput('email')}  
                onBlur={() => setFocusedInput(null)}     
              />
            </View>

            {/* Password Input */}
            <View style={[
              styles.wrapper,
              focusedInput === 'password' && styles.inputFocused 
            ]}>
              <MaterialIcons name="key" size={25} marginLeft={10}
                color={focusedInput === 'password' ? focusColor : defaultColor}
              />
              <TextInput
                placeholder="Password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                style={styles.input}
                placeholderTextColor="#999"
                onFocus={() => setFocusedInput('password')} 
                onBlur={() => setFocusedInput(null)}    
              />
              <Pressable onPress={() => setShowPassword(!showPassword)}>
                <Ionicons
                  name={showPassword ? "eye-off" : "eye"}
                  size={20}
                  color="#8c8c8cff"
                  style={styles.showPasswordIcon}
                />
              </Pressable>
            </View>
            
            <Pressable
              style={({ pressed }) => [styles.loginButton, pressed && { opacity: 0.7 }]}
              onPress={handleLogin}
              disabled={isLoading} // to prevent from pressing multiple times
            >
              {isLoading ? (
                <ActivityIndicator color="#ffffff" /> // show spinner when loading
              ) : (
                <Text style={styles.loginButtonText}>Log In</Text>
              )}
            </Pressable>

            <Text style={styles.footerText}>
              Don't have an account?{" "}
              <Text
                style={styles.signUpText}
                onPress={() => navigation.navigate("Signup")}
              >
                Sign Up
              </Text>
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

export default LoginScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
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
    fontWeight: "700", 
    marginBottom: 30,
    color: "#2f2150",
  },
  input: {
    fontFamily: "Karla",
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 10,
    fontSize: 14,
    color: "#000",
  },
  showPasswordIcon: {
    paddingHorizontal: 8,
  },
  wrapper:{
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 10,
    marginBottom: 12,
    backgroundColor: "#E6E6E6",
    width: "100%",
    paddingRight: 10,
    borderWidth: 2, 
    borderColor: '#E6E6E6', 
  },
  inputFocused: {
    borderColor: '#83689f',
    backgroundColor: '#fff',  
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
    marginTop: 5,
    marginBottom: 20,
  },
  loginButton: {
    backgroundColor: "#83689f",
    borderRadius: 30,
    paddingVertical: 12,
    paddingHorizontal: 40,
    marginTop: 20,
    marginBottom: 20,
  },
  loginButtonText: {
    fontFamily: "Karla",
    color: "#ffffffff",
    fontSize: 16,
    fontWeight: '500', 
  },
  footerText: {
    fontFamily: "Karla",
    color: "#090909ff",
    fontSize: 14,
    marginTop: 10
  },
  signUpText: {
    fontFamily: "Karla",
    fontWeight: "700",
    textDecorationLine: "underline",
  },
});