package com.invotracker.invoice;
import jakarta.persistence.*;
import java.time.Instant;
@Entity @Table(name="invoice_audit_events",indexes=@Index(name="idx_audit_owner_invoice",columnList="owner_id,invoice_id"))
public class InvoiceAuditEvent {
 @Id @GeneratedValue(strategy=GenerationType.IDENTITY) private Long id;
 @Column(name="owner_id",nullable=false) private Long ownerId;
 @Column(name="invoice_id",nullable=false) private Long invoiceId;
 @Column(nullable=false,length=30) private String action;
 @Column(nullable=false,length=190) private String actor;
 @Column(length=500) private String details;
 @Column(nullable=false) private Instant occurredAt;
 protected InvoiceAuditEvent(){}
 public InvoiceAuditEvent(Long ownerId,Long invoiceId,String action,String actor,String details){this.ownerId=ownerId;this.invoiceId=invoiceId;this.action=action;this.actor=actor;this.details=details;this.occurredAt=Instant.now();}
 public Long getId(){return id;} public Long getInvoiceId(){return invoiceId;} public String getAction(){return action;} public String getActor(){return actor;} public String getDetails(){return details;} public Instant getOccurredAt(){return occurredAt;}
}
