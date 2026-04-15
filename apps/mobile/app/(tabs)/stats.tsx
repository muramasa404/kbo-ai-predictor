import { useState } from 'react'
import { View, Text, FlatList, Image, Pressable, StyleSheet, RefreshControl, ActivityIndicator } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { MaterialIcons } from '@expo/vector-icons'
import { useData } from '../../lib/use-data'
import { getTeamLogo } from '../../lib/teams'
import { colors, spacing, radius } from '../../lib/theme'
import type { PlayerHitter, PlayerPitcher } from '../../lib/types'

export default function StatsScreen() {
  const { data, loading, error, refresh } = useData()
  const [segment, setSegment] = useState<'h' | 'p'>('h')
  const [refreshing, setRefreshing] = useState(false)

  if (loading) return <View style={s.loader}><ActivityIndicator size="large" color={colors.blue} /></View>
  if (error) return (
    <View style={s.loader}>
      <MaterialIcons name="cloud-off" size={48} color={colors.text3} />
      <Text style={s.errorText}>{error}</Text>
      <Pressable style={s.retryBtn} onPress={refresh} accessibilityRole="button"><Text style={s.retryText}>다시 시도</Text></Pressable>
    </View>
  )

  const hitters = data?.allHitters ?? []
  const pitchers = data?.allPitchers ?? []

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <View style={s.headerArea}>
        <Text style={s.title}>선수 기록</Text>
        <View style={s.segControl}>
          <Pressable style={[s.segBtn, segment === 'h' && s.segActive]} onPress={() => setSegment('h')} accessibilityRole="tab">
            <Text style={[s.segText, segment === 'h' && s.segTextActive]}>타자 ({hitters.length})</Text>
          </Pressable>
          <Pressable style={[s.segBtn, segment === 'p' && s.segActive]} onPress={() => setSegment('p')} accessibilityRole="tab">
            <Text style={[s.segText, segment === 'p' && s.segTextActive]}>투수 ({pitchers.length})</Text>
          </Pressable>
        </View>
      </View>

      {segment === 'h' ? (
        <FlatList<PlayerHitter>
          data={hitters}
          keyExtractor={item => `${item.playerName}_${item.teamName}`}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await refresh(); setRefreshing(false) }} tintColor={colors.blue} />}
          contentContainerStyle={s.listContent}
          renderItem={({ item }) => {
            const tier = item.rank <= 10 ? 'gold' : item.rank <= 20 ? 'silver' : 'normal'
            return (
              <View style={[s.row, tier === 'gold' && s.rowGold, tier === 'silver' && s.rowSilver]}>
                <Text style={[s.rank, item.rank <= 3 && s.rankTop]}>{item.rank}</Text>
                <Image source={getTeamLogo(item.teamName)} style={s.logoXxs} resizeMode="contain" accessibilityLabel={item.teamName} />
                <View style={s.info}><Text style={s.name}>{item.playerName}</Text><Text style={s.team}>{item.teamName}</Text></View>
                <View style={s.stats}><Text style={s.mainStat}>{item.avg}</Text><Text style={s.subStat}>{item.hits}안타 {item.homeRuns}HR</Text></View>
              </View>
            )
          }}
        />
      ) : (
        <FlatList<PlayerPitcher>
          data={pitchers}
          keyExtractor={item => `${item.playerName}_${item.teamName}`}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await refresh(); setRefreshing(false) }} tintColor={colors.blue} />}
          contentContainerStyle={s.listContent}
          renderItem={({ item }) => {
            const tier = item.rank <= 10 ? 'gold' : item.rank <= 20 ? 'silver' : 'normal'
            return (
              <View style={[s.row, tier === 'gold' && s.rowGold, tier === 'silver' && s.rowSilver]}>
                <Text style={[s.rank, item.rank <= 3 && s.rankTop]}>{item.rank}</Text>
                <Image source={getTeamLogo(item.teamName)} style={s.logoXxs} resizeMode="contain" accessibilityLabel={item.teamName} />
                <View style={s.info}><Text style={s.name}>{item.playerName}</Text><Text style={s.team}>{item.teamName}</Text></View>
                <View style={s.stats}><Text style={s.mainStat}>{Number(item.era).toFixed(2)}</Text><Text style={s.subStat}>{item.wins}승{item.losses}패 {item.strikeOuts}K</Text></View>
              </View>
            )
          }}
        />
      )}
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg, gap: 12 },
  errorText: { fontSize: 14, fontFamily: 'NotoSansKR_500Medium', color: colors.text3 },
  retryBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: radius.sm, backgroundColor: colors.blue },
  retryText: { color: '#fff', fontSize: 14, fontFamily: 'NotoSansKR_700Bold' },
  headerArea: { paddingHorizontal: spacing.lg, paddingTop: spacing.xl },
  title: { fontSize: 20, fontFamily: 'NotoSansKR_900Black', marginBottom: 10 },
  segControl: { flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.06)', borderRadius: radius.sm, padding: 3, marginBottom: 4 },
  segBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 7 },
  segActive: { backgroundColor: colors.card, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 3, elevation: 1 },
  segText: { fontSize: 13, fontFamily: 'NotoSansKR_700Bold', color: colors.text3 },
  segTextActive: { color: colors.text1 },
  listContent: { paddingHorizontal: spacing.lg, paddingBottom: 40, gap: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 12, backgroundColor: colors.card, borderRadius: radius.sm, borderLeftWidth: 3, borderLeftColor: 'transparent', height: 56 },
  rowGold: { backgroundColor: colors.goldBg, borderLeftColor: colors.gold },
  rowSilver: { backgroundColor: colors.silverBg, borderLeftColor: colors.blue },
  rank: { width: 22, textAlign: 'center', fontSize: 13, fontFamily: 'NotoSansKR_700Bold', color: colors.text3 },
  rankTop: { color: '#b8960a' },
  logoXxs: { width: 20, height: 20 },
  info: { flex: 1 },
  name: { fontSize: 14, fontFamily: 'NotoSansKR_700Bold' },
  team: { fontSize: 11, fontFamily: 'NotoSansKR_500Medium', color: colors.text3 },
  stats: { alignItems: 'flex-end' },
  mainStat: { fontSize: 16, fontFamily: 'NotoSansKR_900Black' },
  subStat: { fontSize: 10, fontFamily: 'NotoSansKR_500Medium', color: colors.text3, marginTop: 1 },
})
