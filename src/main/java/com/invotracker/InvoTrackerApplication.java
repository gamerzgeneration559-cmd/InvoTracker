
package com.invotracker;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@EnableScheduling
@SpringBootApplication
public class InvoTrackerApplication {
    public static void main(String[] args) {
        SpringApplication.run(InvoTrackerApplication.class, args);
    }
}
