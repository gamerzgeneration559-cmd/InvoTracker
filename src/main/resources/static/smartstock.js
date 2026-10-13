/* SmartStock upgrade: browser OCR interpretation + server-authoritative receipts. */
(()=>{
 const el=id=>document.getElementById(id);
 const note=(msg,ok=false)=>{const e=el('smartReceiptMessage');e.textContent=msg;e.style.color=ok?'#16803c':'#b42318';};
 let catalog=[];
 async function refreshCatalog(){catalog=await api('/api/products');}
 function addLine(data={}){
  const row=document.createElement('div');row.className='smartstock-line';
  const field=(label,key,type='text')=>{const wrap=document.createElement('label');wrap.textContent=label;const input=document.createElement('input');input.dataset.key=key;input.type=type;input.value=data[key]??'';if(type==='number'){input.min='0';input.step=key==='price'?'0.01':'1';}wrap.append(input);row.append(wrap);return input;};
  const match=document.createElement('label');match.textContent='Catalog match';const sel=document.createElement('select');sel.dataset.key='productId';sel.add(new Option('Create new product',''));for(const p of catalog)sel.add(new Option(`${p.name} (${p.sku}) · ${p.stock} in stock`,p.id));match.append(sel);row.append(match);
  const name=field('Product name','name');const sku=field('SKU / barcode','sku');const qty=field('Received quantity','quantity','number');const price=field('Unit price ₹','price','number');
  if(data.productId)sel.value=String(data.productId);
  sel.addEventListener('change',()=>{const p=catalog.find(p=>String(p.id)===sel.value);if(p){name.value=p.name;sku.value=p.sku;price.value=p.price;}});
  const del=document.createElement('button');del.type='button';del.textContent='Remove';del.addEventListener('click',()=>row.remove());row.append(del);el('smartLines').append(row);
 }
 function parse(text){
  const lines=text.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  // OCR may omit the company header entirely. A domain is only a suggestion.
  const labeled=lines.map(x=>x.match(/^(?:supplier|vendor|sold\s+by|from)\s*[:\-]\s*(.+)$/i)).find(Boolean);
  const mail=text.match(/\b[A-Z0-9._%+-]+@([A-Z0-9.-]+)\.[A-Z]{2,}\b/i);
  const domain=mail?.[1]?.split('.')[0]||'';
  const supplier=labeled?.[1]?.trim()||(domain?domain.replace(/(distributors|traders|supplies|enterprises|store|shop)$/i,' $1').replace(/\b\w/g,c=>c.toUpperCase()).trim():'');
  const inv=text.match(/(?:invoice\s*(?:number|no\.?|#)|bill\s*(?:number|no\.?|#))\s*[:#-]?\s*([A-Z0-9\/-]{2,})/i);
  const products=[];
  for(const original of lines){
   if(/^(?:subtotal|total|grand total|tax|gst|amount|invoice|date|supplier|bill to|ship to|terms)/i.test(original))continue;
   const line=original.replace(/^[\s|\[=]+/,'').trim();
   let name,qty,price;
   // Printed invoice table: [row no] DESCRIPTION HSN(8 digits) QTY pcs RATE DISCOUNT TAXABLE GST% ...
   // HSN separates the description from quantity; avoid mistaking HSN for quantity.
   const table=line.match(/^(?:\d{1,3}[.\s]+)?(.{3,100}?)\s+(\d{6,8})\s+(\d{1,6}(?:\.\d+)?)\s*(?:pcs?|pieces?|nos?|units?|kg|g|ltr|litres?|boxes?)?\s+([\d,]+(?:\.\d{1,2})?)(?=\s|$)/i);
   if(table){name=table[1].trim();qty=Number(table[3]);price=Number(table[4].replaceAll(',',''));}
   else {
    // Simple invoice line: DESCRIPTION QTY UNIT_PRICE (no HSN).
    const basic=line.match(/^(?:\d{1,3}[.\s]+)?(.{3,75}?)\s+(\d{1,6})\s+(?:₹\s*)?([\d,]+(?:\.\d{1,2})?)(?:\s|$)/);
    if(!basic)continue;
    name=basic[1].trim();qty=Number(basic[2]);price=Number(basic[3].replaceAll(',',''));
   }
   if(!name||qty<=0||qty>1000000||!Number.isFinite(price)||/^(?:hsn|s\.?no|product description)/i.test(name))continue;
   const normalize=x=>String(x||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
   const matched=catalog.find(p=>normalize(p.name)===normalize(name));
   products.push({name,sku:matched?.sku||'',quantity:qty,price,productId:matched?.id||null});
  }
  // An invoice with "Bill To" is not necessarily a sale for the scanning business.
  // Direction depends on whether the logged-in business is supplier or recipient.
  const classification='Direction unverified — confirm this is a supplier purchase before receiving stock';
  return {supplier,invoiceNumber:inv?.[1]||'',products,classification,supplierSuggested:!labeled&&!!domain};
 }
 el('smartParse')?.addEventListener('click',async()=>{
  try{await refreshCatalog();const raw=el('ocrResult').value;if(!raw.trim())throw Error('Scan or upload an invoice first.');
   const result=parse(raw);el('smartSupplier').value=result.supplier;el('smartInvoiceNo').value=result.invoiceNumber;el('smartLines').replaceChildren();result.products.forEach(addLine);
   if(!result.products.length)addLine();el('smartDetected').textContent=`Document classification: ${result.classification}. Recognized ${result.products.length} possible product line(s). ${result.supplierSuggested?'Supplier name is guessed from the email domain because OCR missed the heading; verify it against the original invoice. ':''}Check all amounts against the image before receiving stock.`;
   note('Review all fields. Unknown products will be created only when receipt is confirmed.');
  }catch(e){note(e.message);}
 });
 el('smartAddLine')?.addEventListener('click',async()=>{try{if(!catalog.length)await refreshCatalog();addLine();}catch(e){note(e.message);}});
 el('smartReceive')?.addEventListener('click',async()=>{
  const button=el('smartReceive');try{
   const supplier=el('smartSupplier').value.trim(),invoiceNumber=el('smartInvoiceNo').value.trim();
   const items=[...el('smartLines').children].map(row=>{const get=k=>row.querySelector(`[data-key="${k}"]`)?.value||'';return {name:get('name').trim(),sku:get('sku').trim(),quantity:Number(get('quantity')),price:Number(get('price')),productId:get('productId')?Number(get('productId')):null};});
   if(!supplier||!invoiceNumber||!items.length||items.some(i=>!i.name||!Number.isInteger(i.quantity)||i.quantity<=0||!Number.isFinite(i.price)||i.price<0))throw Error('Check supplier, invoice number, product names, quantities and prices.');
   if(!confirm(`Confirm actual receipt of ${items.reduce((s,i)=>s+i.quantity,0)} units from ${supplier}? Inventory will increase.`))return;
   button.disabled=true;const result=await api('/api/smartstock/receive',{method:'POST',body:JSON.stringify({supplier,invoiceNumber,items})});
   note(`Receipt saved: ${result.unitsReceived} units across ${result.productTypes} lines. ${result.productsCreated} new catalog product(s).`,true);
   await refreshCatalog();await showMonthly();
  }catch(e){note(e.message);}finally{button.disabled=false;}
 });
 async function showMonthly(){
  const month=el('smartMonth').value;const rows=el('smartStatsRows');rows.replaceChildren();
  const data=await api('/api/smartstock/monthly'+(month?'?month='+encodeURIComponent(month):''));
  const sold=data.map(p=>p.unitsSold).filter(v=>v>0).sort((a,b)=>a-b);
  const median=sold.length?sold[Math.floor((sold.length-1)/2)]:0;
  for(const p of data){
   const category=p.unitsSold===0?'No sales':p.unitsSold>=median&&p.unitsSold>0?'Fast-moving':'Slow-moving';
   const tr=rows.insertRow();for(const v of [p.product,p.unitsSold,money(p.revenue),p.stock,p.suggestedOrder,category]){const td=tr.insertCell();td.textContent=v;}
  }
  if(!data.length){const tr=rows.insertRow();tr.insertCell().textContent='No catalog products yet.';}
 }
 el('smartMonth').value=[new Date().getFullYear(),String(new Date().getMonth()+1).padStart(2,'0')].join('-');
 document.addEventListener('invotracker:inventory-changed',()=>showMonthly().catch(e=>console.warn('Monthly statistics refresh failed:',e)));
 el('smartStatsRefresh')?.addEventListener('click',()=>showMonthly().catch(e=>note(e.message)));
 document.querySelectorAll('[data-page="products"]').forEach(link=>link.addEventListener('click',()=>showMonthly().catch(console.warn)));
 const zoom=el('smartZoom');zoom?.addEventListener('input',async()=>{
  const video=el('ocrVideo'),track=video.srcObject?.getVideoTracks?.()[0];if(!track)return;
  try{await track.applyConstraints({advanced:[{zoom:Number(zoom.value)}]});el('zoomNote').textContent=`Zoom ${Number(zoom.value).toFixed(1)}×`;}catch(e){el('zoomNote').textContent='Zoom adjustment not supported: '+e.message;}
 });
 el('scanProductBarcode')?.addEventListener('click',async()=>{
  const target=el('barcodeFeedback');try{
   if(!('BarcodeDetector' in window))throw Error('Barcode scanning is unavailable in this browser. Enter SKU manually.');
   const video=el('ocrVideo');if(!video.videoWidth)throw Error('Start the camera first.');
   const detector=new BarcodeDetector();const found=await detector.detect(video);if(!found.length)throw Error('No barcode found. Move closer, adjust zoom and retry.');
   const code=found[0].rawValue;target.textContent='Scanned barcode: '+code;
   const row=el('smartLines').lastElementChild;if(row)row.querySelector('[data-key="sku"]').value=code;
  }catch(e){target.textContent=e.message;}
 });
})();
