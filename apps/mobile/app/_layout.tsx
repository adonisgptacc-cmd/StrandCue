import { Stack } from 'expo-router';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { colors } from '../src/ui';
export default function Layout() {
  return <SafeAreaProvider><SafeAreaView style={{flex:1,backgroundColor:colors.paper}}><StatusBar style="dark"/><Stack screenOptions={{headerShown:false}}/></SafeAreaView></SafeAreaProvider>;
}
