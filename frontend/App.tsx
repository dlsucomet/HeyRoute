import { NavigationContainer as ReactNavigationContainer } from "@react-navigation/native";
import { NavigationProvider } from "@googlemaps/react-native-navigation-sdk";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import HomeScreen from "./src/screens/home";
import SavedScreen from "./src/screens/saved";
import HistoryScreen from "./src/screens/history";
import ProfileScreen from "./src/screens/profile";
import LoginScreen from "./src/screens/login";
import SignupScreen from "./src/screens/signup";

const Stack = createNativeStackNavigator();

export default function App() {
  return (
    <NavigationProvider
      termsAndConditionsDialogOptions={{
        title: 'HeyRoute Navigation',
        companyName: 'HeyRoute',
      }}
    >
      <ReactNavigationContainer>
      <Stack.Navigator initialRouteName="Guest" screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen name="Saved" component={SavedScreen} />
        <Stack.Screen name="History" component={HistoryScreen} />
        <Stack.Screen name="Profile" component={ProfileScreen} />
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="Signup" component={SignupScreen} />
      </Stack.Navigator>
      </ReactNavigationContainer>
    </NavigationProvider>
  );
}
