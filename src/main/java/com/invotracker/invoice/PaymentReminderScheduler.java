
package com.invotracker.invoice;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(
        name = "invotracker.reminders.enabled",
        havingValue = "true"
)
public class PaymentReminderScheduler {

    private final PaymentReminderService reminderService;

    public PaymentReminderScheduler(PaymentReminderService reminderService) {
        this.reminderService = reminderService;
    }

    @Scheduled(cron = "0 0 9 * * *")
    public void sendDailyReminders() {
        int count = reminderService.sendDueReminders();
        System.out.println("Payment reminders sent: " + count);
    }
}
