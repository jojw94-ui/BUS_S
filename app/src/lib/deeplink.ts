import { Linking } from 'react-native';
import type { Stop } from '@bus-s/core';

/** 카카오맵 대중교통 길안내. 앱이 없으면 카카오맵 웹으로 연다. */
export async function openKakaoRoute(from: Stop, to: Stop): Promise<void> {
  const app = `kakaomap://route?sp=${from.lat},${from.lng}&ep=${to.lat},${to.lng}&by=PUBLICTRANSIT`;
  try {
    await Linking.openURL(app);
  } catch {
    const enc = (s: Stop) => `${encodeURIComponent(s.name)},${s.lat},${s.lng}`;
    await Linking.openURL(`https://map.kakao.com/link/from/${enc(from)}/to/${enc(to)}`);
  }
}
