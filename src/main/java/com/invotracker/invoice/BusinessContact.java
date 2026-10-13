package com.invotracker.invoice;
import com.invotracker.user.AppUser;
import jakarta.persistence.*;
@Entity @Table(name="business_contacts", indexes=@Index(name="idx_contact_owner",columnList="owner_id"))
public class BusinessContact {
 @Id @GeneratedValue(strategy=GenerationType.IDENTITY) private Long id;
 @ManyToOne(fetch=FetchType.LAZY,optional=false) @JoinColumn(name="owner_id",nullable=false) private AppUser owner;
 @Column(nullable=false,length=12) private String type;
 @Column(nullable=false,length=160) private String name;
 @Column(length=254) private String email;
 @Column(length=25) private String phone;
 @Column(length=20) private String gstin;
 @Column(length=500) private String address;
 @Column(length=64) private String paymentFingerprint;
 @Column(length=8) private String paymentLast4;
 @Column private Boolean paymentDetailsChanged=false;
 public String getPaymentLast4(){return paymentLast4;}
 public boolean isPaymentDetailsChanged(){return Boolean.TRUE.equals(paymentDetailsChanged);}
 public void setPaymentFingerprint(String fingerprint,String last4){if(paymentFingerprint!=null&&!paymentFingerprint.equals(fingerprint))paymentDetailsChanged=true;paymentFingerprint=fingerprint;paymentLast4=last4;}

 protected BusinessContact(){}
 public BusinessContact(AppUser owner,String type,String name,String email,String phone,String gstin,String address){this.owner=owner;this.type=type;this.name=name;this.email=email;this.phone=phone;this.gstin=gstin;this.address=address;}
 public void update(String type,String name,String email,String phone,String gstin,String address){this.type=type;this.name=name;this.email=email;this.phone=phone;this.gstin=gstin;this.address=address;} public Long getId(){return id;} public String getType(){return type;} public String getName(){return name;} public String getEmail(){return email;} public String getPhone(){return phone;} public String getGstin(){return gstin;} public String getAddress(){return address;}
}
