import { XMLParser } from 'fast-xml-parser';

// 숫자처럼 보이는 값도 문자열로 둔다 (정류소ID·ARS번호의 앞자리 0 보존).
const parser = new XMLParser({ parseTagValue: false, trimValues: true });

export type XmlItem = Record<string, string | undefined>;

export class BimsError extends Error {}

/**
 * BIMS XML 응답 → item 배열.
 * - 정상: <response><header><resultCode>00 ... <body><items><item>...
 * - 인증 오류 등: <OpenAPI_ServiceResponse><cmmMsgHeader><returnAuthMsg>... (실측)
 */
export function parseBimsItems(xml: string): XmlItem[] {
  const doc = parser.parse(xml);
  const gwError = doc?.OpenAPI_ServiceResponse?.cmmMsgHeader;
  if (gwError) {
    throw new BimsError(`API 오류: ${gwError.returnAuthMsg ?? gwError.errMsg ?? '알 수 없음'}`);
  }
  const res = doc?.response;
  if (!res) throw new BimsError('API 응답 형식을 알 수 없습니다');
  const code = String(res.header?.resultCode ?? '');
  if (code !== '00') {
    throw new BimsError(`API 오류(${code}): ${res.header?.resultMsg ?? ''}`);
  }
  const items = res.body?.items?.item;
  if (!items) return [];
  return Array.isArray(items) ? items : [items];
}
