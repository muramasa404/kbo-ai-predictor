import { useMemo, useState, useEffect, useRef } from 'react'
import { View, Text, ScrollView, Image, Pressable, StyleSheet, RefreshControl, ActivityIndicator, Animated } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { MaterialIcons } from '@expo/vector-icons'
import { useData } from '../../lib/use-data'
import { getTeamLogo, getTeamColor } from '../../lib/teams'
import { colors, spacing, radius } from '../../lib/theme'
import type { Prediction } from '../../lib/types'

export default function HomeScreen() {
  const { data, loading, error, updatedAt, refresh } = useData()
  const [refreshing, setRefreshing] = useState(false)
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({})

  // Animated values for hero
  const logoScale = useRef(new Animated.Value(0)).current
  const titleOpacity = useRef(new Animated.Value(0)).current
  const titleSlide = useRef(new Animated.Value(20)).current

  useEffect(() => {
    Animated.sequence([
      Animated.spring(logoScale, { toValue: 1, friction: 5, useNativeDriver: true }),
      Animated.parallel([
        Animated.timing(titleOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.timing(titleSlide, { toValue: 0, duration: 400, useNativeDriver: true }),
      ]),
    ]).start()
  }, [])

  const today = useMemo(() => new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' }), [])

  const toggle = (id: string) => setExpandedIds(prev => ({ ...prev, [id]: !prev[id] }))
  const onRefresh = async () => { setRefreshing(true); await refresh(); setRefreshing(false) }

  if (loading) return <View style={s.loader}><ActivityIndicator size="large" color={colors.blue} /></View>

  if (error) return (
    <View style={s.loader}>
      <MaterialIcons name="cloud-off" size={48} color={colors.text3} />
      <Text style={s.errorText}>{error}</Text>
      <Pressable style={s.retryBtn} onPress={refresh} accessibilityRole="button" accessibilityLabel="다시 시도">
        <Text style={s.retryText}>다시 시도</Text>
      </Pressable>
    </View>
  )

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.blue} />}>
        {/* Hero — animated logo + dynamic title */}
        <View style={s.hero}>
          <Animated.View style={[s.logoContainer, { transform: [{ scale: logoScale }] }]}>
            <View style={s.logoOuter}>
              <View style={s.logoInner}>
                <Text style={s.logoEmoji}>⚾</Text>
              </View>
            </View>
          </Animated.View>

          <Animated.View style={{ opacity: titleOpacity, transform: [{ translateY: titleSlide }] }}>
            <Text style={s.brandName}>KBO AI Predictor</Text>
            <Text style={s.brandSub}>실시간 승부예측 시스템</Text>
          </Animated.View>

          <Text style={s.heroDate}>{today}</Text>

          <View style={s.chipRow}>
            <View style={s.chipLive}><View style={s.liveDot} /><Text style={s.chipLiveText}>LIVE</Text></View>
            {data?.hero?.chips?.map((c: string) => (
              <View key={c} style={s.chip}><Text style={s.chipText}>{c}</Text></View>
            ))}
          </View>

          {/* Model badge */}
          {data?.modelInfo && (
            <View style={s.modelBadge}>
              <MaterialIcons name="auto-awesome" size={12} color={colors.blue} />
              <Text style={s.modelBadgeText}>{data.modelInfo.version} · XGBoost ML</Text>
            </View>
          )}
        </View>

        {/* Predictions */}
        {data?.predictions?.map((p: Prediction, idx: number) => (
          <MatchCard key={p.id} prediction={p} today={today} expanded={!!expandedIds[p.id]} onToggle={() => toggle(p.id)} index={idx} />
        ))}

        {/* Model details — collapsible at bottom */}
        {data?.modelInfo && (
          <Pressable style={s.modelBar} onPress={() => toggle('model')} accessibilityRole="button">
            <MaterialIcons name="auto-awesome" size={16} color={colors.text2} />
            <Text style={s.modelBarText}>{data.modelInfo.version}</Text>
            <Text style={s.modelBarSub}>22개 피처 · 84.4% 정확도</Text>
            <MaterialIcons name={expandedIds.model ? 'expand-less' : 'expand-more'} size={20} color={colors.text3} />
          </Pressable>
        )}
        {expandedIds.model && data?.modelInfo && (
          <View style={s.modelExpand}>
            <Text style={s.modelDesc}>{data.modelInfo.description}</Text>
            <View style={s.featureRow}>
              {data.modelInfo.features?.map((f: string) => (
                <View key={f} style={s.featureTag}><Text style={s.featureText}>{f}</Text></View>
              ))}
            </View>
          </View>
        )}

        <View style={s.bottom} />
      </ScrollView>
    </SafeAreaView>
  )
}

