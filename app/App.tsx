import { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import type { CommuteSegment, Stop, StopId } from '@bus-s/core';
import { colors } from './src/components/ui';
import { HomeScreen } from './src/screens/HomeScreen';
import { SegmentsScreen } from './src/screens/SegmentsScreen';
import { StopSearchScreen } from './src/screens/StopSearchScreen';
import { loadKnownStops, loadSegments, rememberStops, saveSegments } from './src/storage/segments';

type Tab = 'home' | 'segments' | 'search';
const TABS: { key: Tab; label: string }[] = [
  { key: 'home', label: '추천' },
  { key: 'segments', label: '구간 설정' },
  { key: 'search', label: '정류장 검색' },
];

export default function App() {
  const [tab, setTab] = useState<Tab>('home');
  const [segments, setSegments] = useState<CommuteSegment[] | null>(null);
  const [knownStops, setKnownStops] = useState<Record<StopId, Stop>>({});

  const reload = useCallback(async () => {
    const [segs, stops] = await Promise.all([loadSegments(), loadKnownStops()]);
    setSegments(segs);
    setKnownStops(stops);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const save = async (next: CommuteSegment[], picked: Stop[]) => {
    await saveSegments(next);
    if (picked.length) setKnownStops(await rememberStops(picked));
    setSegments(next);
  };

  return (
    <SafeAreaProvider>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top', 'bottom']}>
        <StatusBar style="dark" />
        <View style={{ flex: 1 }}>
          {segments === null ? null : (
            <>
              {/* 탭을 떠나도 상태를 유지하려고 숨김 처리만 한다. 자동 새로고침은 active 로 끈다. */}
              <View style={{ flex: 1, display: tab === 'home' ? 'flex' : 'none' }}>
                <HomeScreen
                  segments={segments}
                  knownStops={knownStops}
                  active={tab === 'home'}
                  onGoSetup={() => setTab('segments')}
                />
              </View>
              <View style={{ flex: 1, display: tab === 'segments' ? 'flex' : 'none' }}>
                <SegmentsScreen segments={segments} knownStops={knownStops} onSave={save} onReload={reload} />
              </View>
              <View style={{ flex: 1, display: tab === 'search' ? 'flex' : 'none' }}>
                <StopSearchScreen active={tab === 'search'} />
              </View>
            </>
          )}
        </View>
        <View style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.card }}>
          {TABS.map((t) => (
            <Pressable
              key={t.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === t.key }}
              onPress={() => setTab(t.key)}
              style={{ flex: 1, paddingVertical: 14, alignItems: 'center' }}
            >
              <Text style={{ fontSize: 15, fontWeight: tab === t.key ? '700' : '400', color: tab === t.key ? colors.primary : colors.sub }}>
                {t.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
