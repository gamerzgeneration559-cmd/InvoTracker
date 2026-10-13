package com.invotracker.invoice;
import jakarta.persistence.*;
import java.math.BigDecimal;
@Entity @Table(name="invoice_line_items")
public class InvoiceLineItem {
 @Id @GeneratedValue(strategy=GenerationType.IDENTITY) private Long id;
 @ManyToOne(fetch=FetchType.LAZY,optional=false) @JoinColumn(name="invoice_id",nullable=false) private Invoice invoice;
 @ManyToOne(fetch=FetchType.LAZY) @JoinColumn(name="product_id") private Product product;
 public Product getProduct(){return product;} public void setProduct(Product product){this.product=product;}
 @Column(nullable=false,length=200) private String description;
 @Column(nullable=false,precision=12,scale=3) private BigDecimal quantity;
 @Column(nullable=false,precision=12,scale=2) private BigDecimal unitPrice;
 @Column(nullable=false,precision=12,scale=2) private BigDecimal lineTotal;
 @Column(precision=5,scale=2) private BigDecimal discountPercent = BigDecimal.ZERO;
 @Column(precision=5,scale=2) private BigDecimal gstRate = BigDecimal.ZERO;
 @Column(precision=12,scale=2) private BigDecimal gstAmount = BigDecimal.ZERO;
 protected InvoiceLineItem(){}
 public InvoiceLineItem(Invoice invoice,String description,BigDecimal quantity,BigDecimal unitPrice,BigDecimal lineTotal){this.invoice=invoice;this.description=description;this.quantity=quantity;this.unitPrice=unitPrice;this.lineTotal=lineTotal;}
 public InvoiceLineItem(Invoice invoice,String description,BigDecimal quantity,BigDecimal unitPrice,BigDecimal taxable,BigDecimal discountPercent,BigDecimal gstRate,BigDecimal gstAmount){this(invoice,description,quantity,unitPrice,taxable);this.discountPercent=discountPercent;this.gstRate=gstRate;this.gstAmount=gstAmount;}
 public BigDecimal getDiscountPercent(){return discountPercent==null?BigDecimal.ZERO:discountPercent;}
 public BigDecimal getGstRate(){return gstRate==null?BigDecimal.ZERO:gstRate;}
 public BigDecimal getGstAmount(){return gstAmount==null?BigDecimal.ZERO:gstAmount;}
 public String getDescription(){return description;} public BigDecimal getQuantity(){return quantity;} public BigDecimal getUnitPrice(){return unitPrice;} public BigDecimal getLineTotal(){return lineTotal;}
}