/* ═══ Match Card Component ═══ */
function MatchCard({ prediction: p, today, expanded, onToggle, index }: {
  prediction: Prediction; today: string; expanded: boolean; onToggle: () => void; index: number
}) {
  const fadeAnim = useRef(new Animated.Value(0)).current
  const slideAnim = useRef(new Animated.Value(30)).current

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, delay: index * 100, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 500, delay: index * 100, useNativeDriver: true }),
    ]).start()
  }, [])

  return (
    <Animated.View style={[s.matchCard, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
      <View style={s.dateRow}>
        <MaterialIcons name="event" size={13} color={colors.text3} />
        <Text style={s.dateText}>{today} {p.gameTime}</Text>
      </View>

      <View style={s.teams}>
        <View style={s.teamCol}>
          <Image source={getTeamLogo(p.awayTeam)} style={s.logo} resizeMode="contain" accessibilityLabel={p.awayTeam} />
          <Text style={s.teamName}>{p.awayTeam}</Text>
          {p.awayStarter && (
            <View style={s.starterRow}>
              <MaterialIcons name="sports-baseball" size={10} color={colors.blue} />
              <Text style={s.starterText} numberOfLines={1}>{p.awayStarter.name} · {p.awayStarter.era}</Text>
            </View>
          )}
        </View>
        <View style={s.vsBox}><Text style={s.vsText}>VS</Text></View>
        <View style={s.teamCol}>
          <Image source={getTeamLogo(p.homeTeam)} style={s.logo} resizeMode="contain" accessibilityLabel={p.homeTeam} />
          <Text style={s.teamName}>{p.homeTeam}</Text>
          {p.homeStarter && (
            <View style={s.starterRow}>
              <MaterialIcons name="sports-baseball" size={10} color={colors.blue} />
              <Text style={s.starterText} numberOfLines={1}>{p.homeStarter.name} · {p.homeStarter.era}</Text>
            </View>
          )}
        </View>
      </View>

      <View style={s.probBars}>
        <View style={[s.bar, { width: `${100 - p.winProbability}%`, backgroundColor: getTeamColor(p.awayTeam) }]} />
        <View style={s.barGap} />
        <View style={[s.bar, { width: `${p.winProbability}%`, backgroundColor: getTeamColor(p.homeTeam) }]} />
      </View>
      <View style={s.probRow}>
        <Text style={s.pct}>{100 - p.winProbability}%</Text>
        <View style={s.confPill}><Text style={s.confText}>{p.confidence}</Text></View>
        <Text style={s.pct}>{p.winProbability}%</Text>
      </View>

      {/* AI 결과 toggle */}
      <Pressable style={s.aiToggle} onPress={onToggle} accessibilityRole="button" accessibilityLabel="AI 결과 확인">
        <MaterialIcons name="auto-awesome" size={16} color={colors.blue} />
        <Text style={s.aiToggleText}>AI 결과</Text>
        <MaterialIcons name={expanded ? 'expand-less' : 'expand-more'} size={20} color={colors.text3} />
      </Pressable>
      {expanded && (
        <View style={s.reasonList}>
          {p.topReasons?.map((r: string, i: number) => (
            <View key={i} style={s.reasonItem}>
              <Text style={s.reasonBullet}>•</Text>
              <Text style={s.reasonText}>{r}</Text>
            </View>
          ))}
        </View>
      )}
    </Animated.View>
  )
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.black },
  scroll: { flex: 1, backgroundColor: colors.bg },
  scrollContent: { paddingBottom: 24 },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.bg, gap: 12 },
  errorText: { fontSize: 14, fontFamily: 'NotoSansKR_500Medium', color: colors.text3, textAlign: 'center' },
  retryBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: radius.sm, backgroundColor: colors.blue },
  retryText: { color: '#fff', fontSize: 14, fontFamily: 'NotoSansKR_700Bold' },

  // Hero
  hero: { backgroundColor: colors.black, paddingTop: 28, paddingBottom: 24, paddingHorizontal: spacing.lg, alignItems: 'center' },
  logoContainer: { marginBottom: 14 },
  logoOuter: { width: 64, height: 64, borderRadius: 18, backgroundColor: colors.blue, alignItems: 'center', justifyContent: 'center', shadowColor: colors.blue, shadowOpacity: 0.5, shadowRadius: 16, shadowOffset: { width: 0, height: 4 }, elevation: 8 },
  logoInner: { width: 52, height: 52, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  logoEmoji: { fontSize: 28 },
  brandName: { color: '#fff', fontSize: 22, fontFamily: 'NotoSansKR_900Black', textAlign: 'center', letterSpacing: -0.5 },
  brandSub: { color: 'rgba(255,255,255,0.5)', fontSize: 13, fontFamily: 'NotoSansKR_500Medium', textAlign: 'center', marginTop: 2 },
  heroDate: { color: 'rgba(255,255,255,0.35)', fontSize: 12, fontFamily: 'NotoSansKR_500Medium', marginTop: 10 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6, marginTop: 12 },
  chip: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: radius.pill, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  chipText: { color: 'rgba(255,255,255,0.5)', fontSize: 11, fontFamily: 'NotoSansKR_500Medium' },
  chipLive: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: 'rgba(48,209,88,0.15)' },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.green },
  chipLiveText: { color: colors.green, fontSize: 11, fontFamily: 'NotoSansKR_700Bold', letterSpacing: 0.5 },
  modelBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 12, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, backgroundColor: 'rgba(0,113,227,0.15)' },
  modelBadgeText: { color: colors.blue, fontSize: 10, fontFamily: 'NotoSansKR_700Bold' },

  // Match card
  matchCard: { marginHorizontal: spacing.lg, marginTop: spacing.md, backgroundColor: colors.card, borderRadius: radius.lg, padding: spacing.lg, elevation: 2, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 3 } },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingBottom: 10, marginBottom: 12, borderBottomWidth: 0.5, borderBottomColor: colors.border },
  dateText: { fontSize: 11, color: colors.text3, fontFamily: 'NotoSansKR_500Medium' },
  teams: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  teamCol: { alignItems: 'center', width: 100, gap: 4 },
  logo: { width: 48, height: 48 },
  teamName: { fontSize: 15, fontFamily: 'NotoSansKR_700Bold', color: colors.text1 },
  starterRow: { flexDirection: 'row', alignItems: 'center', gap: 3, maxWidth: 100, paddingHorizontal: 2 },
  starterText: { flex: 1, fontSize: 10, fontFamily: 'NotoSansKR_500Medium', color: colors.text3, letterSpacing: -0.2 },
  vsBox: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, backgroundColor: 'rgba(0,0,0,0.04)' },
  vsText: { fontSize: 13, fontFamily: 'NotoSansKR_700Bold', color: colors.text3 },

  probBars: { flexDirection: 'row', height: 8, borderRadius: radius.pill, overflow: 'hidden', marginTop: 16 },
  bar: { height: 8, borderRadius: radius.pill },
  barGap: { width: 2 },
  probRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  pct: { fontSize: 16, fontFamily: 'NotoSansKR_900Black', color: colors.text1 },
  confPill: { backgroundColor: colors.blue, paddingHorizontal: 12, paddingVertical: 3, borderRadius: radius.pill },
  confText: { color: '#fff', fontSize: 11, fontFamily: 'NotoSansKR_700Bold' },

  // AI 결과
  aiToggle: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14, paddingTop: 12, borderTopWidth: 0.5, borderTopColor: colors.border },
  aiToggleText: { flex: 1, fontSize: 13, fontFamily: 'NotoSansKR_700Bold', color: colors.blue },
  reasonList: { marginTop: 8, gap: 5 },
  reasonItem: { flexDirection: 'row', gap: 6, paddingRight: 4 },
  reasonBullet: { color: colors.blue, fontSize: 13, fontFamily: 'NotoSansKR_700Bold', lineHeight: 20 },
  reasonText: { flex: 1, fontSize: 12, fontFamily: 'NotoSansKR_400Regular', color: colors.text2, lineHeight: 19 },

  // Model bar
  modelBar: { flexDirection: 'row', alignItems: 'center', gap: 6, marginHorizontal: spacing.lg, marginTop: spacing.md, backgroundColor: colors.card, borderRadius: radius.sm, padding: 12, elevation: 1 },
  modelBarText: { fontSize: 13, fontFamily: 'NotoSansKR_700Bold', color: colors.text2 },
  modelBarSub: { flex: 1, fontSize: 11, fontFamily: 'NotoSansKR_500Medium', color: colors.text3, textAlign: 'right', marginRight: 4 },
  modelExpand: { marginHorizontal: spacing.lg, backgroundColor: colors.card, borderBottomLeftRadius: radius.sm, borderBottomRightRadius: radius.sm, padding: 12, paddingTop: 4 },
  modelDesc: { fontSize: 12, fontFamily: 'NotoSansKR_400Regular', color: colors.text3, lineHeight: 18 },
  featureRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 8 },
  featureTag: { backgroundColor: colors.blueLight, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5 },
  featureText: { fontSize: 10, fontFamily: 'NotoSansKR_700Bold', color: colors.blue },
  bottom: { height: 20 },
})
