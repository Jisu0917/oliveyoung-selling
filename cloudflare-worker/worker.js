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

function normText(v){return String(v??'').toLowerCase().normalize('NFKC').replace(/\s+/g,' ').trim();}

function sameProduct(x, goodsNumber, barcode){
  const ids=[x?.goodsNumber,x?.masterGoodsNumber,x?.masterItemNumber].map(v=>String(v??''));
  if(goodsNumber && ids.includes(String(goodsNumber))) return true;
  const items=[];
  for(const v of [x?.itemNumbers,x?.barcodes,x?.barcode,x?.itemNumber]){
    if(Array.isArray(v)) items.push(...v.map(String));
    else if(v!=null) items.push(...String(v).split(/[|,\s]+/));
  }
  if(barcode && items.map(String).includes(String(barcode))) return true;
  return false;
}

function quantityOf(x){
  // 매장별 응답에서는 remainQuantity/stockLabel 계열을 우선 사용하고,
  // 기존 실시간 조회와 호환되도록 O2O 필드도 fallback으로 둔다.
  const candidates=[x?.remainQuantity,x?.o2oRemainQuantity,x?.stockQuantity,x?.quantity];
  for(const v of candidates){
    const n=Number(v);
    if(Number.isFinite(n)) return n;
  }
  const label=String(x?.stockLabel||'');
  const m=label.match(/(\d+)\s*개/);
  return m?Number(m[1]):NaN;
}

function handlingOf(x){
  if(!x) return null;
  if(typeof x.salesStoreYn==='boolean') return x.salesStoreYn;
  const status=String(x.stockStatus||'').toLowerCase();
  if(status==='not_sold'||status==='not-sold'||status==='not_salable') return false;
  if(x.o2oStockFlag===false) return false;
  if(x.o2oStockFlag===true) return true;
  return null;
}

function optionNameOf(x){
  const candidates=[x?.optionName,x?.optionValue,x?.optionText,x?.itemOptionName,x?.goodsOptionName,x?.itemName,x?.itemDesc,x?.colorName,x?.shadeName,x?.shade];
  for(const v of candidates){
    const t=String(v??'').trim();
    if(t) return t;
  }
  return '';
}

function nameMatches(a,b){
  const aa=normText(a),bb=normText(b);
  if(!aa||!bb) return false;
  return aa===bb || aa.includes(bb) || bb.includes(aa);
}

async function lookupStoreStock(product){
  const goods=String(product?.goodsNumber||'');
  const queries=[goods];
  if(product?.masterGoodsNumber) queries.push(String(product.masterGoodsNumber));
  if(product?.masterItemNumber) queries.push(String(product.masterItemNumber));
  for(const code of (Array.isArray(product?.itemNumbers)?product.itemNumbers:[]).slice(0,3)) queries.push(String(code));
  for(const keyword of queries.filter(Boolean)){
    try{
      const data=await callUpstream(OY_STOCK_URL,{size:20,dispCatNo:'',page:1,keyword,sort:'01',strNo:STORE_CODE,includeSoldOut:true});
      const list=listFrom(data);
      const match=list.find(x=>sameProduct(x,goods,keyword));
      if(match) return match;
    }catch{}
  }
  if(product?.goodsName){
    try{
      const data=await callUpstream(OY_SEARCH_URL,{size:20,dispCatNo:'',page:1,keyword:String(product.goodsName),sort:'01',strNo:STORE_CODE,includeSoldOut:true});
      const list=listFrom(data);
      const match=list.find(x=>nameMatches(x?.goodsName,product.goodsName) || sameProduct(x,goods,''));
      if(match) return match;
    }catch{}
  }
  return null;
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
          const storeHandling=handlingOf(store);
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
            current_stock:Number.isFinite(q)?q:null,
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
            const match=list.find(x=>sameProduct(x,goodsNumber,barcode));
            if(match){
              const q=quantityOf(match);
              return {barcode, optionName:optionNameOf(match), goodsName:String(match.goodsName||''), quantity:Number.isFinite(q)?q:null, storeHandling:handlingOf(match), stockStatus:String(match.stockStatus||'').toLowerCase()||((Number.isFinite(q)&&q>0)?'in_stock':'out_of_stock')};
            }
            // 바코드 검색 결과가 옵션 행으로 직접 내려오지 않는 경우,
            // 같은 barcode를 itemNumbers로 가진 응답을 한 번 더 탐색한다.
            const loose=list.find(x=>{
              const vals=[x?.itemNumbers,x?.barcodes,x?.barcode,x?.itemNumber].flatMap(v=>Array.isArray(v)?v.map(String):String(v??'').split(/[|,\s]+/));
              return vals.includes(String(barcode));
            });
            if(loose){
              const q=quantityOf(loose);
              return {barcode, optionName:optionNameOf(loose), goodsName:String(loose.goodsName||''), quantity:Number.isFinite(q)?q:null, storeHandling:handlingOf(loose), stockStatus:String(loose.stockStatus||'').toLowerCase()||((Number.isFinite(q)&&q>0)?'in_stock':'out_of_stock')};
            }
            return {barcode,optionName:'',goodsName:'',quantity:null,storeHandling:null,stockStatus:'unknown'};
          }catch{return {barcode,optionName:'',goodsName:'',quantity:null,storeHandling:null,stockStatus:'unknown'}}
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
          storeHandling:handlingOf(match),
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
