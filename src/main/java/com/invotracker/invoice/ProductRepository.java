
package com.invotracker.invoice;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;

public interface ProductRepository extends JpaRepository<Product, Long> {

    // Get products belonging to one user
    List<Product> findAllByOwnerIdOrderByNameAsc(Long ownerId);

    // Find a product belonging to one user
    Optional<Product> findByIdAndOwnerId(Long id, Long ownerId);

    // Find SKU within one user's products
    Optional<Product> findByOwnerIdAndSku(Long ownerId, String sku);

    @org.springframework.data.jpa.repository.Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
    @org.springframework.data.jpa.repository.Query("select p from Product p where p.id = :id and p.owner.id = :ownerId")
    Optional<Product> lockOwned(@org.springframework.data.repository.query.Param("id") Long id,@org.springframework.data.repository.query.Param("ownerId") Long ownerId);

    // Check duplicate SKU for one user
    boolean existsByOwnerIdAndSku(Long ownerId, String sku);
}
