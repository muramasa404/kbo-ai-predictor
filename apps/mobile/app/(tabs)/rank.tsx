import { useMemo, useState } from 'react'
import { View, Text, ScrollView, Image, Pressable, StyleSheet, RefreshControl, ActivityIndicator } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { MaterialIcons } from '@expo/vector-icons'
import { useData } from '../../lib/use-data'
import { getTeamLogo } from '../../lib/teams'
import { colors, spacing, radius } from '../../lib/theme'
import type { TeamRank } from '../../lib/types'

export default function RankScreen() {
  const { data, loading, error, refresh } = useData()
  const [refreshing, setRefreshing] = useState(false)
  const today = useMemo(() => new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' }), [])
  const ranks = data?.teamRanks ?? []

  if (loading) return <View style={s.loader}><ActivityIndicator size="large" color={colors.blue} /></View>
  if (error) return <ErrorView message={error} onRetry={refresh} />

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScrollView style={s.scroll} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await refresh(); setRefreshing(false) }} tintColor={colors.blue} />}>
        <Text style={s.title}>2026 KBO 팀 순위</Text>
        <Text style={s.sub}>{today} 기준</Text>
        <View style={s.header}>
          <Text style={[s.hCell, s.colRank]}>#</Text>
          <Text style={[s.hCell, s.colTeam]}>팀</Text>
          <Text style={[s.hCell, s.colRecord]}>성적</Text>
          <Text style={[s.hCell, s.colPct]}>승률</Text>
          <Text style={[s.hCell, s.colGb]}>차</Text>
        </View>
        {ranks.map((r: TeamRank, i: number) => (
          <View key={r.teamName} style={[s.row, i < 3 && s.rowTop3]}>
            <Text style={[s.rankNum, i < 3 && s.rankGold, s.colRank]}>{r.rank}</Text>
            <View style={[s.teamCell, s.colTeam]}>
              <Image source={getTeamLogo(r.teamName)} style={s.logoXs} resizeMode="contain" accessibilityLabel={r.teamName} />
              <Text style={s.teamNameText}>{r.teamName}</Text>
            </View>
            <Text style={[s.record, s.colRecord]}>{r.wins}-{r.losses}-{r.draws}</Text>
            <Text style={[s.pct, s.colPct]}>{r.winPct}</Text>
            <Text style={[s.gb, s.colGb]}>{r.gamesBack === '0.0' ? '-' : r.gamesBack}</Text>
          </View>
        ))}
        <View style={s.bottom} />
      </ScrollView>
    </SafeAreaView>
  )
}

function ErrorView({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View style={s.loader}>
      <MaterialIcons name="cloud-off" size={48} color={colors.text3} />
      <Text style={s.errorText}>{message}</Text>
      <Pressable style={s.retryBtn} onPress={onRetry} accessibilityRole="button"><Text style={s.retryText}>다시 시도</Text></Pressable>
    </View>
  )
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1 },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg, gap: 12 },
  errorText: { fontSize: 14, fontFamily: 'NotoSansKR_500Medium', color: colors.text3 },
  retryBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: radius.sm, backgroundColor: colors.blue },
  retryText: { color: '#fff', fontSize: 14, fontFamily: 'NotoSansKR_700Bold' },
  title: { fontSize: 20, fontFamily: 'NotoSansKR_900Black', paddingHorizontal: spacing.lg, paddingTop: spacing.xl },
  sub: { fontSize: 12, fontFamily: 'NotoSansKR_500Medium', color: colors.text3, paddingHorizontal: spacing.lg, marginBottom: 12 },
  header: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 14, marginHorizontal: spacing.lg, backgroundColor: colors.black, borderTopLeftRadius: radius.md, borderTopRightRadius: radius.md },
  hCell: { color: 'rgba(255,255,255,0.5)', fontSize: 11, fontFamily: 'NotoSansKR_700Bold' },
  colRank: { width: 28, textAlign: 'center' },
  colTeam: { flex: 1 },
  colRecord: { width: 60, textAlign: 'center' },
  colPct: { width: 48, textAlign: 'center' },
  colGb: { width: 32, textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 11, paddingHorizontal: 14, marginHorizontal: spacing.lg, backgroundColor: colors.card, borderBottomWidth: 0.5, borderBottomColor: colors.border },
  rowTop3: { backgroundColor: colors.goldBg },
  rankNum: { fontSize: 14, fontFamily: 'NotoSansKR_700Bold', color: colors.text3 },
  rankGold: { color: '#b8960a' },
  teamCell: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logoXs: { width: 22, height: 22 },
  teamNameText: { fontSize: 14, fontFamily: 'NotoSansKR_700Bold' },
  record: { fontSize: 13, fontFamily: 'NotoSansKR_500Medium', color: colors.text2 },
  pct: { fontSize: 14, fontFamily: 'NotoSansKR_700Bold' },
  gb: { fontSize: 13, fontFamily: 'NotoSansKR_500Medium', color: colors.text3 },
  bottom: { height: 40 },
})
