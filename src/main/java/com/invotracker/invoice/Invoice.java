package com.invotracker.invoice;

import java.math.RoundingMode;

import com.invotracker.user.AppUser;
import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.LocalDate;

@Entity
@Table(name = "invoices", uniqueConstraints = @UniqueConstraint(columnNames = {"owner_id", "invoice_number"}))
public class Invoice {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @ManyToOne(optional = false, fetch = FetchType.LAZY)
    @JoinColumn(name = "owner_id", nullable = false)
    private AppUser owner;
    @Column(name = "invoice_number", nullable = false, length = 60)
    private String invoiceNumber;
    @Column(nullable = false, length = 160)
    private String customerName;
    @Column(length = 254)
    private String customerEmail;

    @Column(length = 20)
    private String customerGstin;

    @Column(nullable = false, precision = 5, scale = 2)
    private BigDecimal gstRate = BigDecimal.ZERO;

    @Column(nullable = false, precision = 12, scale = 2)
    private BigDecimal taxableAmount = BigDecimal.ZERO;

    @Column(nullable = false, precision = 12, scale = 2)
    private BigDecimal totalAmount;
    @Column(nullable = false, precision = 12, scale = 2)
    private BigDecimal paidAmount = BigDecimal.ZERO;
    @Column(nullable = false)
    private LocalDate issueDate;
    @Column(nullable = false)
    private LocalDate dueDate;
    @Column(length=32) private String templateType="STANDARD";
    public String getTemplateType(){return templateType==null?"STANDARD":templateType;}
    public void setTemplateType(String template){if(template==null||template.isBlank())return;String t=template.toUpperCase(java.util.Locale.ROOT);if(!java.util.Set.of("STANDARD","GROCERY","FREELANCER","MANUFACTURING","TRANSPORT","HEALTHCARE").contains(t))throw new IllegalArgumentException("Unsupported invoice template");this.templateType=t;}
    @Column(nullable = false, length = 20)
    private String status = "PENDING";
    @Column(nullable = false)
    private boolean cancelled = false;

    protected Invoice() {}

    public Invoice(AppUser owner, String invoiceNumber, String customerName,
                   BigDecimal totalAmount, LocalDate issueDate, LocalDate dueDate) {
        this.owner = owner;
        this.invoiceNumber = invoiceNumber.trim();
        this.customerName = customerName.trim();
        this.totalAmount = totalAmount;
        this.paidAmount = BigDecimal.ZERO;
        this.issueDate = issueDate;
        this.dueDate = dueDate;

        this.gstRate = BigDecimal.ZERO;
        this.taxableAmount = totalAmount;
        this.customerGstin = null;

        refreshStatus();
    }

    public void applyGstDetails(String customerGstin, BigDecimal gstRate,
                                BigDecimal taxableAmount) {
        if (cancelled) {
            throw new IllegalArgumentException(
                    "Cancelled invoices cannot be changed");
        }

        if (taxableAmount == null || taxableAmount.signum() <= 0) {
            throw new IllegalArgumentException(
                    "Taxable amount must be greater than zero");
        }

        if (gstRate == null
                || gstRate.signum() < 0
                || gstRate.compareTo(new BigDecimal("28.00")) > 0) {
            throw new IllegalArgumentException("Invalid GST rate");
        }

        BigDecimal gstAmount = taxableAmount
                .multiply(gstRate)
                .divide(new BigDecimal("100"), 2, RoundingMode.HALF_UP);

        BigDecimal finalTotal = taxableAmount.add(gstAmount);

        if (finalTotal.compareTo(paidAmount) < 0) {
            throw new IllegalArgumentException(
                    "Invoice total cannot be less than payments already received");
        }

        this.customerGstin = customerGstin == null
                || customerGstin.isBlank()
                ? null : customerGstin.trim();

        this.gstRate = gstRate.setScale(2, RoundingMode.HALF_UP);
        this.taxableAmount = taxableAmount.setScale(2, RoundingMode.HALF_UP);
        this.totalAmount = finalTotal;

        refreshStatus();
    }

    /** Store server-calculated mixed-rate item totals. */
    public void applyItemizedTotals(String customerGstin, BigDecimal taxable, BigDecimal tax) {
        if(cancelled) throw new IllegalArgumentException("Cancelled invoice");
        if(taxable.signum()<=0||tax.signum()<0)throw new IllegalArgumentException("Invalid invoice totals");
        BigDecimal total=taxable.add(tax).setScale(2,RoundingMode.HALF_UP);
        if(total.compareTo(paidAmount)<0)throw new IllegalArgumentException("Total below recorded payments");
        this.customerGstin=(customerGstin==null||customerGstin.isBlank())?null:customerGstin.trim();
        this.taxableAmount=taxable.setScale(2,RoundingMode.HALF_UP);
        this.totalAmount=total;
        this.gstRate=tax.multiply(new BigDecimal("100")).divide(taxable,2,RoundingMode.HALF_UP);
        refreshStatus();
    }
    public void recordPayment(BigDecimal amount) {
        if (cancelled) throw new IllegalArgumentException("Cancelled invoices cannot receive payments");
        if (amount == null || amount.signum() <= 0) throw new IllegalArgumentException("Payment must be greater than zero");
        if (paidAmount.add(amount).compareTo(totalAmount) > 0) throw new IllegalArgumentException("Payment exceeds outstanding balance");
        paidAmount = paidAmount.add(amount);
        refreshStatus();
    }
    public void cancel() {
        if (paidAmount.signum() > 0) throw new IllegalArgumentException("Invoices with payments cannot be cancelled; handle a refund/credit separately");
        cancelled = true; status = "CANCELLED";
    }
    public void update(String customerName, BigDecimal totalAmount, LocalDate issueDate, LocalDate dueDate) {
        if (totalAmount.compareTo(paidAmount) < 0) throw new IllegalArgumentException("Total cannot be less than amount already paid");
        this.customerName = customerName.trim(); this.totalAmount = totalAmount; this.issueDate = issueDate; this.dueDate = dueDate;
        refreshStatus();
    }
    private void refreshStatus() {
        if (cancelled) { status = "CANCELLED"; return; }
        if (paidAmount.compareTo(totalAmount) >= 0) status = "PAID";
        else if (dueDate.isBefore(LocalDate.now())) status = "OVERDUE";
        else status = paidAmount.signum() > 0 ? "PARTIALLY_PAID" : "PENDING";
    }
    public Long getId() { return id; }
    public String getInvoiceNumber() { return invoiceNumber; }
    public String getCustomerName() { return customerName; }

    public String getCustomerGstin() {
        return customerGstin;
    }

    public BigDecimal getGstRate() {
        return gstRate;
    }

    public BigDecimal getTaxableAmount() {
        return taxableAmount;
    }

    public BigDecimal getTotalAmount() { return totalAmount; }
    public BigDecimal getPaidAmount() { return paidAmount; }
    public BigDecimal getBalance() { return totalAmount.subtract(paidAmount); }
    public LocalDate getIssueDate() { return issueDate; }
    public LocalDate getDueDate() { return dueDate; }
    public String getStatus() { refreshStatus(); return status; }
    public boolean isCancelled() {
        return cancelled;
    }

    public String getCustomerEmail() {
        return customerEmail;
    }

    public void setCustomerEmail(String customerEmail) {
        this.customerEmail = (customerEmail == null || customerEmail.isBlank())
                ? null : customerEmail.trim();
    }
}