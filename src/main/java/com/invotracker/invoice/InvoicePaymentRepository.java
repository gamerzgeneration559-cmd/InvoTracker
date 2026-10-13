package com.invotracker.invoice;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
public interface InvoicePaymentRepository extends JpaRepository<InvoicePayment,Long>{List<InvoicePayment> findAllByInvoiceIdOrderByReceivedAtDesc(Long invoiceId);}
