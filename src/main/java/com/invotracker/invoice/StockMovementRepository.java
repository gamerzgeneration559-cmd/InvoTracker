package com.invotracker.invoice;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
public interface StockMovementRepository extends JpaRepository<StockMovement,Long>{List<StockMovement> findTop100ByOwnerIdOrderByOccurredAtDesc(Long ownerId); List<StockMovement> findAllByOwnerIdOrderByOccurredAtDesc(Long ownerId);}
