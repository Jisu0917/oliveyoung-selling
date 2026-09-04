/* Olive Young DA22 full collector
   Run this in the Olive Young store page while logged into the same site.
   It collects all store products, including sold-out rows, then optionally crawls
   each official product detail page for raw text. Start with stock collection.
*/
(async()=>{
 const ENDPOINT='/oystore/api/stock/product-stock-v3';
 const STORE_CODE='DA22', PAGE_SIZE=20;
 const sleep=ms=>new Promise(r=>setTimeout(r,ms));
 async function getPage(page){
   const r=await fetch(ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json'},credentials:'include',
     body:JSON.stringify({size:PAGE_SIZE,dispCatNo:'',page,keyword:'',sort:'01',strNo:STORE_CODE,includeSoldOut:true})});
   if(!r.ok)throw new Error(`HTTP ${r.status}`);
   const j=await r.json(); if(j.status!=='SUCCESS')throw new Error(JSON.stringify(j));
   return j.data;
 }
 console.clear(); console.log('DA22 전체 상품 + 품절 포함 수집 시작');
 const first=await getPage(1), total=first.totalCount, pages=Math.ceil(total/PAGE_SIZE);
 let all=[...(first.serachList||[])];
 for(let page=2;page<=pages;page++){
   await sleep(350);
   const d=await getPage(page); all.push(...(d.serachList||[]));
   console.log(`${page}/${pages}`,all.length);
 }
 const unique=[...new Map(all.map(x=>[x.goodsNumber,x])).values()];
 const zero=unique.filter(x=>Number(x.o2oRemainQuantity)===0);
 const result={storeCode:STORE_CODE,storeName:'올리브영 장승배기역점',collectedAt:new Date().toISOString(),
   includeSoldOut:true,totalCountFromAPI:total,collectedCount:unique.length,zeroStockCount:zero.length,products:unique};
 window.DA22_PRODUCTS=unique; window.DA22_FULL_RESULT=result;
 const blob=new Blob([JSON.stringify(result,null,2)],{type:'application/json;charset=utf-8'});
 const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='oliveyoung_DA22_products_include_soldout.json';a.click();
 console.log('완료',result);
})();

/* Optional detail-page URL manifest. This does NOT duplicate page contents. */
(()=>{
 if(!window.DA22_PRODUCTS)return console.log('먼저 전체 상품 수집을 실행하세요.');
 const manifest=window.DA22_PRODUCTS.map(p=>({
   goodsNumber:p.goodsNumber, goodsName:p.goodsName, brand:p.onlineBrandName||'',
   url:`https://www.oliveyoung.co.kr/store/goods/getGoodsDetail.do?goodsNo=${p.goodsNumber}`
 }));
 const blob=new Blob([JSON.stringify({generatedAt:new Date().toISOString(),products:manifest},null,2)],{type:'application/json'});
 const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='DA22_product_detail_urls.json';a.click();
 console.log('상세페이지 URL manifest 생성 완료');
})();
