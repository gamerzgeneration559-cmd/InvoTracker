package com.invotracker.invoice;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
public interface InvoiceAuditRepository extends JpaRepository<InvoiceAuditEvent,Long>{List<InvoiceAuditEvent> findAllByOwnerIdAndInvoiceIdOrderByOccurredAtDesc(Long ownerId,Long invoiceId);}
