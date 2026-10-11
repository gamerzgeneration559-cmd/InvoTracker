package com.invotracker.invoice;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface InvoiceRepository extends JpaRepository<Invoice, Long> {
    List<Invoice> findAllByOwnerIdAndCancelledFalseOrderByDueDateAsc(Long ownerId);

    Optional<Invoice> findByIdAndOwnerId(Long id, Long ownerId);

    boolean existsByOwnerIdAndInvoiceNumberIgnoreCase(Long ownerId, String invoiceNumber);
    @Query("""
    SELECT i FROM Invoice i
    WHERE i.cancelled = false
      AND i.customerEmail IS NOT NULL
      AND i.customerEmail <> ''
      AND i.paidAmount < i.totalAmount
      AND i.dueDate <= :cutoffDate
    ORDER BY i.dueDate ASC
    """)
    List<Invoice> findInvoicesDueForReminder(
            @Param("cutoffDate") LocalDate cutoffDate
    );
}