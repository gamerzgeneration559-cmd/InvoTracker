package com.invotracker.invoice;

import com.invotracker.user.AppUserRepository;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import java.math.*;
import java.time.*;
import java.time.temporal.ChronoUnit;
import java.util.*;

/** Owner-scoped analytics calculated from actual non-cancelled invoices. */
@RestController
@RequestMapping("/api/smartstock/analytics")
public class SmartAnalyticsController {
 private final ProductRepository products;
 private final InvoiceRepository invoices;
 private final InvoiceLineItemRepository lines;
 private final StockMovementRepository movements;
 private final AppUserRepository users;
 public SmartAnalyticsController(ProductRepository products,InvoiceRepository invoices,InvoiceLineItemRepository lines,StockMovementRepository movements,AppUserRepository users){
  this.products=products;this.invoices=invoices;this.lines=lines;this.movements=movements;this.users=users;
 }
 public record ProductInsight(Long productId,String product,String sku,long unitsSold,BigDecimal revenue,Integer stock,Integer lowStockLevel,int suggestedOrder,BigDecimal cost,BigDecimal estimatedProfit,Double marginPercent,Long daysSinceSale,boolean neverSold,boolean costAvailable){}
 public record TrendPoint(String date,BigDecimal revenue,long unitsSold,BigDecimal estimatedProfit){}
 public record Summary(String month,BigDecimal totalSales,long unitsSold,int lowStockCount,BigDecimal estimatedGrossProfit,boolean completeProfitData,List<TrendPoint> trend,List<ProductInsight> products){}
 @GetMapping
 public Summary analytics(@RequestParam(required=false) String month,Authentication authentication){
  if(authentication==null)throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
  Long ownerId=users.findByEmailIgnoreCase(authentication.getName()).orElseThrow(()->new ResponseStatusException(HttpStatus.UNAUTHORIZED)).getId();
  YearMonth ym;
  try{ym=month==null||month.isBlank()?YearMonth.now():YearMonth.parse(month);}catch(Exception e){throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Month must be YYYY-MM");}
  if(ym.isAfter(YearMonth.now().plusMonths(1)))throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Future month not supported");
  List<Product> catalog=products.findAllByOwnerIdOrderByNameAsc(ownerId);
  Map<Long,Long> sold=new HashMap<>();Map<Long,BigDecimal> revenue=new HashMap<>();Map<Long,BigDecimal> cost=new HashMap<>();
  Map<LocalDate,BigDecimal> trendRevenue=new TreeMap<>();Map<LocalDate,Long> trendUnits=new TreeMap<>();Map<LocalDate,BigDecimal> trendProfit=new TreeMap<>();
  Map<Long,Product> catalogById=new HashMap<>();for(Product p:catalog)catalogById.put(p.getId(),p);
  BigDecimal totalSales=BigDecimal.ZERO,profit=BigDecimal.ZERO;long totalUnits=0;boolean completeProfit=true;
  for(Invoice invoice:invoices.findAllByOwnerIdAndCancelledFalseOrderByDueDateAsc(ownerId)){
   if(!YearMonth.from(invoice.getIssueDate()).equals(ym))continue;
   LocalDate date=invoice.getIssueDate();
   // Sales revenue is the pre-tax invoice amount; GST collected is not business revenue.
   totalSales=totalSales.add(invoice.getTaxableAmount());trendRevenue.merge(date,invoice.getTaxableAmount(),BigDecimal::add);
   for(InvoiceLineItem item:lines.findAllByInvoiceIdOrderByIdAsc(invoice.getId())){
    if(item.getProduct()==null)continue;
    Long id=item.getProduct().getId();Product p=catalogById.get(id);if(p==null)continue;
    long qty=item.getQuantity().longValue();if(qty<=0)continue;
    sold.merge(id,qty,Long::sum);revenue.merge(id,item.getLineTotal(),BigDecimal::add);
    totalUnits+=qty;trendUnits.merge(date,qty,Long::sum);
    if(p.getLastPurchaseCost()!=null){
     BigDecimal itemCost=p.getLastPurchaseCost().multiply(item.getQuantity());cost.merge(id,itemCost,BigDecimal::add);
     BigDecimal itemProfit=item.getLineTotal().subtract(itemCost);profit=profit.add(itemProfit);trendProfit.merge(date,itemProfit,BigDecimal::add);
    }else completeProfit=false;
   }
  }
  // Stock movements record actual sale posting times; use them for stock-aging, not invoice issue dates.
  Map<Long,Instant> lastSale=new HashMap<>();Map<Long,Instant> firstReceived=new HashMap<>();
  for(StockMovement m:movements.findAllByOwnerIdOrderByOccurredAtDesc(ownerId)){
   if("SALE".equals(m.kind))lastSale.merge(m.productId,m.occurredAt,(a,b)->a.isAfter(b)?a:b);
   if("RECEIPT".equals(m.kind))firstReceived.merge(m.productId,m.occurredAt,(a,b)->a.isBefore(b)?a:b);
  }
  int low=0;List<ProductInsight> result=new ArrayList<>();
  for(Product p:catalog){
   long units=sold.getOrDefault(p.getId(),0L);BigDecimal rev=revenue.getOrDefault(p.getId(),BigDecimal.ZERO);
   if(p.getStock()<=p.getLowStockLevel())low++;
   int reorder=(int)Math.max(0,Math.min(1000000,Math.ceil(units*37.0/ym.lengthOfMonth())-p.getStock()));
   BigDecimal c=cost.get(p.getId()),estimated=c==null?null:rev.subtract(c);
   Double margin=c==null||rev.signum()==0?null:estimated.multiply(BigDecimal.valueOf(100)).divide(rev,2,RoundingMode.HALF_UP).doubleValue();
   Instant last=lastSale.get(p.getId());Instant origin=last!=null?last:firstReceived.get(p.getId());
   Long days=origin==null?null:Math.max(0,ChronoUnit.DAYS.between(origin,Instant.now()));
   result.add(new ProductInsight(p.getId(),p.getName(),p.getSku(),units,rev,p.getStock(),p.getLowStockLevel(),reorder,p.getLastPurchaseCost(),estimated,margin,days,last==null,p.getLastPurchaseCost()!=null));
  }
  List<TrendPoint> trend=new ArrayList<>();for(LocalDate d=ym.atDay(1);!d.isAfter(ym.atEndOfMonth());d=d.plusDays(1)){
   trend.add(new TrendPoint(d.toString(),trendRevenue.getOrDefault(d,BigDecimal.ZERO),trendUnits.getOrDefault(d,0L),trendProfit.getOrDefault(d,BigDecimal.ZERO)));
  }
  return new Summary(ym.toString(),totalSales,totalUnits,low,completeProfit?profit:null,completeProfit,trend,result);
 }
}
