
package com.invotracker.invoice;

import java.time.LocalDateTime;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PaymentReminderLogRepository
        extends JpaRepository<PaymentReminderLog, Long> {

    boolean existsByInvoiceIdAndReminderTypeAndSentAtAfter(
            Long invoiceId,
            String reminderType,
            LocalDateTime since
    );
}
