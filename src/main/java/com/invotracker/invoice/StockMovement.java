package com.invotracker.invoice;
import jakarta.persistence.*;
import java.time.Instant;
@Entity @Table(name="stock_movements") public class StockMovement {
 @Id @GeneratedValue(strategy=GenerationType.IDENTITY) public Long id;
 @Column(nullable=false) public Long ownerId;
 @Column(nullable=false) public Long productId;
 @Column(nullable=false) public int delta;
 @Column(nullable=false,length=30) public String kind;
 @Column(nullable=false,length=160) public String reference;
 @Column(nullable=false) public Instant occurredAt=Instant.now();
 protected StockMovement(){}
 public StockMovement(Long ownerId,Long productId,int delta,String kind,String reference){this.ownerId=ownerId;this.productId=productId;this.delta=delta;this.kind=kind;this.reference=reference;}
}
