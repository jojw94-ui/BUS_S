import { Pressable, Text } from 'react-native';
import type { Stop } from '@bus-s/core';
import { colors, Muted } from './ui';

export function StopList({ stops, onSelect }: { stops: Stop[]; onSelect: (s: Stop) => void }) {
  return (
    <>
      {stops.map((s) => (
        <Pressable
          key={s.id}
          onPress={() => onSelect(s)}
          style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.line }}
        >
          <Text style={{ fontSize: 16, color: colors.text }}>{s.name}</Text>
          <Muted>
            {s.arsNo ? `ARS ${s.arsNo} · ` : ''}ID {s.id}
            {s.towards ? ` · ${s.towards} 방면` : ''}
          </Muted>
        </Pressable>
      ))}
    </>
  );
}
