package com.invotracker.security;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
@RestControllerAdvice public class ApiErrorHandler {
 @ExceptionHandler(MethodArgumentNotValidException.class)
 public ResponseEntity<Map<String,String>> validation(MethodArgumentNotValidException ex){String message=ex.getBindingResult().getFieldErrors().stream().findFirst().map(e->e.getField()+": "+e.getDefaultMessage()).orElse("Invalid input");return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("message",message));}
}
