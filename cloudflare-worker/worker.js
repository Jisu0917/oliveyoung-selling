const STORE_CODE = 'DA22';
const OY_STOCK_URL = 'https://m.oliveyoung.co.kr/oystore/api/stock/product-stock-v3';
const OY_SEARCH_URL = 'https://m.oliveyoung.co.kr/oystore/api/stock/product-search-v3';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept',
  'Access-Control-Max-Age': '86400',
  'Cache-Control': 'no-store'
};

function json(data, status=200){
  return new Response(JSON.stringify(data), {
    status,
    headers:{'Content-Type':'application/json; charset=utf-8', ...cors}
  });
}

function upstreamHeaders(){
  return {
    'Content-Type':'application/json;charset=UTF-8',
    'Accept':'application/json, text/plain, */*',
    'Origin':'https://m.oliveyoung.co.kr',
    'Referer':'https://m.oliveyoung.co.kr/',
    'User-Agent':'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/128 Mobile Safari/537.36'
  };
}

function listFrom(json){
  const d=json?.data;
  if(Array.isArray(d?.serachList)) return d.serachList;
  if(Array.isArray(d?.searchList)) return d.searchList;
  if(Array.isArray(d?.list)) return d.list;
  if(Array.isArray(json?.products)) return json.products;
  return [];
}

function sameProduct(x, goodsNumber, barcode){
  const ids=[x?.goodsNumber,x?.masterGoodsNumber,x?.masterItemNumber].map(v=>String(v??''));
  if(ids.includes(String(goodsNumber))) return true;
  const items=String(x?.itemNumbers??'').split(/[|,\s]+/).map(v=>v.trim()).filter(Boolean);
  if(barcode && items.includes(String(barcode))) return true;
  return false;
}

function quantityOf(x){
  const candidates=[x?.o2oRemainQuantity,x?.remainQuantity,x?.stockQuantity,x?.quantity];
  for(const v of candidates){
    const n=Number(v);
    if(Number.isFinite(n)) return n;
  }
  return NaN;
}

async function callUpstream(url, body){
  const r=await fetch(url, {
    method:'POST',
    headers:upstreamHeaders(),
    body:JSON.stringify(body),
    cf:{cacheTtl:0, cacheEverything:false}
  });
  const text=await r.text();
  let data={};
  try{data=JSON.parse(text)}catch{}
  if(!r.ok) throw new Error(`올리브영 API HTTP ${r.status}`);
  return data;
}

