package com.invotracker.auth;

import com.invotracker.user.AppUser;
import com.invotracker.user.AppUserRepository;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/auth")
public class AuthController {
    private final AppUserRepository users;
    private final LoginAttemptService attempts;
    private final PasswordEncoder encoder;
    private final AuthenticationManager authenticationManager;
    private final HttpSessionSecurityContextRepository contextRepository = new HttpSessionSecurityContextRepository();

    public AuthController(AppUserRepository users, PasswordEncoder encoder, AuthenticationManager authenticationManager, LoginAttemptService attempts) {
        this.users = users; this.encoder = encoder; this.authenticationManager = authenticationManager; this.attempts = attempts;
    }

    public record RegisterRequest(@NotBlank @Size(max=120) String businessName,
                                 @NotBlank String industry,
                                 @Email @NotBlank @Size(max=190) String email,
                                 @NotBlank @Size(min=8, max=72) String password) {}
    public record LoginRequest(@Email @NotBlank String email, @NotBlank String password) {}

    @PostMapping("/register")
    @ResponseStatus(HttpStatus.CREATED)
    public Map<String, Object> register(@Valid @RequestBody RegisterRequest body) {
        if (users.existsByEmailIgnoreCase(body.email())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "An account with this email already exists");
        }
        String industry = body.industry().trim().toLowerCase();
        if (!java.util.Set.of("grocery", "small-business", "freelancer", "manufacturing", "transport", "healthcare", "other").contains(industry)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Choose a supported business type");
        }
        AppUser user = users.save(new AppUser(body.businessName().trim(), industry, body.email(), encoder.encode(body.password())));
        return Map.of("id", user.getId(), "businessName", user.getBusinessName(), "industry", user.getIndustry(), "email", user.getEmail());
    }

    @PostMapping("/login")
    public Map<String, String> login(@Valid @RequestBody LoginRequest body, HttpServletRequest request, HttpServletResponse response) {
        String key = request.getRemoteAddr() + ":" + body.email().toLowerCase().trim();
        attempts.check(key);
        Authentication authentication;
        try {
            authentication = authenticationManager.authenticate(new UsernamePasswordAuthenticationToken(body.email().toLowerCase().trim(), body.password()));
        } catch (org.springframework.security.core.AuthenticationException ex) {
            attempts.failed(key);
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid credentials");
        }
        attempts.success(key);
        request.getSession(true);
        request.changeSessionId();
        SecurityContext context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(authentication);
        SecurityContextHolder.setContext(context);
        request.getSession(true);
        contextRepository.saveContext(context, request, response);
        return Map.of("message", "Login successful");
    }

    @GetMapping("/me")
    public Map<String, Object> me(Authentication authentication) {
        AppUser user = users.findByEmailIgnoreCase(authentication.getName())
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
        return Map.of("id", user.getId(), "businessName", user.getBusinessName(), "industry", user.getIndustry(), "email", user.getEmail());
    }
}
