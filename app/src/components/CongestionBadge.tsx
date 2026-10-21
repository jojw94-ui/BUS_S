import { Text, View } from 'react-native';
import type { CongestionEstimate } from '@bus-s/core';
import { colors } from './ui';

const LABELS = ['여유', '보통', '혼잡', '매우혼잡'];

/** 실측이 아니므로 항상 '추정 혼잡도'로 표시한다 */
export function CongestionBadge({ value, large }: { value: CongestionEstimate; large?: boolean }) {
  const unknown = value.baseline === null && value.gapRatio === null;
  const color = unknown ? colors.sub : colors.level[value.level];
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <Text style={{ fontSize: large ? 13 : 11, color: colors.sub }}>추정 혼잡도</Text>
      <View style={{ backgroundColor: color, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 }}>
        <Text style={{ color: '#fff', fontWeight: '700', fontSize: large ? 15 : 12 }}>
          {unknown ? '정보 없음' : LABELS[value.level]}
        </Text>
      </View>
    </View>
  );
}
