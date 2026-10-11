
package com.invotracker.invoice;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;

import org.springframework.stereotype.Service;

@Service
public class InvoiceRiskService {

    public record RiskAssessment(
            int score,
            String level,
            List<String> reasons,
            long daysOverdue,
            BigDecimal outstandingAmount
    ) {}

    public RiskAssessment assess(Invoice invoice) {
        BigDecimal balance = invoice.getBalance();
        List<String> reasons = new ArrayList<>();

        if (invoice.isCancelled() || balance.signum() <= 0) {
            return new RiskAssessment(
                    0,
                    "LOW",
                    List.of(invoice.isCancelled()
                            ? "Invoice is cancelled"
                            : "Invoice is fully paid"),
                    0,
                    balance.max(BigDecimal.ZERO)
            );
        }

        LocalDate today = LocalDate.now();
        LocalDate dueDate = invoice.getDueDate();

        long daysOverdue = dueDate.isBefore(today)
                ? ChronoUnit.DAYS.between(dueDate, today)
                : 0;

        int score = 0;

        if (daysOverdue > 30) {
            score += 50;
            reasons.add("More than 30 days overdue");
        } else if (daysOverdue > 14) {
            score += 35;
            reasons.add("15–30 days overdue");
        } else if (daysOverdue > 0) {
            score += 20;
            reasons.add("1–14 days overdue");
        } else if (!dueDate.isAfter(today.plusDays(7))) {
            score += 10;
            reasons.add("Due within the next 7 days");
        }

        BigDecimal unpaidRatio = balance.divide(
                invoice.getTotalAmount(),
                4,
                RoundingMode.HALF_UP
        );

        if (unpaidRatio.compareTo(new BigDecimal("0.75")) >= 0) {
            score += 25;
            reasons.add("At least 75% remains unpaid");
        } else if (unpaidRatio.compareTo(new BigDecimal("0.40")) >= 0) {
            score += 15;
            reasons.add("40–74% remains unpaid");
        } else {
            score += 5;
            reasons.add("Less than 40% remains unpaid");
        }

        if (invoice.getPaidAmount().signum() == 0) {
            score += 15;
            reasons.add("No payment received yet");
        } else {
            reasons.add("A partial payment has been received");
        }

        score = Math.min(score, 100);

        String level;
        if (score >= 60) {
            level = "HIGH";
        } else if (score >= 30) {
            level = "MEDIUM";
        } else {
            level = "LOW";
        }

        return new RiskAssessment(
                score,
                level,
                List.copyOf(reasons),
                daysOverdue,
                balance
        );
    }
}
