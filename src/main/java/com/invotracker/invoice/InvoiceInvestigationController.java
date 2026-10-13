package com.invotracker.invoice;
import com.invotracker.user.AppUserRepository;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.Set;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
@RestController @RequestMapping("/api/invoices/{invoiceId}/investigation")
public class InvoiceInvestigationController {
 private final InvoiceInvestigationRepository investigations;
 private final InvoiceRepository invoices;
 private final AppUserRepository users;
 private final InvoiceAuditService audit;
 public InvoiceInvestigationController(InvoiceInvestigationRepository investigations,InvoiceRepository invoices,AppUserRepository users,InvoiceAuditService audit){this.investigations=investigations;this.invoices=invoices;this.users=users;this.audit=audit;}
 private Long ownerId(Authentication auth,Long invoiceId){
  Long owner=users.findByEmailIgnoreCase(auth.getName()).orElseThrow(()->new ResponseStatusException(HttpStatus.UNAUTHORIZED)).getId();
  if(invoices.findByIdAndOwnerId(invoiceId,owner).isEmpty())throw new ResponseStatusException(HttpStatus.NOT_FOUND,"Invoice not found");
  return owner;
 }
 public record InvestigationView(String status,String notes,Instant updatedAt){}
 public record Decision(@NotNull String status,@Size(max=500) String notes){}
 @GetMapping public InvestigationView get(@PathVariable Long invoiceId,Authentication auth){
  Long owner=ownerId(auth,invoiceId);
  return investigations.findByOwnerIdAndInvoiceId(owner,invoiceId).map(i->new InvestigationView(i.getStatus(),i.getNotes(),i.getUpdatedAt())).orElse(new InvestigationView("OPEN","",null));
 }
 @PutMapping @org.springframework.transaction.annotation.Transactional public InvestigationView decide(@PathVariable Long invoiceId,@Valid @RequestBody Decision decision,Authentication auth){
  Long owner=ownerId(auth,invoiceId);
  if(!Set.of("OPEN","REVIEWING","RESOLVED","FALSE_POSITIVE").contains(decision.status()))throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Unsupported investigation status");
  InvoiceInvestigation item=investigations.findByOwnerIdAndInvoiceId(owner,invoiceId).orElseGet(()->new InvoiceInvestigation(owner,invoiceId));
  item.update(decision.status(),decision.notes());investigations.save(item);
  audit.log(owner,invoiceId,"INVESTIGATION",auth.getName(),"Investigation status: "+decision.status());
  return new InvestigationView(item.getStatus(),item.getNotes(),item.getUpdatedAt());
 }
}
