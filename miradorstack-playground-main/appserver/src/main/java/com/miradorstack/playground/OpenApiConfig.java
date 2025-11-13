package com.miradorstack.playground;

import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.info.Contact;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class OpenApiConfig {

    @Bean
    public OpenAPI customOpenAPI() {
        return new OpenAPI()
                .info(new Info()
                        .title("MiradorStack Playground API")
                        .version("1.0.0")
                        .description("Demo API for MiradorStack Playground showcasing CRUD operations with dual storage")
                        .contact(new Contact()
                                .name("MiradorStack Team")
                                .email("support@miradorstack.com")));
    }
}