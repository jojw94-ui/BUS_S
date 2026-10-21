// 사용자가 입력한 공공데이터포털 API 키 (기기 내부 저장).
// 있으면 이 키를 쓰고, 없으면 앱에 들어 있는 키(app/.env → 빌드 시 포함)를 쓴다.
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_KEY_KEY = 'bus-s/api-key/v1';

/**
 * 포털의 "Encoding" 키(%2B, %3D 등 포함)를 붙여 넣어도 동작하도록 Decoding 키로 바꾼다.
 * 앞뒤 공백·줄바꿈도 지운다.
 */
export function normalizeApiKey(input: string): string {
  const key = input.replace(/\s+/g, '');
  if (!/%[0-9A-Fa-f]{2}/.test(key)) return key;
  try {
    return decodeURIComponent(key);
  } catch {
    return key;
  }
}

export async function loadUserApiKey(): Promise<string | null> {
  const v = await AsyncStorage.getItem(API_KEY_KEY);
  return v ? v : null;
}

export async function saveUserApiKey(key: string): Promise<void> {
  await AsyncStorage.setItem(API_KEY_KEY, key);
}

export async function clearUserApiKey(): Promise<void> {
  await AsyncStorage.removeItem(API_KEY_KEY);
}
