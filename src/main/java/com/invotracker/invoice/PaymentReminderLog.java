
package com.invotracker.invoice;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "payment_reminder_logs")
public class PaymentReminderLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long invoiceId;

    @Column(nullable = false, length = 254)
    private String customerEmail;

    @Column(nullable = false)
    private LocalDateTime sentAt;

    @Column(nullable = false, length = 30)
    private String reminderType;

    public PaymentReminderLog() {
    }

    public PaymentReminderLog(Long invoiceId, String customerEmail,
                              LocalDateTime sentAt, String reminderType) {
        this.invoiceId = invoiceId;
        this.customerEmail = customerEmail;
        this.sentAt = sentAt;
        this.reminderType = reminderType;
    }

    public Long getId() {
        return id;
    }

    public Long getInvoiceId() {
        return invoiceId;
    }

    public String getCustomerEmail() {
        return customerEmail;
    }

    public LocalDateTime getSentAt() {
        return sentAt;
    }

    public String getReminderType() {
        return reminderType;
    }
}
