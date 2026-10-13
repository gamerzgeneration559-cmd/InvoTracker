package com.invotracker.invoice;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
public interface InvoiceLineItemRepository extends JpaRepository<InvoiceLineItem,Long>{List<InvoiceLineItem> findAllByInvoiceIdOrderByIdAsc(Long invoiceId);}
