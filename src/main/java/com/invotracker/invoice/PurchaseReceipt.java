package com.invotracker.invoice;
import jakarta.persistence.*;
import java.time.Instant;
@Entity @Table(name="purchase_receipts",uniqueConstraints=@UniqueConstraint(columnNames={"owner_id","supplier_key","invoice_key"}))
public class PurchaseReceipt {
 @Id @GeneratedValue(strategy=GenerationType.IDENTITY) public Long id;
 @Column(name="owner_id",nullable=false) public Long ownerId;
 @Column(nullable=false) public String supplier;
 @Column(name="supplier_key",nullable=false) public String supplierKey;
 @Column(name="invoice_key",nullable=false) public String invoiceKey;
 @Column(nullable=false) public String invoiceNumber;
 @Column(nullable=false) public Instant receivedAt=Instant.now();
 protected PurchaseReceipt(){}
 public PurchaseReceipt(Long ownerId,String supplier,String invoiceNumber){this.ownerId=ownerId;this.supplier=supplier;this.invoiceNumber=invoiceNumber;this.supplierKey=supplier.trim().toLowerCase(java.util.Locale.ROOT);this.invoiceKey=invoiceNumber.trim().toLowerCase(java.util.Locale.ROOT);}
}
