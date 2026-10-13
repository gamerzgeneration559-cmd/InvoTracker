package com.invotracker.invoice;
import org.springframework.stereotype.Service;
@Service public class InvoiceAuditService {
 private final InvoiceAuditRepository repository;
 public InvoiceAuditService(InvoiceAuditRepository repository){this.repository=repository;}
 public void log(Long ownerId,Long invoiceId,String action,String actor,String details){repository.save(new InvoiceAuditEvent(ownerId,invoiceId,action,actor,details));}
}
