package com.invotracker.user;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "app_users", uniqueConstraints = @UniqueConstraint(columnNames = "email"))
public class AppUser {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @Column(nullable = false, length = 120)
    private String businessName;
    @Column(nullable = false, length = 40)
    private String industry;
    @Column(nullable = false, length = 190, unique = true)
    private String email;
    @Column(nullable = false)
    private String passwordHash;
    @Column(nullable = false)
    private Instant createdAt = Instant.now();

    protected AppUser() {}
    public AppUser(String businessName, String industry, String email, String passwordHash) {
        this.businessName = businessName;
        this.industry = industry;
        this.email = email.toLowerCase().trim();
        this.passwordHash = passwordHash;
    }
    public Long getId() { return id; }
    public String getBusinessName() { return businessName; }
    public String getIndustry() { return industry; }
    public String getEmail() { return email; }
    public String getPasswordHash() { return passwordHash; }
    public Instant getCreatedAt() { return createdAt; }
}
