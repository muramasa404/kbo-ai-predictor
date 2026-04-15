import { useState } from 'react'
import { View, Text, ScrollView, Pressable, StyleSheet, RefreshControl, ActivityIndicator } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { MaterialIcons } from '@expo/vector-icons'
import { useData } from '../../lib/use-data'
import { colors, spacing, radius } from '../../lib/theme'

const TABLE_LABELS: Record<string, string> = {
  Player: '등록 선수',
  HitterSeasonStat: '타자 시즌 기록',
  PitcherSeasonStat: '투수 시즌 기록',
  TeamRankDaily: '팀 순위',
  Prediction: 'AI 예측 결과',
  Game: '경기 일정',
  SourceSnapshot: '수집 원본',
}

export default function SystemScreen() {
  const { dbStatus, data, loading, error, refresh } = useData()
  const [refreshing, setRefreshing] = useState(false)
  const model = data?.modelInfo

  if (loading) return <View style={s.loader}><ActivityIndicator size="large" color={colors.blue} /></View>
  if (error || !dbStatus) return (
    <View style={s.loader}>
      <MaterialIcons name="cloud-off" size={48} color={colors.text3} />
      <Text style={s.errorText}>{error ?? '시스템 정보 없음'}</Text>
      <Pressable style={s.retryBtn} onPress={refresh} accessibilityRole="button"><Text style={s.retryText}>다시 시도</Text></Pressable>
    </View>
  )

  const maxCount = Math.max(...dbStatus.tables.map(t => t.count), 1)

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScrollView style={s.scroll} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await refresh(); setRefreshing(false) }} tintColor={colors.blue} />}>
        <Text style={s.title}>시스템 현황</Text>

        <View style={s.cardRow}>
          <SumCard icon="storage" value={dbStatus.totalRecords.toLocaleString()} label="전체 데이터" />
          <SumCard icon="check-circle" value={String(dbStatus.tables.filter(t => t.count > 0).length)} label="활성 테이블" />
          <SumCard icon="update" value={dbStatus.lastCollected ? timeAgo(dbStatus.lastCollected) : '-'} label="최근 수집" />
        </View>

        <Text style={s.sectionTitle}>데이터 수집 현황</Text>
        {dbStatus.tables.map(t => {
          const active = t.count > 0
          const label = TABLE_LABELS[t.name] ?? t.name
          return (
            <View key={t.name} style={[s.tableRow, !active && s.inactive]}>
              <MaterialIcons name={active ? 'check-circle' : 'radio-button-unchecked'} size={16} color={active ? colors.green : colors.text3} />
              <View style={s.tNameCol}>
                <Text style={s.tLabel}>{label}</Text>
                <Text style={s.tSub}>{t.name}</Text>
              </View>
              <Text style={s.tCount}>{active ? t.count.toLocaleString() : '-'}</Text>
              <View style={s.barBg}><View style={[s.barFg, { width: `${(t.count / maxCount) * 100}%` }]} /></View>
            </View>
          )
        })}

        {model && (
          <>
            <Text style={[s.sectionTitle, s.gap]}>AI 모델</Text>
            <View style={s.modelCard}>
              <MRow label="버전" value={model.version} bold />
              <MRow label="엔진" value="XGBoost ML" />
              <MRow label="분석 요소" value={`${model.features.length}개 팩터`} />
              <MRow label="학습일" value={model.lastTrained} />
              <Text style={s.modelDesc}>{model.description}</Text>
            </View>
          </>
        )}
        <View style={s.bottom} />
      </ScrollView>
    </SafeAreaView>
  )
}

function SumCard({ icon, value, label }: { icon: string; value: string; label: string }) {
  return (
    <View style={s.sumCard}>
      <MaterialIcons name={icon as any} size={20} color={colors.blue} />
      <Text style={s.sumNum}>{value}</Text>
      <Text style={s.sumLabel}>{label}</Text>
    </View>
  )
}

function MRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={s.mRow}>
      <Text style={s.mLabel}>{label}</Text>
      <Text style={[s.mValue, bold && s.mBold]}>{value}</Text>
    </View>
  )
}

function timeAgo(iso: string): string {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (d < 1) return '방금'
  if (d < 60) return `${d}분 전`
  if (d < 1440) return `${Math.floor(d / 60)}시간 전`
  return `${Math.floor(d / 1440)}일 전`
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg }, scroll: { flex: 1 },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg, gap: 12 },
  errorText: { fontSize: 14, fontFamily: 'NotoSansKR_500Medium', color: colors.text3 },
  retryBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: radius.sm, backgroundColor: colors.blue },
  retryText: { color: '#fff', fontSize: 14, fontFamily: 'NotoSansKR_700Bold' },
  title: { fontSize: 20, fontFamily: 'NotoSansKR_900Black', paddingHorizontal: spacing.lg, paddingTop: spacing.xl, marginBottom: 12 },
  sectionTitle: { fontSize: 15, fontFamily: 'NotoSansKR_700Bold', color: colors.text2, paddingHorizontal: spacing.lg, marginBottom: 8 },
  gap: { marginTop: 20 },
  cardRow: { flexDirection: 'row', gap: 8, paddingHorizontal: spacing.lg, marginBottom: 20 },
  sumCard: { flex: 1, backgroundColor: colors.card, borderRadius: radius.md, padding: 14, alignItems: 'center', gap: 4, elevation: 1, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 1 } },
  sumNum: { fontSize: 17, fontFamily: 'NotoSansKR_900Black' },
  sumLabel: { fontSize: 10, fontFamily: 'NotoSansKR_500Medium', color: colors.text3 },
  tableRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 12, marginHorizontal: spacing.lg, marginBottom: 4, backgroundColor: colors.card, borderRadius: radius.sm, height: 52 },
  inactive: { opacity: 0.4 },
  tNameCol: { flex: 1 },
  tLabel: { fontSize: 13, fontFamily: 'NotoSansKR_700Bold', color: colors.text1 },
  tSub: { fontSize: 10, fontFamily: 'NotoSansKR_400Regular', color: colors.text3, marginTop: 1 },
  tCount: { width: 40, textAlign: 'right', fontSize: 14, fontFamily: 'NotoSansKR_900Black', color: colors.blue },
  barBg: { width: 48, height: 4, borderRadius: 980, backgroundColor: 'rgba(0,0,0,0.05)', overflow: 'hidden' },
  barFg: { height: 4, borderRadius: 980, backgroundColor: colors.blue },
  modelCard: { marginHorizontal: spacing.lg, backgroundColor: colors.card, borderRadius: radius.md, overflow: 'hidden', elevation: 1 },
  mRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 14, borderBottomWidth: 0.5, borderBottomColor: colors.border, height: 44 },
  mLabel: { fontSize: 13, fontFamily: 'NotoSansKR_500Medium', color: colors.text3 },
  mValue: { fontSize: 13, fontFamily: 'NotoSansKR_500Medium', color: colors.text1 },
  mBold: { color: colors.blue, fontFamily: 'NotoSansKR_700Bold' },
  modelDesc: { padding: 14, fontSize: 12, fontFamily: 'NotoSansKR_400Regular', color: colors.text3, lineHeight: 18, borderTopWidth: 0.5, borderTopColor: colors.border },
  bottom: { height: 40 },
})
