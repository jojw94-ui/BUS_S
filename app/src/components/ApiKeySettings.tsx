import { useState } from 'react';
import { Linking, TextInput, View } from 'react-native';
import { apiKeySource, setUserApiKey, testApiKey } from '../api/bims';
import { clearUserApiKey, normalizeApiKey, saveUserApiKey } from '../storage/apiKey';
import { Button, Card, colors, ErrorText, Muted, styles } from './ui';

const SOURCE_LABELS = {
  user: '내가 입력한 키 사용 중',
  builtin: '앱 기본 키 사용 중',
  none: '키 없음 — 입력해야 버스 정보를 볼 수 있습니다',
} as const;

/**
 * 공공데이터포털 API 키 입력. 다른 사람이 이 앱을 쓸 때 각자 키를 넣어 호출 한도를 따로 쓰게 한다.
 * 저장 전에 실제 API 를 한 번 불러 키가 동작하는지 확인한다.
 */
export function ApiKeySettings() {
  const [source, setSource] = useState(apiKeySource());
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const check = async (save: boolean) => {
    const key = normalizeApiKey(input);
    if (!key) return setError('키를 붙여 넣으세요');
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await testApiKey(key);
      if (save) {
        await saveUserApiKey(key);
        setUserApiKey(key);
        setSource(apiKeySource());
        setInput('');
        setMessage('키를 확인하고 저장했습니다. 이제 이 키로 버스 정보를 불러옵니다.');
      } else {
        setMessage('키가 정상적으로 동작합니다.');
      }
    } catch (e) {
      setError(`${(e as Error).message}\n포털에서 승인된 직후라면 1~2시간 뒤에 다시 시도하세요.`);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    await clearUserApiKey();
    setUserApiKey(null);
    setSource(apiKeySource());
    setMessage('입력한 키를 지웠습니다.');
    setError(null);
  };

  return (
    <Card>
      <Muted style={{ color: source === 'none' ? colors.danger : colors.sub }}>{SOURCE_LABELS[source]}</Muted>
      <Muted style={{ marginTop: 4 }}>
        공공데이터포털(data.go.kr)에 가입하고 '부산광역시_부산버스정보시스템'을 검색해 활용신청(자동 승인, 무료)한 뒤, 마이페이지의 일반
        인증키를 붙여 넣으세요. Encoding·Decoding 키 어느 쪽이든 됩니다.
      </Muted>
      <Button
        title="공공데이터포털 열기"
        kind="plain"
        onPress={() => Linking.openURL('https://www.data.go.kr')}
        style={{ alignSelf: 'flex-start', marginTop: 4 }}
      />
      <TextInput
        style={[styles.input, { marginTop: 8 }]}
        placeholder="인증키 붙여 넣기"
        value={input}
        onChangeText={setInput}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
      />
      <View style={[styles.row, { gap: 8, marginTop: 8 }]}>
        <Button title="확인만" kind="plain" style={{ flex: 1 }} onPress={() => check(false)} disabled={busy} />
        <Button title={busy ? '확인 중…' : '확인 후 저장'} style={{ flex: 1 }} onPress={() => check(true)} disabled={busy} />
      </View>
      {source === 'user' ? (
        <Button title="입력한 키 지우기" kind="danger" onPress={remove} style={{ marginTop: 8 }} />
      ) : null}
      {message ? <Muted style={{ marginTop: 8, color: colors.primary }}>{message}</Muted> : null}
      {error ? <ErrorText>{error}</ErrorText> : null}
    </Card>
  );
}
