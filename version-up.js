const fs = require('fs');
const path = require('path');

// 1. 새로운 버전 가져오기
const newVersion = process.argv[2];

if (!newVersion) {
  console.error('사용법: node version-up.js <새_버전>');
  console.error('예: node version-up.js 1.0.14');
  process.exit(1);
}

// 2. manifest.json 업데이트
const manifestPath = path.join(__dirname, 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const oldVersion = manifest.version;
manifest.version = newVersion;
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(`✅ manifest.json: ${oldVersion} -> ${newVersion}`);

// 3. README.md 업데이트
const readmePath = path.join(__dirname, 'README.md');
let readme = fs.readFileSync(readmePath, 'utf8');
const readmeOldTitle = `# Page Capture Extension (v${oldVersion})`;
const readmeNewTitle = `# Page Capture Extension (v${newVersion})`;

if (readme.includes(readmeOldTitle)) {
  readme = readme.replace(readmeOldTitle, readmeNewTitle);
  fs.writeFileSync(readmePath, readme);
  console.log(`✅ README.md 버전 업데이트 완료`);
} else {
  console.log(`⚠️ README.md에서 이전 버전 제목을 찾지 못했습니다.`);
}

console.log('\n이제 git add . && git commit -m "chore: bump version to ' + newVersion + '" && git push 를 실행하세요!');
