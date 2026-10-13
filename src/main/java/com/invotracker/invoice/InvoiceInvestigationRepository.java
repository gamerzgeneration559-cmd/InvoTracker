package com.invotracker.invoice;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
public interface InvoiceInvestigationRepository extends JpaRepository<InvoiceInvestigation,Long> {
 Optional<InvoiceInvestigation> findByOwnerIdAndInvoiceId(Long ownerId,Long invoiceId);
}
