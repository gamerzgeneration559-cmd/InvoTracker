package com.invotracker.auth;
import java.time.Instant;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
/** Single-instance rate limiter. Use Redis/shared storage for multi-instance production. */
@Service public class LoginAttemptService {
 private record Attempt(int count,long first){}
 private final ConcurrentHashMap<String,Attempt> attempts=new ConcurrentHashMap<>();
 public void check(String key){long now=Instant.now().getEpochSecond();Attempt a=attempts.get(key);if(a!=null&&now-a.first()<900&&a.count()>=8)throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,"Too many login attempts. Try again in 15 minutes.");}
 public void failed(String key){long now=Instant.now().getEpochSecond();attempts.compute(key,(k,a)->a==null||now-a.first()>=900?new Attempt(1,now):new Attempt(a.count()+1,a.first()));}
 public void success(String key){attempts.remove(key);}
}
