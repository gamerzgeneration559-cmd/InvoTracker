package com.invotracker.invoice;

import com.invotracker.user.AppUser;
import com.invotracker.user.AppUserRepository;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/invoices")
public class InvoiceController {
    private final InvoiceRepository invoices;
    private final ProductRepository products;
    private final StockMovementRepository movements;
    private final AppUserRepository users;
    private final InvoiceRiskService riskService;
    private final InvoiceLineItemRepository lineItems;
    private final InvoiceFraudService fraudService;
    private final InvoiceAuditService audit;
    private final InvoiceAuditRepository auditRepository;
    private final InvoiceHealthService health;
    private final InvoicePaymentRepository paymentRepository;
    public InvoiceController(InvoiceRepository invoices, AppUserRepository users, InvoiceRiskService riskService, InvoiceLineItemRepository lineItems, InvoiceFraudService fraudService, InvoiceAuditService audit, InvoiceAuditRepository auditRepository, InvoiceHealthService health, InvoicePaymentRepository paymentRepository, ProductRepository products, StockMovementRepository movements) {
        this.invoices = invoices; this.products=products;this.movements=movements;
        this.users = users;
        this.riskService = riskService;
        this.lineItems = lineItems;
        this.fraudService = fraudService;this.audit=audit;this.auditRepository=auditRepository;this.health=health;this.paymentRepository=paymentRepository;
    }
    public record LineRequest(@NotBlank @Size(max=200) String description,
                              @NotNull @DecimalMin("0.001") @Digits(integer=9,fraction=3) BigDecimal quantity,
                              @NotNull @DecimalMin("0.00") @Digits(integer=10,fraction=2) BigDecimal unitPrice,
                              @DecimalMin("0.00") @DecimalMax("100.00") BigDecimal discountPercent,
                              @DecimalMin("0.00") @DecimalMax("28.00") BigDecimal gstRate, Long productId) {}
    public record ItemizedInvoiceRequest(@NotBlank @Size(max=60) String invoiceNumber,
          @NotBlank @Size(max=160) String customerName,@NotNull LocalDate issueDate,@NotNull LocalDate dueDate,
          @NotEmpty List<@Valid LineRequest> items,@DecimalMin("0.00") @DecimalMax("28.00") BigDecimal gstRate,
          @DecimalMin("0.00") BigDecimal discount,@Email String customerEmail,@Size(max=20) String customerGstin,String templateType) {}
    public record InvoiceRequest(@NotBlank @Size(max=60) String invoiceNumber,
                                 @NotBlank @Size(max=160) String customerName,
                                 @NotNull @DecimalMin(value="0.01") @Digits(integer=10, fraction=2) BigDecimal totalAmount,

                                 @NotNull LocalDate issueDate,
                                 @NotNull LocalDate dueDate,
                                 @Size(max = 20) String customerGstin,                                 @Email @Size(max = 254) String customerEmail,
                                 @DecimalMin(value = "0.00")
                                 @DecimalMax(value = "28.00") BigDecimal gstRate
    ) {}
    public record PaymentRequest(@NotNull @DecimalMin(value="0.01") @Digits(integer=10, fraction=2) BigDecimal amount) {}

    public record InvoiceView(
            Long id,
            String invoiceNumber,
            String customerName,
            BigDecimal totalAmount,
            BigDecimal paidAmount,
            BigDecimal balance,
            LocalDate issueDate,
            LocalDate dueDate,
            String status,
            int riskScore,
            String riskLevel,
            List<String> riskReasons,
            long daysOverdue
    ) {
        static InvoiceView from(Invoice i, InvoiceRiskService riskService) {
            InvoiceRiskService.RiskAssessment risk = riskService.assess(i);

            return new InvoiceView(
                    i.getId(),
                    i.getInvoiceNumber(),
                    i.getCustomerName(),
                    i.getTotalAmount(),
                    i.getPaidAmount(),
                    i.getBalance(),
                    i.getIssueDate(),
                    i.getDueDate(),
                    i.getStatus(),
                    risk.score(),
                    risk.level(),
                    risk.reasons(),
                    risk.daysOverdue()
            );
        }
    }


