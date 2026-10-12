
package com.invotracker.invoice;

import java.time.LocalDate;
import java.time.LocalDateTime;

import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class PaymentReminderService {

    private final InvoiceRepository invoices;
    private final PaymentReminderLogRepository reminderLogs;
    private final JavaMailSender mailSender;

    public PaymentReminderService(
            InvoiceRepository invoices,
            PaymentReminderLogRepository reminderLogs,
            JavaMailSender mailSender) {
        this.invoices = invoices;
        this.reminderLogs = reminderLogs;
        this.mailSender = mailSender;
    }

    @Transactional
    public int sendDueReminders() {
        int sentCount = 0;
        LocalDate today = LocalDate.now();

        for (Invoice invoice : invoices.findInvoicesDueForReminder(today)) {
            if (invoice.getCustomerEmail() == null
                    || invoice.getCustomerEmail().isBlank()
                    || invoice.isCancelled()
                    || invoice.getBalance().signum() <= 0) {
                continue;
            }

            String reminderType = "PAYMENT_DUE";

            if (reminderLogs.existsByInvoiceIdAndReminderTypeAndSentAtAfter(
                    invoice.getId(), reminderType, today.atStartOfDay())) {
                continue;
            }

            SimpleMailMessage message = new SimpleMailMessage();
            message.setTo(invoice.getCustomerEmail());
            message.setSubject("Payment reminder: Invoice " + invoice.getInvoiceNumber());
            message.setText(
                    "Dear " + invoice.getCustomerName() + ",\n\n"
                            + "This is a reminder that invoice "
                            + invoice.getInvoiceNumber()
                            + " has an outstanding balance of ₹"
                            + invoice.getBalance()
                            + ". The due date was "
                            + invoice.getDueDate()
                            + ".\n\nPlease arrange payment at your earliest convenience.\n\n"
                            + "Thank you."
            );

            mailSender.send(message);

            reminderLogs.save(new PaymentReminderLog(
                    invoice.getId(),
                    invoice.getCustomerEmail(),
                    LocalDateTime.now(),
                    reminderType
            ));

            sentCount++;
        }

        return sentCount;
    }
}
