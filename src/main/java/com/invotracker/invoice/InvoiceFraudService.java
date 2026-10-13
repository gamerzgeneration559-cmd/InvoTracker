package com.invotracker.invoice;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import org.springframework.stereotype.Service;
@Service public class InvoiceFraudService {
 private final BusinessContactRepository contacts;
 public InvoiceFraudService(BusinessContactRepository contacts){this.contacts=contacts;}
 public record FraudReview(int score,String level,List<String> warnings){}
 public FraudReview assess(Invoice current,List<Invoice> history,Long ownerId){
  int score=0;List<String>warnings=new ArrayList<>();
  for(Invoice previous:history){if(previous.getId().equals(current.getId()))continue;
   if(previous.getInvoiceNumber().equalsIgnoreCase(current.getInvoiceNumber())){score+=65;warnings.add("Duplicate invoice number in this business");break;}}
  for(Invoice previous:history){if(previous.getId().equals(current.getId()))continue;
   if(previous.getCustomerName().equalsIgnoreCase(current.getCustomerName())&&previous.getTotalAmount().compareTo(current.getTotalAmount())==0&&previous.getIssueDate().equals(current.getIssueDate())){score+=35;warnings.add("Similar customer, amount and issue date found");break;}}
  List<Invoice> peers=history.stream().filter(i->!i.getId().equals(current.getId())&&i.getCustomerName().equalsIgnoreCase(current.getCustomerName())).toList();
  if(peers.size()>=3){BigDecimal avg=peers.stream().map(Invoice::getTotalAmount).reduce(BigDecimal.ZERO,BigDecimal::add).divide(BigDecimal.valueOf(peers.size()),2,java.math.RoundingMode.HALF_UP);
   if(avg.signum()>0&&current.getTotalAmount().compareTo(avg.multiply(BigDecimal.valueOf(3)))>0){score+=25;warnings.add("Amount is over three times this customer's historical average");}}
  for(BusinessContact contact:contacts.findAllByOwnerIdOrderByNameAsc(ownerId)){
   if(contact.isPaymentDetailsChanged() && contact.getName().equalsIgnoreCase(current.getCustomerName())){score+=35;warnings.add("Contact payment identifier changed; verify independently before paying");break;}
  }
  score=Math.min(score,100);return new FraudReview(score,score>=60?"HIGH":score>=25?"REVIEW":"LOW",List.copyOf(warnings));
 }
}
