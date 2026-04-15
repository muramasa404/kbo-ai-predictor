import { Slot } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { useFonts, NotoSansKR_400Regular, NotoSansKR_500Medium, NotoSansKR_700Bold, NotoSansKR_900Black } from '@expo-google-fonts/noto-sans-kr'
import { View, Text } from 'react-native'
import { DataContext, useDataProvider } from '../lib/use-data'

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    NotoSansKR_400Regular,
    NotoSansKR_500Medium,
    NotoSansKR_700Bold,
    NotoSansKR_900Black,
  })

  const dataState = useDataProvider()

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#1D1D1F' }}>
        <Text style={{ color: '#fff', fontSize: 16 }}>로딩 중...</Text>
        <StatusBar style="light" />
      </View>
    )
  }

  return (
    <DataContext.Provider value={dataState}>
      <StatusBar style="light" />
      <Slot />
    </DataContext.Provider>
  )
}