export default {
  async fetch(request){
    const url=new URL(request.url);
    if(request.method==='OPTIONS') return new Response(null,{status:204,headers:cors});
    if(request.method!=='GET') return json({ok:false,message:'GET만 지원합니다.'},405);

    if(url.pathname==='/api/catalog-search'){
      const keyword=url.searchParams.get('keyword')?.trim()||'';
      const page=Math.max(1,Number(url.searchParams.get('page')||1));
      if(!keyword) return json({ok:false,message:'keyword가 필요합니다.'},400);
      try{
        const globalBody={size:20,dispCatNo:'',page,keyword,sort:'01',includeSoldOut:true};
        const storeBody={...globalBody,strNo:STORE_CODE};
        const [globalData,storeData]=await Promise.all([
          callUpstream(OY_SEARCH_URL,globalBody),
          callUpstream(OY_SEARCH_URL,storeBody)
        ]);
        const globalList=listFrom(globalData);
        const storeList=listFrom(storeData);
        // product-search-v3의 매장 검색 결과는 상품/옵션 매칭이 불완전할 수 있으므로
        // 각 상품의 goodsNumber를 product-stock-v3에 직접 재조회하여 현재 매장 상태를 확인한다.
        const directResults=await Promise.all(globalList.map(async x=>{
          try{
            const data=await callUpstream(OY_STOCK_URL,{size:20,dispCatNo:'',page:1,keyword:String(x?.goodsNumber||''),sort:'01',strNo:STORE_CODE,includeSoldOut:true});
            const list=listFrom(data);
            return list.find(y=>sameProduct(y,String(x?.goodsNumber||''),''))||null;
          }catch{return null}
        }));
        const storeMap=new Map();
        storeList.forEach(x=>storeMap.set(String(x?.goodsNumber||''),x));
        directResults.forEach(x=>{if(x?.goodsNumber)storeMap.set(String(x.goodsNumber),x)});
        const products=globalList.map((x,idx)=>{
          const store=directResults[idx]||storeMap.get(String(x?.goodsNumber||''));
          const q=store?quantityOf(store):0;
          const rawHandling=store?.salesStoreYn;
          const storeHandling=typeof rawHandling==='boolean' ? rawHandling : (store ? store?.o2oStockFlag!==false : false);
          const stockStatus=store?.stockStatus || (q>0?'in_stock':'out_of_stock');
          return {
            goodsNumber:x.goodsNumber,
            goodsName:x.goodsName,
            brand:x.onlineBrandName||x.brand||'',
            price:Number(x.priceToPay)||0,
            originalPrice:Number(x.originalPrice)||0,
            imagePath:x.imagePath||x.goodsThumbnailPath||'',
            barcode_master:String(x.masterGoodsNumber||x.masterItemNumber||''),
            barcodes_all:Array.isArray(x.itemNumbers)?x.itemNumbers:[],
            main_category:x?.mainDisplayCategory?.middleCategoryName||'',
            sub_category:x?.mainDisplayCategory?.lowerCategoryName||'',
            leaf_category:x?.mainDisplayCategory?.leafCategoryName||'',
            standard_category:x?.standardCategory?.lowerCategoryName||'',
            current_stock:q,
            store_handling:storeHandling,
            stockStatus,
            o2oStockFlag:store?.o2oStockFlag ?? null,
            stock_checked_at:new Date().toISOString()
          };
        });
        return json({ok:true,keyword,products,totalCount:Number(globalData?.data?.totalCount||globalData?.data?.count||products.length),source:'oliveyoung'});
      }catch(e){
        return json({ok:false,message:e?.message||'상품 검색 실패'},502);
      }
    }

    if(url.pathname==='/api/option-stock'){
      const goodsNumber=url.searchParams.get('goodsNumber')?.trim()||'';
      const barcodes=String(url.searchParams.get('barcodes')||'').split(',').map(x=>x.trim()).filter(Boolean).slice(0,30);
      if(!goodsNumber||!barcodes.length) return json({ok:false,message:'goodsNumber와 barcodes가 필요합니다.'},400);
      try{
        const options=await Promise.all(barcodes.map(async barcode=>{
          try{
            const data=await callUpstream(OY_STOCK_URL,{size:20,dispCatNo:'',page:1,keyword:barcode,sort:'01',strNo:STORE_CODE,includeSoldOut:true});
            const list=listFrom(data);
            const match=list.find(x=>sameProduct(x,goodsNumber,barcode))||list.find(x=>String(x?.goodsNumber||'')===goodsNumber);
            const q=match?quantityOf(match):0;
            return {barcode,quantity:Number.isFinite(q)?q:null,storeHandling:match?(typeof match?.salesStoreYn==='boolean'?match.salesStoreYn:match?.o2oStockFlag!==false):false,stockStatus:match?.stockStatus||(q>0?'in_stock':'out_of_stock')};
          }catch{return {barcode,quantity:null,storeHandling:null,stockStatus:'unknown'}}
        }));
        return json({ok:true,goodsNumber,options,checkedAt:new Date().toISOString(),source:'oliveyoung'});
      }catch(e){return json({ok:false,message:e?.message||'옵션 재고 조회 실패'},502)}
    }

    if(url.pathname!=='/api/stock') return json({ok:false,message:'Not Found'},404);

    const goodsNumber=url.searchParams.get('goodsNumber')?.trim();
    const goodsName=url.searchParams.get('goodsName')?.trim() || '';
    const barcode=url.searchParams.get('barcode')?.trim() || '';
    const storeCode=url.searchParams.get('storeCode')?.trim() || STORE_CODE;
    if(!goodsNumber) return json({ok:false,message:'goodsNumber가 필요합니다.'},400);
    if(storeCode!==STORE_CODE) return json({ok:false,message:`지원 매장은 ${STORE_CODE}입니다.`},400);

    const baseBody={size:20,dispCatNo:'',page:1,sort:'01',strNo:STORE_CODE,includeSoldOut:true};
    const attempts=[
      [OY_STOCK_URL,{...baseBody,keyword:goodsNumber}],
      [OY_SEARCH_URL,{...baseBody,keyword:goodsNumber}],
      ...(goodsName ? [[OY_STOCK_URL,{...baseBody,keyword:goodsName}],[OY_SEARCH_URL,{...baseBody,keyword:goodsName}]] : [])
    ];

    let lastError='';
    for(const [endpoint,body] of attempts){
      try{
        const data=await callUpstream(endpoint,body);
        const list=listFrom(data);
        const match=list.find(x=>sameProduct(x,goodsNumber,barcode));
        if(!match) continue;
        const quantity=quantityOf(match);
        return json({
          ok:true,
          goodsNumber,
          storeCode:STORE_CODE,
          quantity:Number.isFinite(quantity)?quantity:null,
          stockStatus:match?.stockStatus || (Number.isFinite(quantity)?(quantity>0?'in_stock':'out_of_stock'):'unknown'),
          storeHandling:typeof match?.salesStoreYn==='boolean' ? match.salesStoreYn : (match ? match?.o2oStockFlag!==false : null),
          o2oStockFlag:match?.o2oStockFlag ?? null,
          checkedAt:new Date().toISOString(),
          source:'oliveyoung',
          endpoint:endpoint.endsWith('product-stock-v3')?'product-stock-v3':'product-search-v3'
        });
      }catch(e){
        lastError=e?.message||String(e);
      }
    }
    return json({ok:false,message:lastError||'상품을 올리브영 API 응답에서 확인하지 못했습니다.'},502);
  }
};
