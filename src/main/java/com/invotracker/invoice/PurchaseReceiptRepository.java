package com.invotracker.invoice;
import org.springframework.data.jpa.repository.JpaRepository;
public interface PurchaseReceiptRepository extends JpaRepository<PurchaseReceipt,Long>{boolean existsByOwnerIdAndSupplierKeyAndInvoiceKey(Long ownerId,String supplierKey,String invoiceKey);}
