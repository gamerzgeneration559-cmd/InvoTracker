package com.invotracker.invoice;
import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.Instant;
@Entity @Table(name="invoice_payments",indexes=@Index(name="idx_payment_invoice",columnList="invoice_id"))
public class InvoicePayment {
 @Id @GeneratedValue(strategy=GenerationType.IDENTITY) private Long id;
 @ManyToOne(fetch=FetchType.LAZY,optional=false) @JoinColumn(name="invoice_id",nullable=false) private Invoice invoice;
 @Column(nullable=false,precision=12,scale=2) private BigDecimal amount;
 @Column(nullable=false) private Instant receivedAt;
 protected InvoicePayment(){}
 public InvoicePayment(Invoice invoice,BigDecimal amount){this.invoice=invoice;this.amount=amount;this.receivedAt=Instant.now();}
 public Long getId(){return id;}public BigDecimal getAmount(){return amount;}public Instant getReceivedAt(){return receivedAt;}
}
