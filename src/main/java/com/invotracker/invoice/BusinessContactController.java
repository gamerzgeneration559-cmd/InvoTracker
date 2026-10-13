package com.invotracker.invoice;
import com.invotracker.user.*;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.util.List;
import org.springframework.http.*;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
@RestController @RequestMapping("/api/contacts")
public class BusinessContactController {
 private final BusinessContactRepository contacts;private final AppUserRepository users;
 @org.springframework.beans.factory.annotation.Value("${BANK_FINGERPRINT_KEY:}") private String fingerprintKey;
 private void updatePaymentIdentifier(BusinessContact contact,String raw){
 if(raw==null||raw.isBlank())return;
 if(fingerprintKey==null||fingerprintKey.length()<32)throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Configure BANK_FINGERPRINT_KEY (32+ characters) before saving payment identifiers");
 try {javax.crypto.Mac mac=javax.crypto.Mac.getInstance("HmacSHA256");mac.init(new javax.crypto.spec.SecretKeySpec(fingerprintKey.getBytes(java.nio.charset.StandardCharsets.UTF_8),"HmacSHA256"));String clean=raw.replaceAll("\\s+","").toUpperCase(java.util.Locale.ROOT);
 String fingerprint=java.util.HexFormat.of().formatHex(mac.doFinal(clean.getBytes(java.nio.charset.StandardCharsets.UTF_8)));contact.setPaymentFingerprint(fingerprint,clean.substring(Math.max(0,clean.length()-4)));
 }catch(java.security.GeneralSecurityException e){throw new IllegalStateException("Cannot compute payment fingerprint",e);}
 }
 public BusinessContactController(BusinessContactRepository contacts,AppUserRepository users){this.contacts=contacts;this.users=users;}
 public record ContactRequest(@NotBlank String type,@NotBlank @Size(max=160) String name,@Email @Size(max=254) String email,@Size(max=25) String phone,@Size(max=20) String gstin,@Size(max=500) String address,@Size(max=100) String paymentIdentifier){}
 public record ContactView(Long id,String type,String name,String email,String phone,String gstin,String address,String paymentLast4,boolean paymentDetailsChanged){static ContactView from(BusinessContact c){return new ContactView(c.getId(),c.getType(),c.getName(),c.getEmail(),c.getPhone(),c.getGstin(),c.getAddress(),c.getPaymentLast4(),c.isPaymentDetailsChanged());}}
 private AppUser owner(Authentication a){return users.findByEmailIgnoreCase(a.getName()).orElseThrow(()->new ResponseStatusException(HttpStatus.UNAUTHORIZED));}
 @GetMapping public List<ContactView> list(Authentication a){return contacts.findAllByOwnerIdOrderByNameAsc(owner(a).getId()).stream().map(ContactView::from).toList();}
 private String type(String input){String type=input.trim().toUpperCase();if(!type.equals("CUSTOMER")&&!type.equals("SUPPLIER"))throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Type must be CUSTOMER or SUPPLIER");return type;}
 @PutMapping("/{id}") public ContactView update(@PathVariable Long id,@Valid @RequestBody ContactRequest r,Authentication a){BusinessContact c=contacts.findByIdAndOwnerId(id,owner(a).getId()).orElseThrow(()->new ResponseStatusException(HttpStatus.NOT_FOUND));c.update(type(r.type()),r.name().trim(),r.email(),r.phone(),r.gstin(),r.address());updatePaymentIdentifier(c,r.paymentIdentifier());return ContactView.from(contacts.save(c));}
 @DeleteMapping("/{id}") @ResponseStatus(HttpStatus.NO_CONTENT) public void delete(@PathVariable Long id,Authentication a){BusinessContact c=contacts.findByIdAndOwnerId(id,owner(a).getId()).orElseThrow(()->new ResponseStatusException(HttpStatus.NOT_FOUND));contacts.delete(c);}
 @PostMapping @ResponseStatus(HttpStatus.CREATED) public ContactView create(@Valid @RequestBody ContactRequest r,Authentication a){String type=r.type().trim().toUpperCase();if(!type.equals("CUSTOMER")&&!type.equals("SUPPLIER"))throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Type must be CUSTOMER or SUPPLIER");BusinessContact c=new BusinessContact(owner(a),type,r.name().trim(),r.email(),r.phone(),r.gstin(),r.address());updatePaymentIdentifier(c,r.paymentIdentifier());return ContactView.from(contacts.save(c));}
}
