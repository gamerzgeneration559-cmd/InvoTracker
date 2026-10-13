package com.invotracker.invoice;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import org.springframework.stereotype.Service;
@Service public class InvoiceHealthService {
 public record HealthCheck(boolean valid,List<String> warnings){}
 public HealthCheck check(Invoice invoice,List<InvoiceLineItem> items){List<String> warnings=new ArrayList<>();
 if(invoice.getCustomerEmail()==null||invoice.getCustomerEmail().isBlank())warnings.add("Customer email is missing");
 if(invoice.getCustomerGstin()!=null&&!invoice.getCustomerGstin().isBlank()&&!invoice.getCustomerGstin().matches("(?i)^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$"))warnings.add("Customer GSTIN format appears invalid");
 if(invoice.getDueDate().isBefore(invoice.getIssueDate()))warnings.add("Due date is before issue date");
 if(items.isEmpty())warnings.add("Legacy invoice has no itemized breakdown");
 if(invoice.getTotalAmount().signum()<=0)warnings.add("Invoice total must be positive");
 if(invoice.getPaidAmount().compareTo(invoice.getTotalAmount())>0)warnings.add("Recorded payments exceed invoice total");
 if(!items.isEmpty()){
 BigDecimal sum=items.stream().map(InvoiceLineItem::getLineTotal).reduce(BigDecimal.ZERO,BigDecimal::add);
 if(sum.subtract(invoice.getTaxableAmount()).abs().compareTo(new BigDecimal("0.02"))>0)warnings.add("Stored line item totals differ from invoice taxable amount");
 BigDecimal tax=items.stream().map(InvoiceLineItem::getGstAmount).reduce(BigDecimal.ZERO,BigDecimal::add);
 if(tax.subtract(invoice.getTotalAmount().subtract(invoice.getTaxableAmount())).abs().compareTo(new BigDecimal("0.02"))>0)warnings.add("Stored GST calculation differs from invoice total");
 }
 return new HealthCheck(warnings.stream().noneMatch(x->x.contains("invalid")||x.contains("before")||x.contains("exceed")||x.contains("positive")||x.contains("differ")),List.copyOf(warnings));
 }
}
