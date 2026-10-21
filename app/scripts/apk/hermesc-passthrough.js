// hermesc 대체: 이 PC는 Windows 보안 정책(Device Guard)이 서명 없는 hermesc.exe 실행을 막는다.
// Hermes 엔진은 바이트코드가 아닌 일반 JS 번들도 실행할 수 있으므로, 입력 번들을 출력 경로로 그대로 복사한다.
// 받는 인자: -w -emit-binary -max-diagnostic-width=80 -out <출력> <입력> [플래그…]
const fs = require('node:fs');

const args = process.argv.slice(2);
const outIdx = args.indexOf('-out');
if (outIdx < 0 || !args[outIdx + 1]) {
  console.error('hermesc-passthrough: -out 인자가 없습니다');
  process.exit(1);
}
const out = args[outIdx + 1];
const input = args.find((a, i) => i !== outIdx + 1 && !a.startsWith('-'));
if (!input) {
  console.error('hermesc-passthrough: 입력 번들 경로가 없습니다');
  process.exit(1);
}
fs.copyFileSync(input, out);
console.log(`hermesc-passthrough: ${input} → ${out} (바이트코드 변환 생략)`);
