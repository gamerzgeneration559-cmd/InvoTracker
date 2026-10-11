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
    private final AppUserRepository users;
    private final InvoiceRiskService riskService;
    public InvoiceController(InvoiceRepository invoices, AppUserRepository users, InvoiceRiskService riskService) {
        this.invoices = invoices;
        this.users = users;
        this.riskService = riskService;
    }
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

        return InvoiceView.from(saved, riskService);
    }
    @PutMapping("/{id}")
    public InvoiceView update(@PathVariable Long id, @Valid @RequestBody InvoiceRequest body, Authentication auth) {
        AppUser owner = owner(auth); Invoice invoice = owned(id, owner);
        if (body.dueDate().isBefore(body.issueDate())) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Due date cannot be before issue date");
        try { invoice.update(body.customerName(), body.totalAmount(), body.issueDate(), body.dueDate()); }
        catch (IllegalArgumentException ex) { throw new ResponseStatusException(HttpStatus.BAD_REQUEST, ex.getMessage()); }
        return InvoiceView.from(invoices.save(invoice), riskService);
    }
    @PostMapping("/{id}/payments")
    public InvoiceView payment(@PathVariable Long id, @Valid @RequestBody PaymentRequest body, Authentication auth) {
        AppUser owner = owner(auth); Invoice invoice = owned(id, owner);
        try { invoice.recordPayment(body.amount()); }
        catch (IllegalArgumentException ex) { throw new ResponseStatusException(HttpStatus.BAD_REQUEST, ex.getMessage()); }
        return InvoiceView.from(invoices.save(invoice), riskService);
    }
    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void cancel(@PathVariable Long id, Authentication auth) {
        AppUser owner = owner(auth); Invoice invoice = owned(id, owner);
        try { invoice.cancel(); }
        catch (IllegalArgumentException ex) { throw new ResponseStatusException(HttpStatus.BAD_REQUEST, ex.getMessage()); }
        invoices.save(invoice);
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
