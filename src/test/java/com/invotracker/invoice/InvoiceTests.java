package com.invotracker.invoice;

import static org.junit.jupiter.api.Assertions.*;
import com.invotracker.user.AppUser;
import java.math.BigDecimal;
import java.time.LocalDate;
import org.junit.jupiter.api.Test;

class InvoiceTests {
    private Invoice invoice() {
        AppUser owner = new AppUser("Test Co", "small-business", "test@example.com", "not-a-real-hash");
        return new Invoice(owner, "INV-1", "Customer", new BigDecimal("10000.00"),
            LocalDate.now(), LocalDate.now().plusDays(10));
    }
    @Test void partialAndFullPaymentsUpdateBalanceAndStatus() {
        Invoice invoice = invoice();
        invoice.recordPayment(new BigDecimal("4000.00"));
        assertEquals(new BigDecimal("6000.00"), invoice.getBalance());
        assertEquals("PARTIALLY_PAID", invoice.getStatus());
        invoice.recordPayment(new BigDecimal("6000.00"));
        assertEquals(BigDecimal.ZERO.setScale(2), invoice.getBalance());
        assertEquals("PAID", invoice.getStatus());
    }
    @Test void rejectsPaymentGreaterThanBalance() {
        Invoice invoice = invoice();
        assertThrows(IllegalArgumentException.class, () -> invoice.recordPayment(new BigDecimal("10000.01")));
    }
    @Test void rejectsZeroPayment() {
        assertThrows(IllegalArgumentException.class, () -> invoice().recordPayment(BigDecimal.ZERO));
    }
}
