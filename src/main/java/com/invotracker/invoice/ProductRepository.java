
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

    // Check duplicate SKU for one user
    boolean existsByOwnerIdAndSku(Long ownerId, String sku);
}
