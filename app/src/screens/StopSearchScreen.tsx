import { useState } from 'react';
import { ScrollView, TextInput, View } from 'react-native';
import type { Stop } from '@bus-s/core';
import { searchStops } from '../api/bims';
import { NearbyStops } from '../components/NearbyStops';
import { StopDetail } from '../components/StopDetail';
import { StopList } from '../components/StopList';
import { Button, Card, Chip, ErrorText, Loading, Muted, styles } from '../components/ui';
import { searchLocalStops } from '../data/stops';

/**
 * ③ 정류장 검색 / 근처 정류장.
 * onPick 이 있으면 구간 설정의 정류장 고르기 화면으로 동작한다.
 */
export function StopSearchScreen({ onPick, active = true }: { onPick?: (s: Stop) => void; active?: boolean }) {
  const [mode, setMode] = useState<'search' | 'nearby'>('search');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Stop[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Stop | null>(null);

  const search = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    try {
      setResults(await searchStops(query));
    } catch (e) {
      // API 실패 시 로컬 목록에서라도 찾는다
      setResults(searchLocalStops(query));
      setError(`${(e as Error).message} — 저장된 목록에서 찾은 결과입니다`);
    } finally {
      setLoading(false);
    }
  };

  if (selected) {
    return (
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Button title="← 목록으로" kind="plain" onPress={() => setSelected(null)} style={{ alignSelf: 'flex-start', marginBottom: 12 }} />
        <StopDetail stop={selected} onPick={onPick} active={active} />
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
      <View style={[styles.row, { marginBottom: 10 }]}>
        <Chip label="이름·번호 검색" active={mode === 'search'} onPress={() => setMode('search')} />
        <Chip label="근처 정류장" active={mode === 'nearby'} onPress={() => setMode('nearby')} />
      </View>
      {mode === 'search' ? (
        <Card>
          <View style={[styles.row, { gap: 8 }]}>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              placeholder="정류장 이름 또는 ARS번호 5자리"
              value={query}
              onChangeText={setQuery}
              onSubmitEditing={search}
              returnKeyType="search"
            />
            <Button title="검색" onPress={search} disabled={loading} />
          </View>
          {loading ? <Loading /> : null}
          {error ? <ErrorText>{error}</ErrorText> : null}
          {results && results.length === 0 ? <Muted>검색 결과가 없습니다</Muted> : null}
          {results ? <StopList stops={results} onSelect={setSelected} /> : null}
        </Card>
      ) : (
        <Card>
          <NearbyStops onSelect={setSelected} />
        </Card>
      )}
    </ScrollView>
  );
}
