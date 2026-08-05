# My Record (마이리코드)

도서·영화·웹툰 등 다양한 콘텐츠를 기록하는 PC 프로그램 (Electron + React + Tailwind CSS)

## 실행 방법

```powershell
cd C:\Users\user\Desktop\Mrecord
npm install
npm run dev
```

## .exe 빌드

```powershell
npm run dist
```

`release` 폴더에 설치 파일이 생성됩니다.

## 아이콘

| 파일 | 용도 |
|------|------|
| `resources/icons/icon-white-bg.png` | 프로그램 아이콘 (.exe) |
| `resources/icons/icon-transparent.png` | 앱 내 메인 로고 (배경 없음) |

아이콘 재생성: `powershell -ExecutionPolicy Bypass -File scripts/generate-icons.ps1`

## 주요 기능

- 8개 탭 (기록, 캘린더, 생각한줄, 갤러리, 분야, 연도, 인생책, 출판사)
- 갤러리 카드 클릭 → 사이드 상세 패널 (크기 조절 가능) → 전체보기
- 속성 드래그 순서 변경 / 이름 바꾸기 / 복제 / 삭제
- 시리즈 박스 (권·화·편 등 단위 변경)
- 클립보드 이미지 붙여넣기 (Ctrl+V)
- 테마 프리셋 + 사용자 지정 색상
- 태그 파스텔 프리셋 4색 + 사용자 지정 2색
