// Stop.towards 채우기: routes.json 에서 각 정류장의 "다음 정류장 이름"을 모아 가장 많이 나온 것을 쓴다.
// 노선 마지막 정류장(다음 없음)은 건너뛴다. 여러 노선에서 다음 정류장이 갈리면 최빈값, 동률이면 이름순 첫 번째.

/** @param {import('../../packages/core/src/types').Stop[]} stops
 *  @param {import('../../packages/core/src/types').Route[]} routes */
export function fillTowards(stops, routes) {
  const votes = new Map(); // stopId → Map(nextName → count)
  for (const r of routes) {
    const seq = [...r.stops].sort((a, b) => a.seq - b.seq);
    for (let i = 0; i + 1 < seq.length; i++) {
      const cur = seq[i];
      const next = seq[i + 1];
      if (next.stopId === cur.stopId || !next.name) continue;
      if (!votes.has(cur.stopId)) votes.set(cur.stopId, new Map());
      const v = votes.get(cur.stopId);
      v.set(next.name, (v.get(next.name) ?? 0) + 1);
    }
  }
  let filled = 0;
  const out = stops.map((s) => {
    const { towards: _old, ...rest } = s;
    const v = votes.get(s.id);
    if (!v) return rest;
    const best = [...v].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ko'))[0][0];
    filled++;
    return { ...rest, towards: best };
  });
  return { stops: out, filled };
}
