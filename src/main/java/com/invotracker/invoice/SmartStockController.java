package com.invotracker.invoice;
import com.invotracker.user.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.security.core.Authentication;
import org.springframework.http.*;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.transaction.annotation.Transactional;
import java.util.*;
import java.time.*;
import java.math.*;
@RestController @RequestMapping("/api/smartstock") public class SmartStockController {
 private final ProductRepository products; private final AppUserRepository users; private final PurchaseReceiptRepository receipts; private final StockMovementRepository movements; private final InvoiceRepository invoices; private final InvoiceLineItemRepository lines;
 public SmartStockController(ProductRepository products,AppUserRepository users,PurchaseReceiptRepository receipts,StockMovementRepository movements,InvoiceRepository invoices,InvoiceLineItemRepository lines){this.products=products;this.users=users;this.receipts=receipts;this.movements=movements;this.invoices=invoices;this.lines=lines;}
 private Long owner(Authentication auth){return users.findByEmailIgnoreCase(auth.getName()).orElseThrow(()->new ResponseStatusException(HttpStatus.UNAUTHORIZED)).getId();}
 public record IncomingItem(String name,String sku,String barcode,Integer quantity,BigDecimal price,Long productId){}
 public record ReceiveRequest(String supplier,String invoiceNumber,List<IncomingItem> items){}
 public record ReceiptResult(Long receiptId,int productTypes,int unitsReceived,int productsCreated){}
 @PostMapping("/receive") @Transactional public ReceiptResult receive(@RequestBody ReceiveRequest request,Authentication auth){
  Long ownerId=owner(auth);
  if(request.supplier()==null||request.supplier().isBlank()||request.supplier().length()>200||request.invoiceNumber()==null||request.invoiceNumber().isBlank()||request.invoiceNumber().length()>200||request.items()==null||request.items().isEmpty()||request.items().size()>100)throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Supplier, invoice number and 1–100 items required");
  String sk=request.supplier().trim().toLowerCase(Locale.ROOT),ik=request.invoiceNumber().trim().toLowerCase(Locale.ROOT);
  if(receipts.existsByOwnerIdAndSupplierKeyAndInvoiceKey(ownerId,sk,ik))throw new ResponseStatusException(HttpStatus.CONFLICT,"This supplier invoice has already been received");
  // Validate everything before creating inventory records; transaction rolls back on errors.
  for(IncomingItem item:request.items()){
   if(item.quantity()==null||item.quantity()<=0||item.quantity()>1000000||item.name()==null||item.name().isBlank()||item.name().length()>200||item.price()==null||item.price().signum()<0||item.price().compareTo(new BigDecimal("999999999"))>0)throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Invalid received item");
  }
  PurchaseReceipt receipt=receipts.saveAndFlush(new PurchaseReceipt(ownerId,request.supplier().trim(),request.invoiceNumber().trim()));
  int units=0,created=0;
  for(IncomingItem item:request.items()){
   Product product=null;
   if(item.productId()!=null)product=products.lockOwned(item.productId(),ownerId).orElseThrow(()->new ResponseStatusException(HttpStatus.BAD_REQUEST,"Product not found"));
   if(product==null&&item.sku()!=null&&!item.sku().isBlank())product=products.findByOwnerIdAndSku(ownerId,item.sku().trim()).orElse(null);
   if(product==null){
    String sku=item.sku()==null||item.sku().isBlank()?"SCAN-"+UUID.randomUUID().toString().substring(0,12):item.sku().trim();
    product=new Product();product.setOwner(users.getReferenceById(ownerId));product.setName(item.name().trim());product.setSku(sku);product.setPrice(item.price().doubleValue());product.setStock(0);product.setLowStockLevel(5);product.setBarcode(item.barcode());product=products.saveAndFlush(product);created++;
   }
   if((long)product.getStock()+item.quantity()>Integer.MAX_VALUE)throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Stock limit exceeded");
   product.setStock(product.getStock()+item.quantity());product.setLastPurchaseCost(item.price());products.save(product);
   movements.save(new StockMovement(ownerId,product.getId(),item.quantity(),"RECEIPT",String.valueOf(receipt.id)));
   units+=item.quantity();
  }
  return new ReceiptResult(receipt.id,request.items().size(),units,created);
 }
 public record ProductStat(Long productId,String product,String sku,long unitsSold,BigDecimal revenue,int stock,int suggestedOrder){}
 @GetMapping("/monthly") public List<ProductStat> monthly(@RequestParam(required=false) String month,Authentication auth){
  Long ownerId=owner(auth);YearMonth target;
  try{target=month==null||month.isBlank()?YearMonth.now():YearMonth.parse(month);}catch(Exception ex){throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Use month YYYY-MM");}
  Map<Long,long[]> counts=new HashMap<>(); Map<Long,BigDecimal> revenues=new HashMap<>();
  for(Invoice invoice:invoices.findAllByOwnerIdAndCancelledFalseOrderByDueDateAsc(ownerId)){
   if(!YearMonth.from(invoice.getIssueDate()).equals(target))continue;
   for(InvoiceLineItem item:lines.findAllByInvoiceIdOrderByIdAsc(invoice.getId())){
    if(item.getProduct()==null)continue;Long id=item.getProduct().getId();
    counts.computeIfAbsent(id,k->new long[1])[0]+=item.getQuantity().longValue();
    revenues.merge(id,item.getLineTotal(),BigDecimal::add);
   }
  }
  return products.findAllByOwnerIdOrderByNameAsc(ownerId).stream().map(product->{
   long sold=counts.getOrDefault(product.getId(),new long[1])[0];
   // 30-day target + 7-day buffer, minus available stock; demand based on selected month.
   int recommended=(int)Math.max(0,Math.min(1000000,Math.ceil(sold*37.0/target.lengthOfMonth())-product.getStock()));
   return new ProductStat(product.getId(),product.getName(),product.getSku(),sold,revenues.getOrDefault(product.getId(),BigDecimal.ZERO),product.getStock(),recommended);
  }).sorted(Comparator.comparingLong(ProductStat::unitsSold).reversed()).toList();
 }
 @GetMapping("/movements") public List<StockMovement> movements(Authentication auth){return movements.findTop100ByOwnerIdOrderByOccurredAtDesc(owner(auth));}
}
