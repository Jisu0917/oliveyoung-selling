# 올영 직원 판매 도우미 · DA22 v8

v8의 핵심 변경은 **실시간 재고 조회를 브라우저에서 올리브영 API로 직접 호출하지 않고 Cloudflare Worker 프록시를 거치도록 변경한 것**입니다. 정적 GitHub Pages에서는 브라우저 CORS 때문에 직접 호출이 막힐 수 있으므로, 앱 → 프록시 → 올리브영 API 구조를 사용합니다.

## 폴더
- `index.html`: 앱
- `db.json`: DA22 상품/분석 DB
- `config.js`: 실시간 재고 프록시 주소 설정
- `cloudflare-worker/worker.js`: 프록시 코드
- `cloudflare-worker/wrangler.toml`: Worker 배포 설정
- `fonts/`: Mallang 폰트
- `icons/`: 토끼 UI 아이콘

## 가장 쉬운 배포 방법: GitHub Pages + 별도 Cloudflare Worker

### 1. Cloudflare Worker 만들기
`cloudflare-worker/` 폴더의 `worker.js`를 Cloudflare Worker로 배포합니다. Wrangler를 사용한다면 해당 폴더에서:

```bash
npx wrangler deploy
```

배포 후 `https://이름.계정.workers.dev` 형태의 주소가 생깁니다.

### 2. `config.js` 수정
아래처럼 Worker 주소를 입력합니다.

```js
window.OY_CONFIG = {
  STOCK_PROXY_URL: 'https://이름.계정.workers.dev/api/stock'
};
```

**중요:** 주소 끝에 `/api/stock`까지 넣습니다.

### 3. GitHub Pages에 다시 push
기존 v7 파일을 덮어씌우면 됩니다.

## Cloudflare Pages로 앱 자체를 옮기는 경우
`config.js`의 `STOCK_PROXY_URL`을 빈 문자열로 두고, Cloudflare Pages Advanced Mode의 `_worker.js` 또는 Pages Functions에서 `/api/stock`을 처리하도록 구성할 수 있습니다. Cloudflare 공식 문서상 Advanced Mode는 `_worker.js`가 API 요청을 처리하고 그 외 요청은 `env.ASSETS.fetch(request)`로 정적 파일을 제공하는 구조입니다.

## 실시간 재고 동작
- 매장 코드: `DA22`
- 상품번호(`goodsNumber`)를 기준으로 조회
- 실패 시 기존 `db.json` 재고 스냅샷을 그대로 보여줌
- 조회 시각을 함께 표시
- 프록시는 브라우저가 아니라 서버 측에서 올리브영 API에 요청하므로 CORS 문제를 피하는 구조

## 주의
프록시를 배포하기 전에는 `실시간 재고 조회`가 정상 동작한다고 볼 수 없습니다. Worker가 실제로 배포되고 올리브영 서버 응답이 허용되어야 합니다.
