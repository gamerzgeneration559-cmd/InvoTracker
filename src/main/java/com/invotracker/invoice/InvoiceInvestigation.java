package com.invotracker.invoice;
import jakarta.persistence.*;
import java.time.Instant;
@Entity @Table(name="invoice_investigations",uniqueConstraints=@UniqueConstraint(columnNames={"owner_id","invoice_id"}))
public class InvoiceInvestigation {
 @Id @GeneratedValue(strategy=GenerationType.IDENTITY) private Long id;
 @Column(name="owner_id",nullable=false) private Long ownerId;
 @Column(name="invoice_id",nullable=false) private Long invoiceId;
 @Column(nullable=false,length=20) private String status="OPEN";
 @Column(length=500) private String notes="";
 @Column(nullable=false) private Instant updatedAt=Instant.now();
 protected InvoiceInvestigation(){}
 public InvoiceInvestigation(Long ownerId,Long invoiceId){this.ownerId=ownerId;this.invoiceId=invoiceId;}
 public String getStatus(){return status;} public String getNotes(){return notes;} public Instant getUpdatedAt(){return updatedAt;}
 public void update(String status,String notes){this.status=status;this.notes=notes==null?"":notes.trim();this.updatedAt=Instant.now();}
}
