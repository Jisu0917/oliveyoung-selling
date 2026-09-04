// 실시간 재고 프록시 주소
// 1) Cloudflare Pages/Workers와 같은 도메인에서 /api/stock을 쓰면 빈 문자열 유지
// 2) GitHub Pages에서 별도 Cloudflare Worker를 쓰면 Worker 주소를 입력
//    예: https://oy-da22-stock-proxy.<내계정>.workers.dev
window.OY_CONFIG = {
  STOCK_PROXY_URL: ''
};
