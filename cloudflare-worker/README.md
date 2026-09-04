# DA22 실시간 재고 Cloudflare Worker

이 Worker는 브라우저가 올리브영 재고 API를 직접 호출하지 않도록 중간에서 요청을 받아 서버 측 `fetch()`로 전달합니다. Cloudflare Workers는 서버 측 HTTP `fetch()`를 지원하며, CORS 프록시 패턴도 공식 문서에 안내되어 있습니다.

## 배포

Cloudflare 로그인 후 이 폴더에서:

```bash
npx wrangler login
npx wrangler deploy
```

배포 후 `https://oy-da22-stock-proxy.<계정>.workers.dev/api/stock` 형태의 주소를 얻습니다.

그 주소를 상위 폴더 `config.js`의 `STOCK_PROXY_URL`에 넣습니다.

## 테스트

브라우저에서 다음처럼 호출할 수 있습니다.

```text
https://oy-da22-stock-proxy.<계정>.workers.dev/api/stock?goodsNumber=상품번호&storeCode=DA22
```

성공 응답 예:

```json
{
  "ok": true,
  "goodsNumber": "상품번호",
  "storeCode": "DA22",
  "quantity": 7,
  "stockStatus": "in_stock",
  "checkedAt": "2026-09-05T00:00:00.000Z",
  "source": "oliveyoung"
}
```

## 참고

Worker가 배포되어도 올리브영 측에서 특정 요청을 차단하거나 API 형식이 바뀌면 실패할 수 있습니다. 앱은 이 경우 기존 DB의 재고 스냅샷으로 폴백합니다.
