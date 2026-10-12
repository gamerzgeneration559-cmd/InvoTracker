
package com.invotracker.invoice;

import com.invotracker.user.AppUser;
import com.invotracker.user.AppUserRepository;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

@RestController
@RequestMapping("/api/products")
public class ProductController {

    private final ProductRepository products;
    private final AppUserRepository users;

    public ProductController(
            ProductRepository products,
            AppUserRepository users) {
        this.products = products;
        this.users = users;
    }

    // Identify the logged-in user
    private AppUser owner(Authentication auth) {
        return users.findByEmailIgnoreCase(auth.getName())
                .orElseThrow(() ->
                        new ResponseStatusException(
                                HttpStatus.UNAUTHORIZED));
    }

    // Return product data without exposing the owner entity
    public record ProductView(
            Long id,
            String name,
            String sku,
            double price,
            int stock,
            int lowStockLevel
    ) {
        static ProductView from(Product product) {
            return new ProductView(
                    product.getId(),
                    product.getName(),
                    product.getSku(),
                    product.getPrice(),
                    product.getStock(),
                    product.getLowStockLevel()
            );
        }
    }

    public record ProductRequest(
            String name,
            String sku,
            double price,
            int stock,
            int lowStockLevel
    ) {}

    // View only the logged-in user's products
    @GetMapping
    public List<ProductView> list(Authentication auth) {
        AppUser user = owner(auth);

        return products
                .findAllByOwnerIdOrderByNameAsc(user.getId())
                .stream()
                .map(ProductView::from)
                .toList();
    }

    // Add a product for the logged-in user
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ProductView create(
            @RequestBody ProductRequest request,
            Authentication auth) {

        AppUser user = owner(auth);

        if (request.name() == null ||
                request.name().isBlank() ||
                request.sku() == null ||
                request.sku().isBlank()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Product name and SKU are required");
        }

        if (!Double.isFinite(request.price()) ||
                request.price() < 0 ||
                request.stock() < 0 ||
                request.lowStockLevel() < 0) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Invalid product price or stock quantity");
        }

        String sku = request.sku().trim();

        if (products.existsByOwnerIdAndSku(user.getId(), sku)) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "Product SKU already exists");
        }

        Product product = new Product();
        product.setOwner(user);
        product.setName(request.name().trim());
        product.setSku(sku);
        product.setPrice(request.price());
        product.setStock(request.stock());
        product.setLowStockLevel(request.lowStockLevel());

        return ProductView.from(products.save(product));
    }
    @PutMapping("/{id}")
    public ProductView update(
            @PathVariable Long id,
            @RequestBody ProductRequest request,
            Authentication auth) {

        AppUser user = owner(auth);

        Product product = products.findByIdAndOwnerId(id, user.getId())
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND, "Product not found"));

        if (request.name() == null || request.name().isBlank()
                || request.sku() == null || request.sku().isBlank()) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "Name and SKU are required");
        }

        if (!Double.isFinite(request.price())
                || request.price() < 0
                || request.stock() < 0
                || request.lowStockLevel() < 0) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "Invalid price or stock");
        }

        String sku = request.sku().trim();

        products.findByOwnerIdAndSku(user.getId(), sku)
                .ifPresent(existing -> {
                    if (!existing.getId().equals(id)) {
                        throw new ResponseStatusException(
                                HttpStatus.CONFLICT, "SKU already exists");
                    }
                });

        product.setName(request.name().trim());
        product.setSku(sku);
        product.setPrice(request.price());
        product.setStock(request.stock());
        product.setLowStockLevel(request.lowStockLevel());

        return ProductView.from(products.save(product));
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(
            @PathVariable Long id,
            Authentication auth) {

        AppUser user = owner(auth);

        Product product = products.findByIdAndOwnerId(id, user.getId())
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND, "Product not found"));

        products.delete(product);
    }
}

