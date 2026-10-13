package com.invotracker.invoice;
import java.util.List;import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
public interface BusinessContactRepository extends JpaRepository<BusinessContact,Long>{List<BusinessContact> findAllByOwnerIdOrderByNameAsc(Long ownerId);Optional<BusinessContact> findByIdAndOwnerId(Long id,Long ownerId);}
