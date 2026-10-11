package com.invotracker.user;

import org.springframework.security.core.userdetails.*;
import org.springframework.stereotype.Service;

@Service
public class DatabaseUserDetailsService implements UserDetailsService {
    private final AppUserRepository users;
    public DatabaseUserDetailsService(AppUserRepository users) { this.users = users; }

    @Override
    public UserDetails loadUserByUsername(String username) throws UsernameNotFoundException {
        AppUser user = users.findByEmailIgnoreCase(username)
            .orElseThrow(() -> new UsernameNotFoundException("Account not found"));
        return User.withUsername(user.getEmail())
            .password(user.getPasswordHash())
            .roles("USER")
            .build();
    }
}