    private AppUser owner(Authentication auth) {
        return users.findByEmailIgnoreCase(auth.getName()).orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
    }
    private Invoice owned(Long id, AppUser owner) {
        return invoices.findByIdAndOwnerId(id, owner.getId()).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Invoice not found"));
    }
    @GetMapping
    public List<InvoiceView> list(Authentication auth) {
        AppUser owner = owner(auth);
        return invoices.findAllByOwnerIdAndCancelledFalseOrderByDueDateAsc(owner.getId())
                .stream()
                .map(invoice -> InvoiceView.from(invoice, riskService))
                .toList();
    }
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @org.springframework.transaction.annotation.Transactional
    public InvoiceView create(@Valid @RequestBody InvoiceRequest body, Authentication auth) {
        AppUser owner = owner(auth);
        if (body.dueDate().isBefore(body.issueDate())) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Due date cannot be before issue date");
        if (invoices.existsByOwnerIdAndInvoiceNumberIgnoreCase(owner.getId(), body.invoiceNumber().trim()))
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Invoice number already exists");


        Invoice invoice = new Invoice(
                owner,
                body.invoiceNumber(),
                body.customerName(),
                body.totalAmount(),
                body.issueDate(),
                body.dueDate()
        );
        invoice.setCustomerEmail(body.customerEmail());

        if (body.gstRate() != null) {
            invoice.applyGstDetails(
                    body.customerGstin(),
                    body.gstRate(),
                    body.totalAmount()
            );
        }

        Invoice saved = invoices.save(invoice);
        audit.log(owner.getId(),saved.getId(),"CREATED",auth.getName(),"Legacy invoice created");
        return InvoiceView.from(saved, riskService);
    }
    @PostMapping("/itemized")
    @ResponseStatus(HttpStatus.CREATED)
    @org.springframework.transaction.annotation.Transactional
    public InvoiceView createItemized(@Valid @RequestBody ItemizedInvoiceRequest body,Authentication auth){
        AppUser owner=owner(auth);
        if(body.dueDate().isBefore(body.issueDate()))throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Due date cannot be before issue date");
        if(invoices.existsByOwnerIdAndInvoiceNumberIgnoreCase(owner.getId(),body.invoiceNumber().trim()))throw new ResponseStatusException(HttpStatus.CONFLICT,"Invoice number already exists");
        if(body.items().size()>100)throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Maximum 100 items");
        BigDecimal subtotal=BigDecimal.ZERO;
        BigDecimal defaultRate=body.gstRate()==null?BigDecimal.ZERO:body.gstRate();
        for(LineRequest line:body.items())subtotal=subtotal.add(line.quantity().multiply(line.unitPrice()).setScale(2,java.math.RoundingMode.HALF_UP));
        BigDecimal discount=body.discount()==null?BigDecimal.ZERO:body.discount();
        if(discount.compareTo(subtotal)>=0)throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Discount must be less than subtotal");
        BigDecimal taxable=BigDecimal.ZERO,tax=BigDecimal.ZERO;
        record Calc(LineRequest line,BigDecimal taxable,BigDecimal rate,BigDecimal discountPercent){}
        List<Calc> calculated=new java.util.ArrayList<>();
        for(LineRequest line:body.items()){
            BigDecimal gross=line.quantity().multiply(line.unitPrice()).setScale(2,java.math.RoundingMode.HALF_UP);
            BigDecimal disc=line.discountPercent()==null?BigDecimal.ZERO:line.discountPercent();
            BigDecimal rate=line.gstRate()==null?defaultRate:line.gstRate();
            BigDecimal itemNet=gross.multiply(BigDecimal.ONE.subtract(disc.divide(new BigDecimal("100")))).setScale(2,java.math.RoundingMode.HALF_UP);
            BigDecimal allocated= gross.signum()==0?BigDecimal.ZERO:discount.multiply(gross).divide(subtotal,2,java.math.RoundingMode.HALF_UP);
            BigDecimal itemTaxable=itemNet.subtract(allocated);
            if(itemTaxable.signum()<0)throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Discount exceeds item value");
            calculated.add(new Calc(line,itemTaxable,rate,disc));taxable=taxable.add(itemTaxable);
        }
        if(taxable.signum()<=0||taxable.compareTo(new BigDecimal("9999999999.99"))>0)throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Invalid taxable amount");
        // Align rounding of invoice-level discount allocations with exact requested discount.
        BigDecimal netBeforeGlobal=BigDecimal.ZERO;
        for(Calc c:calculated){BigDecimal gross=c.line().quantity().multiply(c.line().unitPrice()).setScale(2,java.math.RoundingMode.HALF_UP);
            netBeforeGlobal=netBeforeGlobal.add(gross.multiply(BigDecimal.ONE.subtract(c.discountPercent().divide(new BigDecimal("100")))).setScale(2,java.math.RoundingMode.HALF_UP));}
        BigDecimal correction=netBeforeGlobal.subtract(discount).subtract(taxable);
        if(correction.signum()!=0){Calc last=calculated.get(calculated.size()-1);calculated.set(calculated.size()-1,new Calc(last.line(),last.taxable().add(correction),last.rate(),last.discountPercent()));taxable=taxable.add(correction);}
        if(taxable.signum()<=0)throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Discounts exceed taxable amount");
        Invoice invoice=new Invoice(owner,body.invoiceNumber(),body.customerName(),taxable,body.issueDate(),body.dueDate());
        invoice.setCustomerEmail(body.customerEmail());
        try { invoice.setTemplateType(body.templateType()); }
        catch (IllegalArgumentException ex) { throw new ResponseStatusException(HttpStatus.BAD_REQUEST, ex.getMessage()); }
        for(Calc c:calculated)tax=tax.add(c.taxable().multiply(c.rate()).divide(new BigDecimal("100"),2,java.math.RoundingMode.HALF_UP));
        invoice.applyItemizedTotals(body.customerGstin(),taxable,tax);
        Invoice saved=invoices.save(invoice);
        for(Calc c:calculated){LineRequest line=c.line();BigDecimal itemTax=c.taxable().multiply(c.rate()).divide(new BigDecimal("100"),2,java.math.RoundingMode.HALF_UP);
            InvoiceLineItem item=new InvoiceLineItem(saved,line.description().trim(),line.quantity(),line.unitPrice(),c.taxable(),c.discountPercent(),c.rate(),itemTax);
            if(line.productId()!=null){
                Product product=products.lockOwned(line.productId(),owner.getId()).orElseThrow(()->new ResponseStatusException(HttpStatus.BAD_REQUEST,"Product not found"));
                int qty;try{qty=line.quantity().intValueExact();}catch(ArithmeticException e){throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Stock-tracked quantities must be whole units");}
                if(product.getStock()<qty)throw new ResponseStatusException(HttpStatus.CONFLICT,"Insufficient stock: "+product.getName());
                product.setStock(product.getStock()-qty);products.save(product);item.setProduct(product);
                movements.save(new StockMovement(owner.getId(),product.getId(),-qty,"SALE",String.valueOf(saved.getId())));
            }
            lineItems.save(item);}
        audit.log(owner.getId(),saved.getId(),"CREATED",auth.getName(),"Itemized invoice created with "+body.items().size()+" items");
        return InvoiceView.from(saved,riskService);
    }
    public record ItemView(String description,BigDecimal quantity,BigDecimal unitPrice,BigDecimal lineTotal,BigDecimal discountPercent,BigDecimal gstRate,BigDecimal gstAmount){}
    @GetMapping("/{id}/items")
    public List<ItemView> items(@PathVariable Long id,Authentication auth){owned(id,owner(auth));return lineItems.findAllByInvoiceIdOrderByIdAsc(id).stream().map(i->new ItemView(i.getDescription(),i.getQuantity(),i.getUnitPrice(),i.getLineTotal(),i.getDiscountPercent(),i.getGstRate(),i.getGstAmount())).toList();}
    @GetMapping("/{id}/health")
    public InvoiceHealthService.HealthCheck health(@PathVariable Long id,Authentication auth){owned(id,owner(auth));return health.check(owned(id,owner(auth)),lineItems.findAllByInvoiceIdOrderByIdAsc(id));}
    @GetMapping("/{id}/audit")
    public List<Map<String,Object>> audit(@PathVariable Long id,Authentication auth){AppUser u=owner(auth);owned(id,u);return auditRepository.findAllByOwnerIdAndInvoiceIdOrderByOccurredAtDesc(u.getId(),id).stream().map(e->Map.<String,Object>of("action",e.getAction(),"actor",e.getActor(),"details",e.getDetails()==null?"":e.getDetails(),"at",e.getOccurredAt().toString())).toList();}
    @GetMapping("/{id}/payment-history")
    public List<Map<String,Object>> paymentHistory(@PathVariable Long id,Authentication auth){owned(id,owner(auth));return paymentRepository.findAllByInvoiceIdOrderByReceivedAtDesc(id).stream().map(e->Map.<String,Object>of("amount",e.getAmount(),"receivedAt",e.getReceivedAt().toString())).toList();}
    @GetMapping("/gst-export")
    public org.springframework.http.ResponseEntity<String> gstExport(Authentication auth){AppUser u=owner(auth);StringBuilder csv=new StringBuilder("Invoice Number,Customer,Customer GSTIN,Issue Date,Taxable Amount,GST Rate,Total Amount\n");for(Invoice i:invoices.findAllByOwnerIdAndCancelledFalseOrderByDueDateAsc(u.getId())){csv.append(csvSafe(i.getInvoiceNumber())).append(',').append(csvSafe(i.getCustomerName())).append(',').append(csvSafe(i.getCustomerGstin())).append(',').append(i.getIssueDate()).append(',').append(i.getTaxableAmount()).append(',').append(i.getGstRate()).append(',').append(i.getTotalAmount()).append('\n');}return org.springframework.http.ResponseEntity.ok().header("Content-Disposition","attachment; filename=invotracker-gst-report.csv").contentType(org.springframework.http.MediaType.parseMediaType("text/csv")).body(csv.toString());}
    private static String csvSafe(String value){String v=value==null?"":value;if(!v.stripLeading().isEmpty()&&"=+-@".indexOf(v.stripLeading().charAt(0))>=0)v="'"+v;return "\""+v.replace("\"","\"\"")+"\"";}
    @GetMapping("/{id}/fraud-review")
    public InvoiceFraudService.FraudReview fraudReview(@PathVariable Long id,Authentication auth){AppUser user=owner(auth);Invoice invoice=owned(id,user);return fraudService.assess(invoice,invoices.findAllByOwnerIdAndCancelledFalseOrderByDueDateAsc(user.getId()),user.getId());}
    @PutMapping("/{id}")
    @org.springframework.transaction.annotation.Transactional
    public InvoiceView update(@PathVariable Long id, @Valid @RequestBody InvoiceRequest body, Authentication auth) {
        AppUser owner = owner(auth); Invoice invoice = owned(id, owner);
        if(!lineItems.findAllByInvoiceIdOrderByIdAsc(id).isEmpty())throw new ResponseStatusException(HttpStatus.CONFLICT,"Itemized invoices cannot be edited using the legacy amount endpoint");
        if (body.dueDate().isBefore(body.issueDate())) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Due date cannot be before issue date");
        try { invoice.update(body.customerName(), body.totalAmount(), body.issueDate(), body.dueDate()); }
        catch (IllegalArgumentException ex) { throw new ResponseStatusException(HttpStatus.BAD_REQUEST, ex.getMessage()); }
        Invoice saved=invoices.save(invoice);audit.log(owner.getId(),id,"UPDATED",auth.getName(),"Invoice details changed");return InvoiceView.from(saved,riskService);
    }
    @PostMapping("/{id}/payments")
    @org.springframework.transaction.annotation.Transactional
    public InvoiceView payment(@PathVariable Long id, @Valid @RequestBody PaymentRequest body, Authentication auth) {
        AppUser owner = owner(auth); Invoice invoice = owned(id, owner);
        try { invoice.recordPayment(body.amount()); }
        catch (IllegalArgumentException ex) { throw new ResponseStatusException(HttpStatus.BAD_REQUEST, ex.getMessage()); }
        Invoice saved=invoices.save(invoice);paymentRepository.save(new InvoicePayment(saved,body.amount()));audit.log(owner.getId(),id,"PAYMENT",auth.getName(),"Payment recorded: "+body.amount());return InvoiceView.from(saved,riskService);
    }
    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @org.springframework.transaction.annotation.Transactional
    public void cancel(@PathVariable Long id, Authentication auth) {
        AppUser owner = owner(auth); Invoice invoice = owned(id, owner);
        if(invoice.isCancelled())throw new ResponseStatusException(HttpStatus.CONFLICT,"Invoice already cancelled");
        for(InvoiceLineItem item:lineItems.findAllByInvoiceIdOrderByIdAsc(id)){
            if(item.getProduct()==null)continue;
            Product product=products.lockOwned(item.getProduct().getId(),owner.getId()).orElseThrow(()->new ResponseStatusException(HttpStatus.CONFLICT,"Stock product no longer exists"));
            int qty=item.getQuantity().intValueExact();
            product.setStock(Math.addExact(product.getStock(),qty));products.save(product);
            movements.save(new StockMovement(owner.getId(),product.getId(),qty,"SALE_REVERSAL",String.valueOf(id)));
        }
        try { invoice.cancel(); }
        catch (IllegalArgumentException ex) { throw new ResponseStatusException(HttpStatus.BAD_REQUEST, ex.getMessage()); }
        invoices.save(invoice);audit.log(owner.getId(),id,"CANCELLED",auth.getName(),"Invoice cancelled");
    }
    @GetMapping("/summary")
    public Map<String, Object> summary(Authentication auth) {
        List<Invoice> list = invoices.findAllByOwnerIdAndCancelledFalseOrderByDueDateAsc(owner(auth).getId());
        BigDecimal invoiced = list.stream().map(Invoice::getTotalAmount).reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal paid = list.stream().map(Invoice::getPaidAmount).reduce(BigDecimal.ZERO, BigDecimal::add);
        long overdue = list.stream().filter(i -> "OVERDUE".equals(i.getStatus())).count();
        return Map.of("invoiceCount", list.size(), "totalInvoiced", invoiced, "totalPaid", paid, "outstanding", invoiced.subtract(paid), "overdueCount", overdue);
    }
}
